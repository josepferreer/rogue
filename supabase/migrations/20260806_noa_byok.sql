-- NOA · BYOK — clave de Gemini por usuario.
--
-- Cada usuario guarda su propia clave desde Ajustes. La lee SOLO el servidor
-- (engine de NOA) para llamar a Gemini; hacia el cliente solo se devuelve una
-- versión enmascarada. La RLS de `profiles` ya es "solo tu propia fila", así
-- que la columna hereda ese aislamiento sin cambios extra.
--
-- Aplicar a mano en el SQL editor de Supabase ANTES de desplegar el código de
-- NOA. Mientras no exista, `getUserGeminiKey` degrada a null (NOA pide la clave)
-- en vez de tumbar la petición.

alter table profiles
  add column if not exists noa_gemini_key text;

comment on column profiles.noa_gemini_key is
  'BYOK: clave de API de Gemini del usuario para NOA. Solo la lee el servidor; nunca se devuelve entera al cliente.';
