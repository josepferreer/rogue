-- Agregados de entrenamiento calculados en Postgres (auditoria Pilar 1, C5).
--
-- Problema: RogueProvider se descargaba TODAS las sesiones del usuario con
-- TODAS sus series en cada arranque, sin ventana ni limite. Un usuario a 4
-- entrenos por semana genera ~5.200 series al ano; a los dos anos son varios MB
-- por arranque, en memoria del WebView, en cada apertura de la app.
--
-- La razon de traerlo todo era el motor de rangos, que ya no existe. Lo que
-- queda que de verdad necesita el historial COMPLETO son solo cuatro cifras
-- agregadas, y agregar es trabajo de la base de datos, no del movil:
--
--   total_sessions        numero de entrenos (tarjeta del perfil)
--   timed_count           cuantos tienen cronometro (para la media)
--   avg_duration_sec      duracion media (tarjeta de la home)
--   longest_duration_sec  entreno mas largo
--   sets_by_category      series por categoria (sugerencias de la home)
--   last_by_exercise      ultimo peso y reps de cada ejercicio (prellenado)
--
-- Una sola llamada, un solo viaje. `stable` permite a Postgres cachear el
-- resultado dentro de la misma consulta. security invoker: la RLS de
-- workout_sessions se sigue aplicando, y ademas se filtra por auth.uid()
-- explicitamente para que el plan use el indice (user_id, date desc).

create or replace function workout_stats()
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  with mis_sesiones as (
    select id, duration_sec, date
      from workout_sessions
     where user_id = auth.uid()
  ),
  mis_series as (
    select ws.exercise_id, ws.categoria, ws.weight_kg, ws.reps, ws.position, s.date
      from workout_sets ws
      join mis_sesiones s on s.id = ws.session_id
  ),
  duraciones as (
    select count(*) as n,
           coalesce(round(avg(duration_sec)), 0) as media,
           coalesce(max(duration_sec), 0) as maxima
      from mis_sesiones
     where duration_sec is not null and duration_sec > 0
  ),
  por_categoria as (
    select categoria, count(*) as n
      from mis_series
     group by categoria
  ),
  -- distinct on + order by fecha desc: la fila mas reciente de cada ejercicio.
  ultimo as (
    select distinct on (exercise_id)
           exercise_id, weight_kg, reps
      from mis_series
     order by exercise_id, date desc, position desc
  )
  select jsonb_build_object(
    'total_sessions',       (select count(*) from mis_sesiones),
    'timed_count',          (select n from duraciones),
    'avg_duration_sec',     (select media from duraciones),
    'longest_duration_sec', (select maxima from duraciones),
    'sets_by_category',     coalesce(
                              (select jsonb_object_agg(categoria, n) from por_categoria),
                              '{}'::jsonb),
    'last_by_exercise',     coalesce(
                              (select jsonb_object_agg(
                                        exercise_id,
                                        jsonb_build_object('weightKg', weight_kg, 'reps', reps))
                                 from ultimo),
                              '{}'::jsonb)
  );
$$;

grant execute on function workout_stats() to authenticated;

-- El calculo de `ultimo` ordena por (exercise_id, date desc). El indice de
-- workout_sets por exercise_id ya existe; el join contra la fecha lo resuelve
-- workout_sessions_user_idx (user_id, date desc), que tambien esta.
