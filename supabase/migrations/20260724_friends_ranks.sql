-- Tira de amigos en la home: avatares con un punto del color de su rango.
--
-- Pintar ese punto con el motor de rangos real exigiria bajarse las series de
-- CADA amigo (lo que hace `friend_profile`) solo para un circulito de 16px.
-- En su lugar el rango MEDIO ya calculado se cachea en la propia fila de
-- `profiles` y la home lo lee de una tacada.
--
-- El cliente es quien escribe su cache (es el unico que tiene el motor), asi
-- que es un dato auto-declarado: vale para un adorno social, NO para nada que
-- de ventaja competitiva. El perfil del amigo (`friend_profile`) sigue
-- calculando el rango desde las series reales.

alter table profiles
  add column if not exists rank_tier text
    check (rank_tier is null or rank_tier in ('bronce', 'plata', 'oro', 'esmeralda', 'maestro'));
alter table profiles
  add column if not exists rank_division int
    check (rank_division is null or rank_division between 1 and 4);
alter table profiles
  add column if not exists rank_updated_at timestamptz;

-- Rango cacheado de mis amigos aceptados, en una sola consulta. Respeta
-- share_ranks: quien no comparte rangos sale con tier null (la home pinta el
-- avatar sin punto).
create or replace function friends_ranks()
returns table (user_id uuid, rank_tier text, rank_division int)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    case when p.share_ranks then p.rank_tier end,
    case when p.share_ranks then p.rank_division end
  from profiles p
  where auth.uid() is not null
    and exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = p.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = p.user_id))
    );
$$;

grant execute on function friends_ranks() to authenticated;
