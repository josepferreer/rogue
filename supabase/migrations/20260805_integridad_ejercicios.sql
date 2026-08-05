-- Integridad referencial de exercise_id + limpieza de indices (auditoria A8/B5).
--
-- Situacion: routine_exercises, workout_sets, exercise_notes y
-- exercise_favorites guardan `exercise_id text` SIN clave ajena a `exercises`.
-- El comentario del esquema lo justificaba con que "el catalogo sigue sin
-- sembrar", pero la tabla exercises ya existe y esta poblada en produccion.
-- Hoy nada impide insertar un id inexistente, y getExerciseInfo degrada
-- mostrando el slug crudo ("press-banca") como nombre y clasificandolo como
-- "Core". Si algun dia cambia un slug del dataset, el historial de los usuarios
-- se rompe en silencio.
--
-- ⚠️ ESTE FICHERO NO SE APLICA A CIEGAS. Ejecutar primero el PASO 1 y revisar
-- que sale vacio. Si devuelve filas hay ids huerfanos: hay que decidir si se
-- corrigen o se siembra el catalogo que falte ANTES de crear las FK.

-- ============================================================
-- PASO 1 — Auditoria de ids huerfanos (debe devolver 0 filas)
-- ============================================================
--   select 'routine_exercises' as tabla, exercise_id, count(*) as filas
--     from routine_exercises re
--    where not exists (select 1 from exercises e where e.id = re.exercise_id)
--    group by exercise_id
--   union all
--   select 'workout_sets', exercise_id, count(*)
--     from workout_sets ws
--    where not exists (select 1 from exercises e where e.id = ws.exercise_id)
--    group by exercise_id
--   union all
--   select 'exercise_notes', exercise_id, count(*)
--     from exercise_notes en
--    where not exists (select 1 from exercises e where e.id = en.exercise_id)
--    group by exercise_id
--   union all
--   select 'exercise_favorites', exercise_id, count(*)
--     from exercise_favorites ef
--    where not exists (select 1 from exercises e where e.id = ef.exercise_id)
--    group by exercise_id
--   order by 1, 3 desc;
--
-- Si el catalogo esta vacio, sembrarlo antes:  node scripts/seed-supabase.mjs

-- ============================================================
-- PASO 2 — Claves ajenas
-- ============================================================
-- NOT VALID (mismo criterio que 20260722_integrity_checks.sql): se aplican a
-- filas nuevas y editadas sin fallar por datos antiguos. Cuando el PASO 1 salga
-- limpio, validar con `alter table X validate constraint Y`.
--
-- ON DELETE RESTRICT: borrar un ejercicio del catalogo que este en el historial
-- de alguien debe fallar de forma ruidosa, nunca arrastrar entrenos ya
-- registrados.

alter table routine_exercises
  add constraint routine_exercises_exercise_fk
  foreign key (exercise_id) references exercises (id) on delete restrict not valid;

alter table workout_sets
  add constraint workout_sets_exercise_fk
  foreign key (exercise_id) references exercises (id) on delete restrict not valid;

alter table exercise_notes
  add constraint exercise_notes_exercise_fk
  foreign key (exercise_id) references exercises (id) on delete restrict not valid;

alter table exercise_favorites
  add constraint exercise_favorites_exercise_fk
  foreign key (exercise_id) references exercises (id) on delete restrict not valid;

-- ============================================================
-- PASO 3 — Indices
-- ============================================================
-- B5: exercises tiene ~200 filas y ademas nadie la consulta por grupo ni por
-- equipo desde la app (el filtrado de la biblioteca es en cliente sobre el
-- dataset local). Dos indices que solo cuestan escrituras.
drop index if exists exercises_grupo_idx;
drop index if exists exercises_equipo_idx;

-- Las FK recien creadas necesitan indice en el lado que referencia, o cada
-- comprobacion hace un seq scan. workout_sets_exercise_idx ya existia; faltan
-- los otros tres.
create index if not exists routine_exercises_exercise_idx
  on routine_exercises (exercise_id);
create index if not exists exercise_notes_exercise_idx
  on exercise_notes (exercise_id);
create index if not exists exercise_favorites_exercise_idx
  on exercise_favorites (exercise_id);

-- El historial por ejercicio (ficha de ejercicio, prellenado del peso) consulta
-- las series de UN ejercicio de UN usuario ordenadas por fecha. Hoy eso pasa
-- por workout_sets_exercise_idx y luego filtra sesion a sesion.
create index if not exists workout_sets_exercise_session_idx
  on workout_sets (exercise_id, session_id);
