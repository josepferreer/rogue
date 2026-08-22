-- Ejercicios personalizados del usuario.
--
-- Por que van en la tabla `exercises` y no en una tabla aparte:
-- routine_exercises, workout_sets, exercise_notes y exercise_favorites tienen
-- FK a exercises(id) desde 20260805_integridad_ejercicios.sql. Estan creadas
-- NOT VALID, lo que exime a las filas viejas pero NO a los INSERT nuevos. Un
-- ejercicio que viviera fuera de `exercises` reventaria al guardar la primera
-- serie. Con owner_id dentro de la misma tabla, las FK siguen valiendo tal cual.
--
-- ⚠️ Esta migracion CAMBIA la RLS del catalogo. Hasta hoy era
-- `for select using (true)`: lectura publica total. Si se metieran filas con
-- owner_id bajo esa politica, cada usuario veria los ejercicios privados de
-- todos los demas. El PASO 2 la sustituye ANTES de que exista ninguna fila con
-- owner_id, no despues.

-- ============================================================
-- PASO 0 — Guarda de seguridad
-- ============================================================
-- Esta migracion NO exige catalogo sembrado: solo cambia columnas y politicas.
-- El seed puede ir despues (y de hecho tiene que ir despues, porque hasta que
-- fuente_id no sea nullable no entran los 3 ejercicios sin imagen).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'exercises' and column_name = 'owner_id') then
    raise notice 'owner_id ya existe: la migracion es idempotente, continuo.';
  end if;
end $$;

-- ============================================================
-- PASO 1 — Columnas
-- ============================================================

-- null = catalogo publico (lo que hay hoy). No null = ejercicio de ese usuario.
alter table exercises
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

-- Un ejercicio propio no tiene imagenes en free-exercise-db.
alter table exercises
  alter column fuente_id drop not null;

-- Un ejercicio propio NUNCA tiene imagen de free-exercise-db.
-- Al reves no se puede exigir: 3 ejercicios del catalogo publico (remo-pendlay,
-- peso-muerto-rumano-mancuernas y elevaciones-laterales-polea-trasera) tampoco
-- tienen equivalente en la fuente, asi que un publico SI puede ir sin imagen.
alter table exercises
  drop constraint if exists exercises_fuente_id_check;
alter table exercises
  add constraint exercises_fuente_id_check check (
    owner_id is null or fuente_id is null
  );

create index if not exists exercises_owner_idx on exercises (owner_id);

-- Dos usuarios pueden llamar igual a su ejercicio; uno no puede duplicarselo.
create unique index if not exists exercises_owner_nombre_idx
  on exercises (owner_id, lower(nombre))
  where owner_id is not null;

-- ============================================================
-- PASO 2 — RLS (sustituye la lectura publica total)
-- ============================================================

drop policy if exists "catalogo lectura publica" on exercises;

create policy "catalogo publico y ejercicios propios" on exercises
  for select using (owner_id is null or owner_id = auth.uid());

create policy "el usuario crea sus ejercicios" on exercises
  for insert with check (owner_id = auth.uid() and fuente_id is null);

create policy "el usuario edita sus ejercicios" on exercises
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- on delete restrict en las FK: si el ejercicio esta usado en un entreno o una
-- rutina, el delete falla y la app lo traduce a un mensaje. Preferimos eso a
-- borrar en cascada el historial del usuario.
create policy "el usuario borra sus ejercicios" on exercises
  for delete using (owner_id = auth.uid());

-- ============================================================
-- PASO 3 — Verificacion
-- ============================================================
do $$
declare
  v_malos int;
begin
  select count(*) into v_malos
    from exercises where owner_id is not null and fuente_id is not null;
  if v_malos > 0 then
    raise exception 'Hay % ejercicios propios con fuente_id: no deberia pasar', v_malos;
  end if;
  raise notice 'OK. Ejercicios personalizados habilitados.';
end $$;
