-- Sistema de amistades (fase 1): enviar / aceptar / rechazar solicitudes.
--
-- Alcance deliberadamente minimo: SOLO la relacion entre usuarios. No expone
-- entrenos, rangos, cardio ni ningun otro dato todavia. Lo unico que un usuario
-- ve de otro es su USERNAME y su nombre visible; el email nunca sale.
--
-- Diseno de seguridad: la tabla lleva RLS estricta (solo ves filas donde
-- participas) y todo lo que necesita mirar el perfil de OTRO usuario pasa por
-- funciones security definer con proyeccion explicita de columnas. Asi no hay
-- que aflojar la politica de `profiles` (que hoy es "solo tu propio perfil").

-- ============================================================
-- 1. Tabla
-- ============================================================

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- No puedes ser amigo de ti mismo.
  constraint friendships_no_self check (requester_id <> addressee_id),
  -- Una sola solicitud por direccion. La direccion inversa se controla en la
  -- funcion send_friend_request (que ademas auto-acepta si ya existia).
  unique (requester_id, addressee_id)
);

create index if not exists friendships_addressee_idx on friendships (addressee_id, status);
create index if not exists friendships_requester_idx on friendships (requester_id, status);

alter table friendships enable row level security;

-- Solo ves (y por tanto solo recibes por Realtime) las filas donde participas.
create policy "ver mis amistades" on friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Solo puedes crear solicitudes en tu nombre.
create policy "crear solicitud" on friendships
  for insert with check (auth.uid() = requester_id);

-- Aceptar/rechazar/bloquear: cualquiera de los dos implicados.
create policy "actualizar mis amistades" on friendships
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "borrar mis amistades" on friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ============================================================
-- 2. Realtime
-- ============================================================
-- Publica la tabla para que el cliente reciba cambios al instante. Realtime
-- respeta la RLS de arriba: cada usuario solo recibe eventos de SUS filas.
alter publication supabase_realtime add table friendships;

-- ============================================================
-- 3. Helper: nombre visible de un perfil
-- ============================================================
-- Respeta display_name_source; si el usuario no ha puesto nombre, cae al username.
create or replace function public_display_name(p profiles)
returns text
language sql
immutable
as $$
  select case
           when p.display_name_source = 'username' or coalesce(p.name, '') = ''
           then p.username
           else p.name
         end;
$$;

-- ============================================================
-- 4. Busqueda de usuarios
-- ============================================================
-- security definer porque `profiles` solo deja ver tu propia fila. Devuelve
-- EXCLUSIVAMENTE user_id, username y nombre visible: nunca el email.
--
-- Busqueda por PREFIJO y con minimo 2 caracteres, a proposito: evita que
-- alguien barra el padron entero de usuarios con una sola consulta.
create or replace function search_users(p_query text)
returns table (user_id uuid, username text, display_name text)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.username, public_display_name(p)
  from profiles p
  where auth.uid() is not null
    and p.user_id <> auth.uid()
    and length(coalesce(p_query, '')) >= 2
    and p.username ilike p_query || '%'
    -- Oculta a quien te haya bloqueado (y a quien tu hayas bloqueado).
    and not exists (
      select 1 from friendships f
      where f.status = 'blocked'
        and ((f.requester_id = p.user_id and f.addressee_id = auth.uid())
          or (f.addressee_id = p.user_id and f.requester_id = auth.uid()))
    )
  order by p.username
  limit 20;
$$;

grant execute on function search_users(text) to authenticated;

-- ============================================================
-- 5. Listado de mis amistades (con el nombre del otro)
-- ============================================================
-- security definer solo para poder leer el username del OTRO usuario. El filtro
-- garantiza que unicamente devuelve filas donde participo yo.
create or replace function my_friendships()
returns table (
  id uuid,
  other_id uuid,
  other_username text,
  other_display_name text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    f.id,
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.username,
    public_display_name(p),
    f.status,
    case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    f.created_at
  from friendships f
  join profiles p
    on p.user_id = case when f.requester_id = auth.uid()
                        then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
    and f.status <> 'blocked'
  order by f.created_at desc;
$$;

grant execute on function my_friendships() to authenticated;

-- ============================================================
-- 6. Enviar solicitud
-- ============================================================
-- Devuelve jsonb {ok, code}. Codigos: sent | auto_accepted | already_friends |
-- already_sent | not_found | blocked | self.
create or replace function send_friend_request(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_existing friendships%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  select user_id into v_target from profiles
   where lower(username) = lower(trim(p_username));

  if v_target is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_target = v_me then
    return jsonb_build_object('ok', false, 'code', 'self');
  end if;

  -- ¿Ya hay algo entre estos dos, en cualquier direccion?
  select * into v_existing from friendships
   where (requester_id = v_me and addressee_id = v_target)
      or (requester_id = v_target and addressee_id = v_me)
   limit 1;

  if found then
    if v_existing.status = 'blocked' then
      -- Mensaje generico a proposito: no revelamos que hay un bloqueo.
      return jsonb_build_object('ok', false, 'code', 'blocked');
    elsif v_existing.status = 'accepted' then
      return jsonb_build_object('ok', false, 'code', 'already_friends');
    elsif v_existing.requester_id = v_me then
      return jsonb_build_object('ok', false, 'code', 'already_sent');
    else
      -- El otro ya me habia invitado: aceptamos directamente (auto-match).
      update friendships
         set status = 'accepted', responded_at = now()
       where id = v_existing.id;
      return jsonb_build_object('ok', true, 'code', 'auto_accepted');
    end if;
  end if;

  insert into friendships (requester_id, addressee_id) values (v_me, v_target);
  return jsonb_build_object('ok', true, 'code', 'sent');
end;
$$;

grant execute on function send_friend_request(text) to authenticated;

-- ============================================================
-- 7. Responder / cancelar / eliminar
-- ============================================================
-- Aceptar: solo el destinatario de una solicitud pendiente.
-- Rechazar / cancelar / eliminar amistad: se BORRA la fila, para que se pueda
-- volver a solicitar en el futuro y no quede historial de rechazos.
create or replace function respond_friend_request(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row friendships%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  select * into v_row from friendships where id = p_id;
  if not found or v_me not in (v_row.requester_id, v_row.addressee_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p_accept then
    -- Solo el destinatario puede aceptar, y solo si sigue pendiente.
    if v_row.addressee_id <> v_me or v_row.status <> 'pending' then
      return jsonb_build_object('ok', false, 'code', 'not_allowed');
    end if;
    update friendships set status = 'accepted', responded_at = now()
     where id = p_id;
    return jsonb_build_object('ok', true, 'code', 'accepted');
  end if;

  delete from friendships where id = p_id;
  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;

grant execute on function respond_friend_request(uuid, boolean) to authenticated;
