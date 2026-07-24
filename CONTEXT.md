# Contexto del proyecto "Rogue"

Rogue es una PWA de fitness tracking hecha con Next.js 16 (App Router, Turbopack),
React 19, TypeScript y Tailwind v4. Está en `C:\Users\Grupo Hogares\Desktop\rogue`.

## Stack y convenciones
- App Router. La app autenticada cuelga de `/app`: `/app` (home), `/app/onboarding`,
  `/app/rutinas` (+ `/app/rutinas/editor`), `/app/biblioteca` (+ `/app/biblioteca/[id]`),
  `/app/cardio` (+ `/app/cardio/actividad/[id]`), `/app/comidas`, `/app/perfil`,
  `/app/amigos` (+ `/app/amigos/[username]`). Fuera de `/app`: landing `/` y `/login`.
  `/app/rangos` es solo un redirect a `/app/perfil?tab=rangos`.
- Diseño mobile-first: un "shell" único (`src/components/layout/app-shell.tsx`)
  centra el contenido en `max-w-[440px]` en desktop y ocupa el ancho completo en
  móvil, simulando un frame de app nativa. Navegación inferior fija en
  `src/components/layout/bottom-nav.tsx`.
- Modales se renderizan vía `createPortal` dentro de `#app-shell` para que el
  ancho case con el contenido (patrón usado en varios `*-modal.tsx`).
- Theming con variables CSS en `src/app/globals.css` (`--background`, `--surface`,
  `--muted`, `--border`, con variantes light/dark). `bg-surface` es blanco puro:
  solo contrasta sobre `bg-background` (gris), nunca lo uses relleno sobre
  otro `bg-surface`.
- Botones circulares icon-only (atrás/cerrar/minimizar/info) están
  estandarizados a: `flex size-10 items-center justify-center rounded-full
  bg-surface hover:bg-muted` con icono `size-5` — salvo cuando el padre ya es
  `bg-surface`, en cuyo caso se usa la misma forma sin relleno (`hover:bg-muted`
  a secas). Nunca tocar el estilo de `bottom-nav.tsx`.
- Drag-and-drop con `@dnd-kit/*` (core, sortable, modifiers, utilities) para
  reordenar tarjetas con soporte táctil real (usado en el editor de rutinas).
- Mapa de cardio con `leaflet` / `react-leaflet` (`src/components/cardio/map-view.tsx`).
- Estado global vía **React Context** (no Zustand, no librería externa):
  - `src/lib/store/rogue-store.tsx` — perfil, historial de sesiones
    (`WorkoutSession[]`), rutina (`routineDays`), `todayDay` calculado.
  - `src/lib/store/cardio-store.tsx` — tracking GPS de cardio (isTracking,
    coordinates, distanceKm, minimize/maximize).
  - `src/lib/store/workout-session-store.tsx` — sesión de entreno activa,
    minimizable igual que cardio (mini-player global), con acciones como
    addSet/removeSet/toggleDone/replaceExercise/finish.
  - `src/lib/store/friends-store.tsx` — amistades (aceptadas / recibidas /
    enviadas), rangos cacheados de los amigos y perfil de un amigo. Se
    resuscribe por Realtime a la tabla `friendships`.
- Rangos (`/rangos`): sistema de tiers Principiante/Intermedio/Avanzado/
  Experto/Maestro (antes Bronce/Plata/Oro/Esmeralda/Maestro), calculados en
  `src/lib/rank-engine.ts` y `src/lib/ranks.ts`, con vista de mapa corporal y
  toggle "media vs. por músculo".
- Tipos de dominio clave en `src/lib/workout/types.ts`:
  `WorkoutSession { id, dateISO, dayLabel, sets: LoggedSet[] }`,
  `LoggedSet { exerciseId, grupo, weightKg, reps }`, `RoutineDay`, `Routine`.
- Amistades: tabla `friendships` con RLS estricta (solo ves filas donde
  participas). Todo lo que mira el perfil de OTRO usuario pasa por funciones
  `security definer` con proyección explícita de columnas, para no aflojar la
  RLS de `profiles` (que es "solo tu propia fila"). RPC disponibles:
  `search_users`, `my_friendships`, `send_friend_request`,
  `respond_friend_request`, `is_friend_of`, `friend_profile`, `friends_ranks`.
  El email nunca sale de la base de datos.
  - `friend_profile(username)` devuelve el perfil del amigo en una sola llamada.
    Las series van NORMALIZADAS (`weight_kg / bodyweight_kg`), así que el
    cliente calcula sus rangos con el mismo `rank-engine.ts` llamando con
    `bodyweightKg = 1` — sin conocer ni su peso ni sus cargas reales.
  - `profiles.rank_tier` / `rank_division` son una CACHÉ del rango medio que
    escribe el propio cliente, solo para pintar el punto de color de la tira de
    amigos de la home sin bajarse el historial de cada uno. Es un dato
    auto-declarado: vale de adorno, no como fuente de verdad.
  - Privacidad: `profiles.share_ranks` y `share_stats` (por defecto `true`),
    editables en `/app/perfil?tab=ajustes`. Peso corporal, cargas en kilos,
    comidas y trazas GPS no se comparten en ningún caso.
- Ejercicios: catálogo y helpers en `src/lib/exercises/` (repo, types,
  filtros); selector reutilizable en
  `src/components/routines/exercise-selector-modal.tsx` (se usa tanto para
  añadir ejercicios a una rutina como para "swap" de ejercicio durante un
  entreno activo).

## Estructura relevante
```
src/app/          rutas (page.tsx por carpeta, App Router); la app va bajo src/app/app/
src/components/   cardio/, exercise/, food/, friends/, layout/, profile/, routines/, ui/, workout/
src/lib/          store/ (contexts), exercises/, food/, supabase/, workout/, rank-engine.ts, ranks.ts, utils.ts
supabase/         schema.sql + migrations/ (se aplican a mano en el SQL editor)
```

## Cosas a tener en cuenta al trabajar aquí
- El dev server normalmente lo lleva corriendo el propio usuario en el puerto
  3000; el tool de preview integrado no puede tomar ese puerto sin matar el
  proceso — no usar `taskkill`/`kill` sin permiso explícito. Con Turbopack/HMR los
  cambios de código se reflejan solos en el navegador del usuario.
- `npx tsc --noEmit` es el check rápido de sanidad tras cambios de UI.
- Preferencia de estilo: mobile-first, tarjetas redondeadas (`rounded-2xl`/`3xl`),
  bottom sheets para modales, tipografía mono para datos numéricos/labels
  tipo "HOY · TIRON".
- Espaciado SIEMPRE con `gap-*` en el contenedor padre, nunca `mt-*` en el hijo
  (un margen dentro de un padre con `gap` suma dos espaciados). Una sección con
  cabecera mono + contenido va en un `flex flex-col gap-2`. Si hace falta otra
  distancia, se agrupa en un sub-envoltorio con su propio `gap-*`.
- Las migraciones de `supabase/migrations/` NO se aplican solas: hay que
  pegarlas en el SQL editor de Supabase. Un `{}` vacío como error de
  supabase-js suele significar que falta aplicar una.

## Estado actual (última sesión de trabajo)
Fase 2 de amistades: al pulsar sobre un amigo se abre su perfil en
`/app/amigos/[username]` con su rango medio, el mapa corporal por rango
(reutilizando `BodyRankSummary` de `ranks-panel.tsx`) y contadores de entrenos,
racha en semanas y km de cardio. En la home se añadió `FriendsStrip`
(`src/components/friends/friends-strip.tsx`), una tira horizontal de avatares
con el punto de color del rango de cada amigo. Migraciones nuevas:
`20260724_friend_profile.sql` y `20260724_friends_ranks.sql`.

Antes de eso se rediseñó la home (`src/app/app/page.tsx`): la tarjeta "hoy" es
un carrusel de scroll nativo (scroll-snap, no drag manual) de 3 páginas — "Hoy"
(entreno del día), "Volumen semanal" y "Calendario" (últimos 7 días / mes
completo desplegable con `ResizeObserver` ajustando la altura del contenedor
dinámicamente). El calendario mensual distingue días entrenados (círculo
negro), hoy sin entrenar (anillo), pasado sin entrenar (gris) y futuro (muy
atenuado), y al tocar un día entrenado muestra un panel con detalle de esa
sesión (grupo muscular, series, volumen).

### Pendiente / ideas siguientes
- Comparativa "tú vs. él" en el perfil del amigo (mapa corporal superpuesto,
  PRs lado a lado en ejercicios comunes).
- Copiar la rutina de un amigo a la tuya.
- Ranking semanal de amigos en la home (necesita una RPC de agregados nueva).
- Retos entre amigos y feed de actividad (requiere tabla de eventos).
