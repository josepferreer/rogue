-- Guardado ATOMICO de una rutina (rutina + dias + ejercicios) en una transaccion.
--
-- Problema que resuelve (auditoria Pilar 1, C2): persistRoutineDays hacia
-- 1 + 2N peticiones HTTP sueltas -- un delete de todos los dias seguido de un
-- insert por dia y otro por su lista de ejercicios. Si la red se cortaba
-- despues del delete, la rutina del usuario quedaba VACIA o a medias en
-- servidor mientras la pantalla seguia mostrandola entera (estado optimista).
-- Si los 3 reintentos de syncWrite fallaban, al reabrir la app el usuario se
-- encontraba la rutina de demo en lugar de la suya.
--
-- Es el mismo fallo que ya ocurrio con los entrenos el 23/07/2026 y que se
-- resolvio con log_workout; aqui se aplica el mismo patron a las rutinas.
--
-- Ademas (C2/M2) se PRESERVAN los ids de dia que manda el cliente cuando son
-- UUID validos, en vez de regenerarlos en cada guardado. Antes cada save creaba
-- ids nuevos y ninguna entidad podia referenciar un dia de rutina de forma
-- estable. Los ids que no son UUID (dias recien creados en el editor) reciben
-- uno nuevo, que el cliente recoge de la respuesta.
--
-- security invoker: corre como el usuario que llama, las politicas RLS se
-- aplican con normalidad y user_id sale de auth.uid(), nunca de un parametro.

create or replace function save_routine(
  p_routine_id uuid default null,
  p_name       text default 'Mi rutina',
  p_days       jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_routine_id uuid := p_routine_id;
  v_day        jsonb;
  v_day_id     uuid;
  v_pos        int := 0;
  v_day_ids    jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- Resolucion de la rutina: la que venga por parametro, si no la primera del
  -- usuario, si no una nueva. Misma logica que ensureRoutineId en cliente pero
  -- dentro de la transaccion, para que dos guardados simultaneos no creen dos.
  if v_routine_id is null then
    select id into v_routine_id
      from routines
     where user_id = v_user
     order by created_at
     limit 1;
  end if;

  if v_routine_id is null then
    insert into routines (user_id, name)
    values (v_user, coalesce(nullif(p_name, ''), 'Mi rutina'))
    returning id into v_routine_id;
  else
    -- La RLS ya lo impediria, pero fallamos explicito y con mensaje claro.
    perform 1 from routines where id = v_routine_id and user_id = v_user;
    if not found then
      raise exception 'routine % not found for current user', v_routine_id;
    end if;
    update routines
       set name       = coalesce(nullif(p_name, ''), name),
           updated_at = now()
     where id = v_routine_id;
  end if;

  -- Reemplazo completo de los dias (el ON DELETE CASCADE arrastra sus
  -- ejercicios). Idempotente: repetir la funcion entera deja el mismo estado.
  delete from routine_days where routine_id = v_routine_id;

  for v_day in
    select value from jsonb_array_elements(coalesce(p_days, '[]'::jsonb))
  loop
    -- Se conserva el id del cliente solo si es un UUID bien formado; los dias
    -- nuevos del editor traen ids cortos y reciben uno generado aqui.
    v_day_id := case
      when coalesce(v_day->>'id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (v_day->>'id')::uuid
      else gen_random_uuid()
    end;

    insert into routine_days (id, routine_id, position, label, focus, weekdays)
    values (
      v_day_id,
      v_routine_id,
      v_pos,
      coalesce(v_day->>'label', ''),
      coalesce(v_day->>'focus', ''),
      coalesce(
        (select array_agg(value::int)
           from jsonb_array_elements_text(
             case jsonb_typeof(v_day->'weekdays')
               when 'array' then v_day->'weekdays'
               else '[]'::jsonb
             end
           )),
        '{}'::int[]
      )
    );

    insert into routine_exercises (
      routine_day_id, exercise_id, position, sets, reps, rest_sec, suggested_kg
    )
    select v_day_id,
           e->>'exerciseId',
           (e_pos - 1)::int,
           coalesce((e->>'sets')::int, 3),
           coalesce((e->>'reps')::int, 10),
           coalesce((e->>'restSec')::int, 90),
           coalesce((e->>'suggestedKg')::numeric, 0)
      from jsonb_array_elements(
             case jsonb_typeof(v_day->'exercises')
               when 'array' then v_day->'exercises'
               else '[]'::jsonb
             end
           ) with ordinality as t(e, e_pos)
     where nullif(e->>'exerciseId', '') is not null;

    -- Se devuelven los ids definitivos en el mismo orden que llegaron, para
    -- que el cliente fije los suyos y el siguiente guardado ya los conserve.
    v_day_ids := v_day_ids || to_jsonb(v_day_id::text);
    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object('routine_id', v_routine_id, 'day_ids', v_day_ids);
end;
$$;

grant execute on function save_routine(uuid, text, jsonb) to authenticated;

-- ============================================================
-- A7 — log_workout pasa a registrar la rutina de origen
-- ============================================================
-- workout_sessions.routine_id nunca se rellenaba: el RPC no lo recibia. Por eso
-- el trigger touch_routine_last_used no se disparaba jamas y routines.last_used_at
-- era siempre NULL. Se pierde ademas la trazabilidad entreno -> rutina, base de
-- cualquier analitica de adherencia.
--
-- p_routine_id va al final y SIN valor por defecto, a proposito: la firma de 6
-- parametros se mantiene viva (ver mas abajo) y, si este parametro tuviera
-- default, una llamada con 6 argumentos encajaria en ambas sobrecargas y
-- Postgres la rechazaria por ambigua ("function is not unique").

create or replace function log_workout(
  p_session_id   uuid,
  p_day_label    text,
  p_date         timestamptz,
  p_duration_sec int,
  p_sets         jsonb,
  p_notes        jsonb,
  p_routine_id   uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into workout_sessions (id, user_id, routine_id, day_label, date, duration_sec)
  values (p_session_id, v_user, p_routine_id, p_day_label, p_date, p_duration_sec)
  on conflict (id) do update
    set day_label    = excluded.day_label,
        date         = excluded.date,
        duration_sec = excluded.duration_sec,
        routine_id   = coalesce(excluded.routine_id, workout_sessions.routine_id);

  delete from workout_sets where session_id = p_session_id;

  insert into workout_sets (session_id, exercise_id, categoria, weight_kg, reps, position)
  select p_session_id,
         s->>'exercise_id',
         s->>'categoria',
         (s->>'weight_kg')::numeric,
         (s->>'reps')::int,
         (s->>'position')::int
  from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) as s;

  insert into exercise_notes (
    id, user_id, session_id, exercise_id, flag, note, weight_kg, acknowledged, created_at
  )
  select (n->>'id')::uuid,
         v_user,
         p_session_id,
         n->>'exercise_id',
         nullif(n->>'flag', ''),
         nullif(n->>'note', ''),
         nullif(n->>'weight_kg', '')::numeric,
         coalesce((n->>'acknowledged')::boolean, false),
         coalesce((n->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as n
  on conflict (id) do update
    set flag         = excluded.flag,
        note         = excluded.note,
        weight_kg    = excluded.weight_kg,
        acknowledged = excluded.acknowledged;
end;
$$;

grant execute on function log_workout(uuid, text, timestamptz, int, jsonb, jsonb, uuid)
  to authenticated;

-- La firma de 6 parametros SE MANTIENE VIVA, delegando en la de 7.
--
-- Es tentador borrarla por limpieza, pero seria un fallo de despliegue: cliente
-- y base de datos no se actualizan a la vez. Sin este puente hay dos ventanas
-- en las que se pierden entrenos de usuarios reales:
--   1. Si el codigo nuevo llega antes que la migracion, llama a la firma de 7,
--      que aun no existe -> "No se pudo guardar el entreno".
--   2. Si la migracion llega antes, cualquier cliente viejo todavia en uso
--      --una PWA cacheada, o el APK apuntando al deploy anterior, que no se
--      puede forzar a actualizar-- llama a la de 6 y se queda sin ella.
-- Con las dos firmas vivas el orden de despliegue deja de importar. Se puede
-- retirar la de 6 cuando no queden clientes antiguos en circulacion.

create or replace function log_workout(
  p_session_id   uuid,
  p_day_label    text,
  p_date         timestamptz,
  p_duration_sec int,
  p_sets         jsonb default '[]'::jsonb,
  p_notes        jsonb default '[]'::jsonb
) returns void
language sql
security invoker
set search_path = public
as $$
  select log_workout(p_session_id, p_day_label, p_date, p_duration_sec,
                     p_sets, p_notes, null::uuid);
$$;

grant execute on function log_workout(uuid, text, timestamptz, int, jsonb, jsonb)
  to authenticated;
