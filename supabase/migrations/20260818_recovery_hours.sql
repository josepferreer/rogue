-- Umbrales de recuperacion muscular editables por el usuario.
--
-- El mapa de calor de la home dice si un musculo esta listo comparando cuanto
-- hace que lo trabajaste con un umbral de horas. Los valores por defecto
-- (72 h los grandes, 48 h los medianos, 36 h los pequenos) me los he sacado de
-- la manga: lo unico que los convierte en numeros del usuario es poder
-- cambiarlos, y para eso hay que guardarlos.
--
-- Una sola columna jsonb y no 17 columnas sueltas como el resto de
-- preferencias: son 17 musculos, la lista puede crecer, y siempre se leen y
-- escriben juntos. `{}` significa "todo por defecto"; dentro solo viajan los
-- musculos que el usuario haya tocado, con la forma {"pectoral": 60}.
--
-- No hace falta politica RLS nueva: es una columna mas de `profiles`, que ya
-- tiene la suya (cada usuario solo ve y edita su fila).
alter table public.profiles
  add column if not exists recovery_hours jsonb not null default '{}'::jsonb;
