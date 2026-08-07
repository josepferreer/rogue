-- Eliminacion del sistema de Rangos Musculares.
--
-- Los rangos se calculaban integramente en cliente (src/lib/rank-engine.ts)
-- a partir de workout_sessions / workout_sets. Las unicas huellas en la BD son
-- 4 columnas de `profiles` que se anadieron en su dia para un ranking entre
-- amigos que nunca se implemento: ningun punto del codigo las lee ni las
-- escribe (verificado sobre src/, supabase/migrations/ y scripts/).
--
-- NO se toca `muscle_groups`: pese al nombre es el catalogo de categorias de
-- la biblioteca de ejercicios (FK de exercises.grupo, con indice, RLS y seed
-- propio en scripts/seed-supabase.mjs). Nada que ver con los rangos.
--
-- NO se toca `share_stats`: es de compartir estadisticas, no rangos.
--
-- ============================================================
-- PASO 1 — Verificacion previa (ejecutar ANTES, revisar que sale vacio)
-- ============================================================
-- Estas columnas no deberian tener dependencias, pero el esquema en
-- produccion ha derivado del repo, asi que se comprueba antes de borrar.
-- Si alguna consulta devuelve filas, PARA y revisa esa dependencia.

-- 1a. Vistas que dependan de las columnas:
--   select distinct dependent.relname
--   from pg_depend d
--   join pg_rewrite r on r.oid = d.objid
--   join pg_class dependent on dependent.oid = r.ev_class
--   join pg_attribute a
--     on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
--   where d.refobjid = 'public.profiles'::regclass
--     and a.attname in ('share_ranks','rank_tier','rank_division','rank_updated_at');

-- 1b. Politicas RLS que mencionen las columnas (en cualquier tabla):
--   select schemaname, tablename, policyname, qual, with_check
--   from pg_policies
--   where coalesce(qual,'') || coalesce(with_check,'') ~ 'share_ranks|rank_tier|rank_division|rank_updated_at';

-- 1c. Funciones/triggers que las mencionen:
--   select n.nspname, p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname not in ('pg_catalog','information_schema')
--     and p.prosrc ~ 'share_ranks|rank_tier|rank_division|rank_updated_at';

-- 1d. Indices sobre esas columnas (se irian solos con el DROP COLUMN, pero
--     conviene saber que existen):
--   select indexname, indexdef from pg_indexes
--   where tablename = 'profiles'
--     and indexdef ~ 'share_ranks|rank_tier|rank_division|rank_updated_at';

-- ============================================================
-- PASO 2 — Eliminacion
-- ============================================================
-- Sin CASCADE a proposito: si algo dependiera de estas columnas queremos que
-- falle de forma ruidosa, no que arrastre en silencio una vista o politica.
-- Los CHECK constraints inline (rank_tier / rank_division) caen con la columna.

begin;

alter table public.profiles drop column if exists share_ranks;
alter table public.profiles drop column if exists rank_tier;
alter table public.profiles drop column if exists rank_division;
alter table public.profiles drop column if exists rank_updated_at;

commit;

-- ============================================================
-- PASO 3 — Comprobacion posterior (debe devolver 0 filas)
-- ============================================================
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name in ('share_ranks','rank_tier','rank_division','rank_updated_at');
