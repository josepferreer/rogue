-- NOA · Auditoría de llamadas a herramientas.
--
-- NOA puede escribir en los datos del usuario (diario de comidas, rutina,
-- objetivos). Hasta ahora el único rastro era un `console.info` del servidor,
-- que se pierde: si alguien dice "yo no pedí esto", no había forma de saber qué
-- se ejecutó, con qué argumentos ni cuándo.
--
-- Solo lectura para el usuario: las filas las inserta el servidor bajo la
-- sesión del propio usuario, y nadie puede modificarlas ni borrarlas desde el
-- cliente (no hay policy de update/delete: RLS deniega por defecto).
--
-- Aplicar a mano en el SQL editor de Supabase. Mientras no exista, el registro
-- degrada a consola en vez de tumbar la llamada a la herramienta.

create table if not exists noa_tool_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  module text not null,
  tool text not null,
  outcome text not null check (outcome in ('ok', 'error', 'pending_confirmation', 'rejected')),
  -- Argumentos ya redactados por `redact()` (secretos enmascarados, strings
  -- recortadas). Nunca la clave de Gemini: no llega hasta aquí.
  args jsonb not null default '{}',
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists noa_tool_calls_user_idx
  on noa_tool_calls (user_id, created_at desc);

alter table noa_tool_calls enable row level security;

-- El usuario ve su propio registro y el servidor escribe en su nombre. Sin
-- policies de update/delete a propósito: un registro de auditoría que se puede
-- reescribir no sirve de nada.
create policy "el usuario ve su auditoria" on noa_tool_calls
  for select using (auth.uid() = user_id);
create policy "el usuario registra su auditoria" on noa_tool_calls
  for insert with check (auth.uid() = user_id);

comment on table noa_tool_calls is
  'Auditoría de las herramientas que ejecuta NOA. Solo inserción y lectura: nunca se modifica.';
