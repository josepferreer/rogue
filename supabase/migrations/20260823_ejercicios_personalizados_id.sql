-- Acota el id de los ejercicios personalizados.
--
-- La politica de INSERT de 20260822_ejercicios_personalizados.sql solo exigia
-- `owner_id = auth.uid() and fuente_id is null`, pero NO acotaba el `id`. Como
-- `exercises.id` es la PK compartida con el catalogo publico, un usuario podia
-- insertar un ejercicio propio con id "press-banca" y:
--   1. ocupar ese slug para siempre (la PK ya estaria cogida), y
--   2. reventar `node scripts/seed-supabase.mjs`, que hace upsert por id: el
--      seed pisaria o chocaria con la fila privada de ese usuario.
--
-- La app ya genera todos los ids con el prefijo "custom-" (buildCustomId en
-- src/lib/exercises/custom.ts), asi que esto solo formaliza en la base algo que
-- el cliente ya cumple. Y lo importante: la base deja de fiarse del cliente.

-- ============================================================
-- PASO 0 — Ningun ejercicio propio existente puede incumplirlo
-- ============================================================
do $$
declare
  v_malos int;
begin
  select count(*) into v_malos
    from exercises
    where owner_id is not null and id not like 'custom-%';
  if v_malos > 0 then
    raise exception
      'Hay % ejercicios propios con id fuera del prefijo custom-. Renombralos antes.', v_malos;
  end if;
end $$;

-- ============================================================
-- PASO 1 — Politica de INSERT mas estricta
-- ============================================================
drop policy if exists "el usuario crea sus ejercicios" on exercises;

create policy "el usuario crea sus ejercicios" on exercises
  for insert with check (
    owner_id = auth.uid()
    and fuente_id is null
    and id like 'custom-%'
  );

-- El UPDATE tampoco puede usarse para colarse en el espacio de ids publico
-- ni para apropiarse de una fila del catalogo.
drop policy if exists "el usuario edita sus ejercicios" on exercises;

create policy "el usuario edita sus ejercicios" on exercises
  for update
  using (owner_id = auth.uid() and id like 'custom-%')
  with check (owner_id = auth.uid() and fuente_id is null and id like 'custom-%');

drop policy if exists "el usuario borra sus ejercicios" on exercises;

create policy "el usuario borra sus ejercicios" on exercises
  for delete using (owner_id = auth.uid() and id like 'custom-%');

-- ============================================================
-- PASO 2 — Verificacion
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'exercises'
       and policyname = 'el usuario crea sus ejercicios'
       and with_check like '%custom-%'
  ) then
    raise exception 'La politica de INSERT no quedo aplicada';
  end if;
  raise notice 'OK. Ids de ejercicios personalizados acotados a custom-%%.';
end $$;
