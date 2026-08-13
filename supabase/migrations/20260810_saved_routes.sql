-- Rutas guardadas — base de "importar GPX", "guardar actividad como ruta" y
-- "repetir ruta en modo seguimiento".
--
-- La tabla `saved_routes` ya existe en la BD (creada a mano). Esta migración es
-- ADITIVA e idempotente: añade lo que falta y no rompe si se re-ejecuta.
--
-- Modelo:
--   saved_routes  = una ruta reutilizable (path + metadatos). NO lleva tiempo:
--                   es un trazado, no una actividad.
--   cardio_sessions.route_id = cada vez que rehaces una ruta en seguimiento, la
--                   sesión resultante apunta a la ruta origen (historial + poder
--                   listar "tus intentos de esta ruta").
--
-- Aplicar a mano en el SQL editor de Supabase antes de desplegar el código.

-- —— saved_routes: columnas nuevas ————————————————————————————————
alter table saved_routes
  -- De dónde salió la ruta: de una actividad propia o de un GPX importado.
  add column if not exists source text not null default 'activity'
    check (source in ('activity', 'gpx')),
  -- Desnivel positivo acumulado en metros (de la elevación del GPX/actividad).
  -- Nullable: no todas las fuentes traen altitud.
  add column if not exists elevation_gain_m numeric,
  -- Sesión de cardio de la que se guardó, si nació de una actividad. Informativo.
  add column if not exists origin_session_id uuid
    references cardio_sessions (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- —— cardio_sessions: enlace a la ruta que se estaba siguiendo ————————
alter table cardio_sessions
  add column if not exists route_id uuid
    references saved_routes (id) on delete set null;

create index if not exists cardio_sessions_route_idx
  on cardio_sessions (route_id);

create index if not exists saved_routes_user_idx
  on saved_routes (user_id, created_at desc);

-- —— RLS: cada usuario gestiona SOLO sus rutas ————————————————————————
-- Idempotente (drop + create). La traza cruda no sale de aquí: compartir con
-- amigos (con inicio/fin recortados) será una fase aparte, vía security definer.
alter table saved_routes enable row level security;

drop policy if exists "el usuario ve sus rutas" on saved_routes;
create policy "el usuario ve sus rutas" on saved_routes
  for select using (auth.uid() = user_id);

drop policy if exists "el usuario crea sus rutas" on saved_routes;
create policy "el usuario crea sus rutas" on saved_routes
  for insert with check (auth.uid() = user_id);

drop policy if exists "el usuario edita sus rutas" on saved_routes;
create policy "el usuario edita sus rutas" on saved_routes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "el usuario borra sus rutas" on saved_routes;
create policy "el usuario borra sus rutas" on saved_routes
  for delete using (auth.uid() = user_id);
