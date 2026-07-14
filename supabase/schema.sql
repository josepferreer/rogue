-- Schema completo de Rogue.
-- Sustituye por completo cualquier version anterior de este archivo.
--
-- Cubre: login (Supabase Auth), perfil + preferencias por usuario,
-- catalogo de ejercicios (publico, solo lectura), rutinas propias,
-- historial de entrenamientos, favoritos y ejercicios recientes,
-- e historial de cardio con GPS.
--
-- Mientras no haya credenciales de Supabase, la app sigue en modo demo
-- (localStorage + src/data/exercises.es.json). Ver src/lib/exercises/repo.ts
-- y scripts/seed-supabase.mjs.

-- ============================================================
-- 1. Catalogo de ejercicios (publico, solo lectura salvo service role)
-- ============================================================

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

alter table muscle_groups enable row level security;
alter table equipment enable row level security;
alter table exercises enable row level security;

create policy "catalogo lectura publica" on muscle_groups for select using (true);
create policy "catalogo lectura publica" on equipment for select using (true);
create policy "catalogo lectura publica" on exercises for select using (true);

-- ============================================================
-- 2. Perfil y preferencias (1 fila por usuario, ligada a auth.users)
-- ============================================================

create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Identificador unico elegido en el registro (login alternativo al email,
  -- se muestra en vez del email en el resto de la app). "name" es el nombre
  -- real/visible, se sigue pidiendo en el onboarding.
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  -- Copia del email de auth.users, para poder resolver username -> email al
  -- iniciar sesion sin tener que exponer toda la tabla de usuarios.
  email text not null,
  name text not null default '',
  sex text not null default 'hombre' check (sex in ('hombre', 'mujer')),
  bodyweight_kg numeric not null default 75,
  height_cm numeric not null default 175,
  goal text not null default '',
  onboarded boolean not null default false,
  -- Preferencias (antes en un objeto Preferences aparte; van en la misma fila
  -- porque siempre se leen/escriben juntas con el resto del perfil).
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  -- Que identificador se muestra en saludos/cabeceras: el nombre real o el username.
  display_name_source text not null default 'name' check (display_name_source in ('name', 'username')),
  notify_reminders boolean not null default true,
  notify_rest_end boolean not null default true,
  notify_weekly_summary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicidad de username sin distinguir mayusculas/minusculas.
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

alter table profiles enable row level security;

create policy "el usuario ve su propio perfil" on profiles
  for select using (auth.uid() = user_id);
create policy "el usuario edita su propio perfil" on profiles
  for update using (auth.uid() = user_id);
create policy "el usuario crea su propio perfil" on profiles
  for insert with check (auth.uid() = user_id);

-- Crea la fila de perfil automaticamente al registrarse. El username viaja
-- en las opciones de supabase.auth.signUp({ options: { data: { username } } }).
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, username, email)
  values (new.id, new.raw_user_meta_data ->> 'username', new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- La resolucion username -> email para el login (supabase.auth.signInWithPassword
-- solo acepta email) se hace desde el servidor con la clave secreta
-- (src/lib/supabase/admin.ts), NO con una funcion publica: una funcion
-- callable con la clave anonima permitiria a cualquiera enumerar usernames
-- validos y cosechar los emails asociados.

-- ============================================================
-- 3. Rutinas propias (editor de rutinas, drag & drop)
-- ============================================================

create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Mi rutina',
  is_favorite boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists routine_days (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines (id) on delete cascade,
  position int not null,
  label text not null,
  focus text not null default '',
  -- Dias de la semana en los que toca (convencion getDay(): 0=domingo..6=sabado).
  -- Vacio = sin dia fijo (solo "entreno libre").
  weekdays int[] not null default '{}'
);

create table if not exists routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_day_id uuid not null references routine_days (id) on delete cascade,
  -- Sin FK a exercises: el catalogo (tabla exercises) sigue sin sembrar,
  -- la app lee ejercicios de src/data/exercises.es.json (ver repo.ts). El id
  -- solo necesita coincidir con el del dataset local.
  exercise_id text not null,
  position int not null,
  sets int not null default 3,
  reps int not null default 10,
  rest_sec int not null default 90,
  suggested_kg numeric not null default 0  -- 0 = peso corporal
);

create index if not exists routines_user_idx on routines (user_id);
create index if not exists routine_days_routine_idx on routine_days (routine_id);
create index if not exists routine_exercises_day_idx on routine_exercises (routine_day_id);

alter table routines enable row level security;
alter table routine_days enable row level security;
alter table routine_exercises enable row level security;

create policy "el usuario gestiona sus rutinas" on routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "el usuario gestiona los dias de sus rutinas" on routine_days
  for all using (
    exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid())
  );

create policy "el usuario gestiona los ejercicios de sus rutinas" on routine_exercises
  for all using (
    exists (
      select 1 from routine_days rd
      join routines r on r.id = rd.routine_id
      where rd.id = routine_day_id and r.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from routine_days rd
      join routines r on r.id = rd.routine_id
      where rd.id = routine_day_id and r.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. Historial de entrenamientos (sesiones registradas)
-- ============================================================

create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id uuid references routines (id) on delete set null,
  day_label text not null,
  date timestamptz not null default now(),
  -- Duracion real de la sesion en segundos (inicio -> finalizar, incluye
  -- descansos y pausas). Nullable para sesiones antiguas sin cronometro.
  duration_sec int,
  created_at timestamptz not null default now()
);

create table if not exists workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions (id) on delete cascade,
  -- Sin FK a exercises (catalogo sin sembrar, ver nota en routine_exercises).
  exercise_id text not null,
  -- Categoria del ejercicio en el momento de guardar (para tags de historial,
  -- estable aunque el catalogo cambie mas adelante).
  categoria text not null,
  weight_kg numeric not null,
  reps int not null,
  position int not null
);

-- Notas / flags por ejercicio dentro de una sesion. Un flag "subir"/"bajar"
-- dispara un recordatorio la proxima vez que toque ese ejercicio, hasta que se
-- marca acknowledged. weight_kg = peso mas alto usado ese dia (para el mensaje).
create table if not exists exercise_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references workout_sessions (id) on delete cascade,
  exercise_id text not null,
  flag text check (flag in ('subir', 'bajar', 'ok')),
  note text,
  weight_kg numeric,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_idx on workout_sessions (user_id, date desc);
create index if not exists workout_sets_session_idx on workout_sets (session_id);
create index if not exists workout_sets_exercise_idx on workout_sets (exercise_id);
create index if not exists exercise_notes_reminder_idx
  on exercise_notes (user_id, exercise_id, created_at desc);

alter table workout_sessions enable row level security;
alter table workout_sets enable row level security;
alter table exercise_notes enable row level security;

create policy "el usuario gestiona sus sesiones" on workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "el usuario gestiona las series de sus sesiones" on workout_sets
  for all using (
    exists (select 1 from workout_sessions s where s.id = session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from workout_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

create policy "el usuario gestiona sus notas de ejercicio" on exercise_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Actualiza "ultima vez usada" de la rutina cada vez que se registra una
-- sesion ligada a ella (alimenta la seccion de rutinas recientes).
create or replace function touch_routine_last_used()
returns trigger as $$
begin
  if new.routine_id is not null then
    update routines set last_used_at = new.date where id = new.routine_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_workout_session_created on workout_sessions;
create trigger on_workout_session_created
  after insert on workout_sessions
  for each row execute procedure touch_routine_last_used();

-- ============================================================
-- 5. Favoritos y ejercicios recientes (biblioteca)
-- ============================================================

create table if not exists exercise_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Sin FK a exercises (catalogo sin sembrar, ver nota en routine_exercises).
  exercise_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- "Recientes" = ultima vez que el usuario abrio la ficha de un ejercicio.
-- Se hace upsert desde el cliente cada vez que entra en /biblioteca/[id].
create table if not exists exercise_recent_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  viewed_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create index if not exists exercise_recent_views_user_idx on exercise_recent_views (user_id, viewed_at desc);

alter table exercise_favorites enable row level security;
alter table exercise_recent_views enable row level security;

create policy "el usuario gestiona sus favoritos" on exercise_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "el usuario gestiona sus vistas recientes" on exercise_recent_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 6. Cardio (GPS)
-- ============================================================

create table if not exists cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date timestamptz not null default now(),
  distance_km numeric not null default 0,
  duration_sec int not null default 0,
  -- Polilinea de la ruta ({lat,lng,timestamp}[]); no se consulta por punto,
  -- solo se pinta en el mapa, por eso jsonb en vez de una tabla aparte.
  coordinates jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists cardio_sessions_user_idx on cardio_sessions (user_id, date desc);

alter table cardio_sessions enable row level security;

create policy "el usuario gestiona sus sesiones de cardio" on cardio_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 7. Comidas (diario nutricional + objetivos)
-- ============================================================

create table if not exists meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Dia local (no timestamp): el diario se agrupa por dia natural.
  date date not null,
  meal_type text not null check (meal_type in ('desayuno', 'comida', 'cena', 'snack')),
  name text not null,
  brand text,
  barcode text,
  -- Gramos consumidos; los valores *_100 son por 100 g (base de Open Food
  -- Facts) para poder recalcular al editar la cantidad.
  quantity_g numeric not null,
  kcal_100 numeric,
  protein_100 numeric,
  fat_100 numeric,
  carbs_100 numeric,
  created_at timestamptz not null default now()
);

create index if not exists meal_entries_user_date_idx on meal_entries (user_id, date);

alter table meal_entries enable row level security;

create policy "el usuario gestiona sus comidas" on meal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Objetivos diarios (una fila por usuario).
create table if not exists nutrition_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kcal_target int not null default 2000,
  protein_target int not null default 130,
  fat_target int not null default 65,
  carbs_target int not null default 220,
  updated_at timestamptz not null default now()
);

alter table nutrition_goals enable row level security;

create policy "el usuario gestiona sus objetivos" on nutrition_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
