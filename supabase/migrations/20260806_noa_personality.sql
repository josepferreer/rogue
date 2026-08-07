-- NOA · Personalidad — cómo se comunica NOA con cada usuario.
--
-- Capa de COMPORTAMIENTO, no de lógica: estas preferencias solo se traducen en
-- un bloque de texto que se añade al system prompt antes de llamar a Gemini.
-- No tocan las tools, ni el Action Gate, ni lo que NOA puede o no puede hacer.
--
-- Van como columnas de `profiles` (igual que `unit`, `display_name_source` o
-- los `notify_*`): la RLS de "solo tu propia fila" las cubre sin cambios, y los
-- CHECK dejan la validación en la BD y no solo en la UI.
--
-- Aplicar a mano en el SQL editor de Supabase. Mientras no exista, NOA usa los
-- valores por defecto (ver lib/noa/personality.ts) en vez de fallar.

alter table profiles
  -- Cómo quiere el usuario que NOA le llame. NULL/vacío = usar el nombre del
  -- perfil (lo resuelve el servidor, no se duplica aquí).
  add column if not exists noa_nickname text,

  add column if not exists noa_tone text not null default 'cercano',
  add column if not exists noa_persona text not null default 'entrenador',
  add column if not exists noa_length text not null default 'normales';

-- CHECKs aparte y con guarda: `add column if not exists` no permite añadirlos
-- de forma idempotente, y re-ejecutar la migración no debe romper.
do $$
begin
  alter table profiles add constraint noa_tone_valid
    check (noa_tone in ('formal', 'cercano', 'muy_cercano'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table profiles add constraint noa_persona_valid
    check (noa_persona in
      ('entrenador', 'motivador', 'analitico', 'profesor', 'exigente', 'tranquilo'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table profiles add constraint noa_length_valid
    check (noa_length in ('cortas', 'normales', 'explicadas'));
exception when duplicate_object then null;
end $$;

-- Un apodo desmedido acabaría entero dentro del system prompt: se acota en la
-- BD, no solo en el formulario.
do $$
begin
  alter table profiles add constraint noa_nickname_len
    check (noa_nickname is null or char_length(noa_nickname) <= 40);
exception when duplicate_object then null;
end $$;

comment on column profiles.noa_nickname is
  'NOA: cómo llamar al usuario. NULL = usar el nombre del perfil.';
comment on column profiles.noa_tone is
  'NOA: tono de comunicación. Solo afecta al estilo, nunca al contenido.';
comment on column profiles.noa_persona is
  'NOA: personalidad de respuesta. Solo afecta al estilo, nunca a la veracidad.';
comment on column profiles.noa_length is
  'NOA: longitud de respuesta preferida.';
