-- Perfil de amigo (fase 2): al pulsar sobre un amigo se abre su perfil con
-- rangos + contadores. Sigue el mismo criterio de la fase 1: `profiles` NO
-- afloja su RLS ("solo tu propia fila"); todo lo que mira el perfil de OTRO
-- pasa por una funcion security definer con proyeccion explicita de columnas.
--
-- Que NO sale nunca de aqui: email, peso corporal, altura, objetivo, cargas en
-- kilos absolutos, comidas, trazas GPS. Las series se devuelven NORMALIZADAS
-- (peso / peso corporal), que es exactamente lo que consume el motor de rangos
-- (`src/lib/rank-engine.ts`: rel = 1RM estimado / peso corporal). Asi el
-- cliente puede calcular los rangos del amigo con el MISMO motor sin conocer
-- ni su peso corporal ni cuanto levanta en kg.

-- ============================================================
-- 1. Preferencias de privacidad
-- ============================================================
-- Por defecto en true: los rangos son la moneda social de la app y el amigo ya
-- ha aceptado explicitamente la amistad. Nada de esto es visible para quien no
-- sea amigo aceptado.
alter table profiles
  add column if not exists share_ranks boolean not null default true;
alter table profiles
  add column if not exists share_stats boolean not null default true;

-- ============================================================
-- 2. Helper: ¿somos amigos aceptados?
-- ============================================================
create or replace function is_friend_of(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_user_id)
        or (f.addressee_id = auth.uid() and f.requester_id = p_user_id))
  );
$$;

grant execute on function is_friend_of(uuid) to authenticated;

-- ============================================================
-- 3. Perfil completo de un amigo
-- ============================================================
-- Una sola llamada devuelve todo lo que pinta la pantalla, para no encadenar
-- round-trips desde el movil. Codigos: ok | not_authenticated | not_found |
-- not_friends.
--
-- `not_found` y `not_friends` se devuelven igual de escuetos a proposito: no
-- se filtra si el usuario existe cuando no hay amistad.
create or replace function friend_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_p profiles%rowtype;
  v_since timestamptz;
  v_anchor date;
  v_streak int := 0;
  v_stats jsonb := '{}'::jsonb;
  v_sets jsonb := '[]'::jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  select * into v_p from profiles
   where lower(username) = lower(trim(coalesce(p_username, '')));

  if not found or v_p.user_id = v_me then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select f.responded_at into v_since
    from friendships f
   where f.status = 'accepted'
     and ((f.requester_id = v_me and f.addressee_id = v_p.user_id)
       or (f.addressee_id = v_me and f.requester_id = v_p.user_id))
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_friends');
  end if;

  -- ---------- Contadores ----------
  if v_p.share_stats then
    -- Racha en SEMANAS con al menos un entreno. Se ancla en la semana actual
    -- o, si aun no ha entrenado esta semana, en la anterior (para no romper la
    -- racha de alguien un lunes por la manana).
    v_anchor := date_trunc('week', now())::date;
    if not exists (
      select 1 from workout_sessions s
       where s.user_id = v_p.user_id
         and date_trunc('week', s.date)::date = v_anchor
    ) then
      v_anchor := v_anchor - 7;
      if not exists (
        select 1 from workout_sessions s
         where s.user_id = v_p.user_id
           and date_trunc('week', s.date)::date = v_anchor
      ) then
        v_anchor := null;
      end if;
    end if;

    while v_anchor is not null and exists (
      select 1 from workout_sessions s
       where s.user_id = v_p.user_id
         and date_trunc('week', s.date)::date = v_anchor
    ) loop
      v_streak := v_streak + 1;
      v_anchor := v_anchor - 7;
    end loop;

    select jsonb_build_object(
             'workouts', count(*),
             'first_workout', min(s.date),
             'last_workout', max(s.date)
           )
      into v_stats
      from workout_sessions s
     where s.user_id = v_p.user_id;

    v_stats := v_stats || jsonb_build_object('week_streak', v_streak);

    select v_stats || jsonb_build_object(
             'cardio_sessions', count(*),
             'cardio_km', round(coalesce(sum(c.distance_km), 0), 1)
           )
      into v_stats
      from cardio_sessions c
     where c.user_id = v_p.user_id;
  end if;

  -- ---------- Series normalizadas para el motor de rangos ----------
  -- `w` = peso / peso corporal. El cliente llama a computeMuscleRanks con
  -- bodyweightKg = 1, porque estimate1RM es lineal en el peso:
  --   estimate1RM(w/bw, reps) / 1 == estimate1RM(w, reps) / bw
  -- Tope de 5000 series (las mas recientes): cubre de sobra la ventana de
  -- volumen de 6 semanas y evita respuestas gigantes en cuentas muy veteranas.
  if v_p.share_ranks and v_p.bodyweight_kg > 0 then
    select coalesce(jsonb_agg(x order by x->>'d' desc), '[]'::jsonb)
      into v_sets
      from (
        select jsonb_build_object(
                 's', s.id,
                 'd', s.date,
                 'e', ws.exercise_id,
                 'w', round(ws.weight_kg / v_p.bodyweight_kg, 4),
                 'r', ws.reps
               ) as x
          from workout_sets ws
          join workout_sessions s on s.id = ws.session_id
         where s.user_id = v_p.user_id
         order by s.date desc
         limit 5000
      ) t;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'user_id', v_p.user_id,
    'username', v_p.username,
    'display_name', public_display_name(v_p),
    'sex', v_p.sex,
    'friends_since', v_since,
    'share_ranks', v_p.share_ranks,
    'share_stats', v_p.share_stats,
    'stats', v_stats,
    'sets', v_sets
  );
end;
$$;

grant execute on function friend_profile(text) to authenticated;
