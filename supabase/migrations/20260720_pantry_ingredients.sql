-- Migracion: lista de ingredientes informativa para alimentos (productos
-- listos escaneados por codigo de barras). Aditiva: no borra ni cambia datos
-- existentes. Pegar y ejecutar en el SQL Editor del dashboard de Supabase.

-- Nombres de ingredientes tal cual los da Open Food Facts (solo informativo;
-- las macros del producto ya van en kcal/protein/carbs/fat por 100 g). Los
-- gramos por ingrediente se dejan en blanco (OFF no los proporciona).
alter table pantry_foods
  add column if not exists ingredients jsonb not null default '[]';
