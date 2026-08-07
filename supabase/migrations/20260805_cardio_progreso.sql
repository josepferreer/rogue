-- Persistencia incremental de rutas de cardio (auditoria Pilar 2, C6 y C7).
--
-- Problema (C6): stopTracking era el UNICO punto que escribia en Supabase.
-- Durante toda la carrera los datos vivian en memoria y en un snapshot de
-- localStorage. Se perdia una ruta entera si el SO mataba la app y no se
-- reabria en 12 h, si el WebView perdia su almacenamiento, o si syncWrite
-- agotaba los reintentos (la cola de fallos vive en memoria y se evapora al
-- recargar). Una hora de carrera desaparecia sin rastro. A diferencia de una
-- serie mal registrada, el esfuerzo fisico no se repite.
--
-- Clave del diseno: la funcion recibe SOLO LOS PUNTOS NUEVOS desde el ultimo
-- volcado y los concatena en servidor (`coordinates || nuevos`). Reenviar el
-- array entero cada 30 s serian megabytes de datos moviles por carrera; asi el
-- trafico es proporcional a lo recorrido desde el ultimo envio.
--
-- Idempotencia: un reintento no puede duplicar puntos. El cliente manda cuantos
-- puntos cree que hay ya guardados (p_stored_len); si no coincide con la
-- realidad, el volcado ya se aplico y solo se refrescan distancia y duracion.

create or replace function upsert_cardio_progress(
  p_id           uuid,
  p_date         timestamptz,
  p_distance_km  numeric,
  p_duration_sec int,
  p_stored_len   int,
  p_new_points   jsonb
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_len  int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select jsonb_array_length(coordinates) into v_len
    from cardio_sessions
   where id = p_id and user_id = v_user;

  if v_len is null then
    -- Primer volcado de esta ruta: se crea la fila.
    insert into cardio_sessions (id, user_id, date, distance_km, duration_sec, coordinates)
    values (
      p_id, v_user, p_date, p_distance_km, p_duration_sec,
      coalesce(p_new_points, '[]'::jsonb)
    );
    return jsonb_array_length(coalesce(p_new_points, '[]'::jsonb));
  end if;

  if v_len = p_stored_len then
    update cardio_sessions
       set distance_km  = p_distance_km,
           duration_sec = p_duration_sec,
           coordinates  = coordinates || coalesce(p_new_points, '[]'::jsonb)
     where id = p_id and user_id = v_user;
  else
    -- Reintento de un volcado que ya entro: no reanexar, solo actualizar las
    -- metricas (que siempre son las mas recientes).
    update cardio_sessions
       set distance_km  = p_distance_km,
           duration_sec = p_duration_sec
     where id = p_id and user_id = v_user;
  end if;

  select jsonb_array_length(coordinates) into v_len
    from cardio_sessions
   where id = p_id and user_id = v_user;
  return v_len;
end;
$$;

grant execute on function upsert_cardio_progress(uuid, timestamptz, numeric, int, int, jsonb)
  to authenticated;

-- ============================================================
-- C7 — Coordenadas fuera del listado
-- ============================================================
-- fetchHistory se traia TODAS las sesiones con TODAS sus coordenadas en cada
-- arranque. Con distanceFilter de 5 m, una hora corriendo son ~2.000 puntos
-- (~130 KB por ruta): 300 rutas son ~39 MB por apertura de la app, sobre datos
-- moviles y residentes en memoria del WebView.
--
-- El listado solo necesita fecha, distancia y duracion; el trazado solo hace
-- falta al abrir el detalle. El cliente pasa a seleccionar columnas concretas
-- (sin `coordinates`) y a pedir los puntos por id cuando se abre una ruta.
--
-- Este indice cubre el listado paginado por usuario y fecha; ya existia como
-- cardio_sessions_user_idx, se deja constancia de que es el que sostiene la
-- consulta del historial ahora que no arrastra el jsonb.

comment on column cardio_sessions.coordinates is
  'Polilinea de la ruta ({lat,lng,timestamp}[]). NO incluir en consultas de listado: se carga solo al abrir el detalle de una ruta (ver auditoria Pilar 2, C7).';
