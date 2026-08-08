-- Historial de peso corporal.
--
-- Hasta ahora `profiles.bodyweight_kg` era un unico valor que se sobrescribia
-- en cada actualizacion: no habia forma de responder "cuanto peso he perdido
-- este mes" porque el dato anterior se perdia. Esta tabla guarda un pesaje por
-- dia y deja `profiles.bodyweight_kg` como "peso actual" (lo que consumen las
-- estimaciones de cardio y el motor de 1RM), sincronizado con el ultimo pesaje.

create table if not exists body_weight_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Un pesaje por dia: pesarse dos veces el mismo dia sobrescribe, que es el
  -- comportamiento util (la bascula de la manana manda).
  date date not null,
  weight_kg numeric not null check (weight_kg > 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- El caso de lectura es siempre "mis pesajes, del mas reciente al mas antiguo".
create index if not exists body_weight_log_user_date_idx
  on body_weight_log (user_id, date desc);

alter table body_weight_log enable row level security;

create policy "el usuario ve sus pesajes" on body_weight_log
  for select using (auth.uid() = user_id);
create policy "el usuario anade sus pesajes" on body_weight_log
  for insert with check (auth.uid() = user_id);
create policy "el usuario edita sus pesajes" on body_weight_log
  for update using (auth.uid() = user_id);
create policy "el usuario borra sus pesajes" on body_weight_log
  for delete using (auth.uid() = user_id);

-- Semilla: el peso actual del perfil pasa a ser el primer pesaje, para que el
-- historial no arranque vacio. `on conflict do nothing` la hace reejecutable.
insert into body_weight_log (user_id, date, weight_kg)
select user_id, current_date, bodyweight_kg
  from profiles
 where bodyweight_kg > 0
on conflict (user_id, date) do nothing;
