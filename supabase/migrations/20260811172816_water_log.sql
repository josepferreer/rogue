create table if not exists public.water_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  water_ml integer not null default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  primary key (user_id, date)
);

alter table public.water_log enable row level security;

create policy "Users can view their own water log."
  on public.water_log for select
  using (auth.uid() = user_id);

create policy "Users can insert their own water log."
  on public.water_log for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own water log."
  on public.water_log for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own water log."
  on public.water_log for delete
  using (auth.uid() = user_id);

-- Agregamos índice por fecha (aunque la PK ya cubre esto, lo dejamos por consistencia si fuera necesario)
create index if not exists water_log_user_date_idx on public.water_log (user_id, date);
