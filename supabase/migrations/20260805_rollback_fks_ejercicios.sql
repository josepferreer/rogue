-- ROLLBACK URGENTE de las claves ajenas de exercise_id.
--
-- Aplicar TAL CUAL en el SQL Editor si guardar entrenos esta fallando con:
--   insert or update on table "workout_sets" violates foreign key constraint
--   "workout_sets_exercise_fk" - Key is not present in table "exercises".
--
-- Causa: 20260805_integridad_ejercicios.sql se aplico con la tabla `exercises`
-- vacia o desincronizada respecto al dataset local (src/data/exercises.es.json),
-- que es de donde la app saca los ids. NOT VALID solo exime a las filas que ya
-- existian: los INSERT nuevos si se validan, asi que cada entreno nuevo se
-- rechaza.
--
-- Esto restaura el comportamiento anterior (sin integridad referencial, pero
-- funcionando). Para volver a ponerlas bien, ver el final del fichero.

alter table workout_sets        drop constraint if exists workout_sets_exercise_fk;
alter table routine_exercises   drop constraint if exists routine_exercises_exercise_fk;
alter table exercise_notes      drop constraint if exists exercise_notes_exercise_fk;
alter table exercise_favorites  drop constraint if exists exercise_favorites_exercise_fk;

-- Los indices no molestan y son utiles: se quedan.

-- ============================================================
-- Como reponerlas correctamente, cuando toque
-- ============================================================
-- 1. Sembrar el catalogo para que `exercises` tenga los mismos ids que usa la
--    app (los del dataset local):
--
--       node scripts/seed-supabase.mjs
--
-- 2. Comprobar que ya no queda ningun id huerfano. DEBE devolver 0 filas:
--
--       select 'workout_sets' as tabla, exercise_id, count(*)
--         from workout_sets ws
--        where not exists (select 1 from exercises e where e.id = ws.exercise_id)
--        group by exercise_id
--       union all
--       select 'routine_exercises', exercise_id, count(*)
--         from routine_exercises re
--        where not exists (select 1 from exercises e where e.id = re.exercise_id)
--        group by exercise_id
--       union all
--       select 'exercise_notes', exercise_id, count(*)
--         from exercise_notes en
--        where not exists (select 1 from exercises e where e.id = en.exercise_id)
--        group by exercise_id
--       union all
--       select 'exercise_favorites', exercise_id, count(*)
--         from exercise_favorites ef
--        where not exists (select 1 from exercises e where e.id = ef.exercise_id)
--        group by exercise_id;
--
-- 3. Solo entonces, volver a aplicar 20260805_integridad_ejercicios.sql, que
--    ahora aborta solo si el catalogo no esta listo.
