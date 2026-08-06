-- Pilar 3 (Nutricion). Ejecutar ANTES de desplegar el codigo; el cliente
-- degrada solo si aun no esta aplicada (avisa por consola y usa el formato
-- viejo), pero el orden correcto es BD primero.
--
-- 1. meal_entries.breakdown: el desglose por ingrediente de un plato viajaba
--    serializado dentro de `barcode` con el prefijo '__plato__:'. Columna
--    propia, y `barcode` vuelve a significar codigo de barras.
-- 2. profiles.pantry_seeded: la despensa demo se sembraba cada vez que la del
--    usuario estaba vacia, asi que vaciarla a mano la repoblaba sola.

-- ============================================================
-- 1. Desglose de platos en su propia columna
-- ============================================================

alter table meal_entries add column if not exists breakdown jsonb;

-- Backfill fila a fila: un JSON corrupto de una entrada no puede abortar la
-- migracion entera (se deja como estaba y se avisa).
do $$
declare r record;
begin
  for r in
    select id, substring(barcode from 11) as payload
    from meal_entries
    where barcode like '\_\_plato\_\_:%'
  loop
    begin
      update meal_entries
         set breakdown = r.payload::jsonb,
             barcode = null
       where id = r.id;
    exception when others then
      raise warning 'meal_entries %: desglose ilegible, se deja en barcode', r.id;
    end;
  end loop;
end $$;

-- El cliente siempre escribe un array; el check protege de datos raros.
do $$
begin
  alter table meal_entries
    add constraint meal_breakdown_is_array
    check (breakdown is null or jsonb_typeof(breakdown) = 'array') not valid;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 2. Marca de despensa ya sembrada
-- ============================================================

alter table profiles
  add column if not exists pantry_seeded boolean not null default false;

-- Quien ya tiene despensa no debe volver a recibir la demo.
update profiles p
   set pantry_seeded = true
 where not p.pantry_seeded
   and (exists (select 1 from pantry_foods f where f.user_id = p.user_id)
     or exists (select 1 from pantry_dishes d where d.user_id = p.user_id));
