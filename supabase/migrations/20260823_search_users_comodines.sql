-- search_users: escapar los comodines de LIKE.
--
-- La funcion (20260723_friendships.sql) filtra con:
--     p.username ilike p_query || '%'
-- y `p_query` llega tal cual desde el cliente. Como ILIKE interpreta % y _:
--   - p_query = '%'   -> patron '%%' -> devuelve 20 usuarios ARBITRARIOS, sin
--     necesidad de acertar ni una letra del nombre. Repitiendo con distintos
--     prefijos se puede recorrer el padron entero.
--   - p_query = 'a_c' -> casa con 'abc', 'adc'...  El buscador promete
--     "empieza por" y no lo cumple.
--
-- Ojo: '_' SI es un caracter valido de username (schema.sql:67 permite
-- [a-zA-Z0-9_]), asi que no vale con prohibirlo: hay que escaparlo para que se
-- trate como literal. Por eso se usa ESCAPE '\'.
--
-- Es una funcion SECURITY DEFINER, o sea que se salta la RLS de `profiles`: es
-- justo el sitio donde un filtro flojo hace mas dano.

create or replace function search_users(p_query text)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.username, public_display_name(p)
  from profiles p
  where auth.uid() is not null
    and p.user_id <> auth.uid()
    and length(coalesce(p_query, '')) >= 2
    -- Escapado: \ primero (si no, se escaparian las barras que anadimos),
    -- luego % y _. El patron sigue siendo "empieza por".
    and p.username ilike
        replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        escape '\'
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

do $$
begin
  raise notice 'OK. search_users ya no interpreta %% ni _ como comodines.';
end $$;
