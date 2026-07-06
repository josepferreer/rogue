-- Schema minimo de la biblioteca de ejercicios (punto 1).
-- El schema completo (profiles, routines, workout_logs, strength_standards,
-- muscle_ranks...) llegara con el punto 3 del roadmap.

create table if not exists muscle_groups (
  id text primary key,          -- "pecho", "espalda", ...
  nombre text not null
);

create table if not exists equipment (
  id text primary key,          -- "barra", "mancuernas", ...
  nombre text not null
);

create table if not exists exercises (
  id text primary key,          -- slug en espanol, p.ej. "press-banca"
  nombre text not null,
  grupo text not null references muscle_groups (id),
  equipo text not null references equipment (id),
  dificultad text not null check (dificultad in ('principiante', 'intermedio', 'avanzado')),
  mecanica text not null check (mecanica in ('compuesto', 'aislamiento')),
  musculos_primarios text[] not null default '{}',
  musculos_secundarios text[] not null default '{}',
  instrucciones text[] not null default '{}',
  consejos text[] not null default '{}',
  fuente_id text not null,      -- id en free-exercise-db (imagenes)
  created_at timestamptz not null default now()
);

create index if not exists exercises_grupo_idx on exercises (grupo);
create index if not exists exercises_equipo_idx on exercises (equipo);

-- Lectura publica (catalogo), escritura solo via service role.
alter table muscle_groups enable row level security;
alter table equipment enable row level security;
alter table exercises enable row level security;

create policy "catalogo lectura publica" on muscle_groups for select using (true);
create policy "catalogo lectura publica" on equipment for select using (true);
create policy "catalogo lectura publica" on exercises for select using (true);
