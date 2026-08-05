# Contexto del proyecto "Rogue"

Rogue es una PWA de fitness tracking hecha con Next.js 16 (App Router, Turbopack),
React 19, TypeScript y Tailwind v4. Está en `C:\Users\Grupo Hogares\Desktop\rogue`.

## Stack y convenciones
- App Router con rutas: `/`, `/onboarding`, `/rutinas` (+ `/rutinas/editor`), `/biblioteca`
  (+ `/biblioteca/[id]`), `/cardio` (+ `/cardio/actividad/[id]`), `/perfil`.
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
- **No existe sistema de rangos musculares.** Se eliminó por completo el
  05/08/2026 (motor, UI, assets y columnas de BD). En una fase posterior se
  construirá un sistema de análisis muscular por Heatmaps, que todavía NO está
  implementado: no reintroduzcas tiers, divisiones ni `MUSCLE_TO_GROUP`.
- Tipos de dominio clave en `src/lib/workout/types.ts`:
  `WorkoutSession { id, dateISO, dayLabel, sets: LoggedSet[] }`,
  `LoggedSet { exerciseId, grupo, weightKg, reps }`, `RoutineDay`, `Routine`.
- Ejercicios: catálogo y helpers en `src/lib/exercises/` (repo, types,
  filtros); selector reutilizable en
  `src/components/routines/exercise-selector-modal.tsx` (se usa tanto para
  añadir ejercicios a una rutina como para "swap" de ejercicio durante un
  entreno activo).

## Estructura relevante
```
src/app/          rutas (page.tsx por carpeta, App Router)
src/components/   cardio/, exercise/, layout/, profile/, routines/, ui/, workout/
src/lib/          store/ (contexts), exercises/, workout/ (types.ts, one-rm.ts), mock-data.ts, utils.ts
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

## Estado actual (última sesión de trabajo)
**Desinstalación completa del módulo de Rangos Musculares (05/08/2026).** Se
borraron `lib/ranks.ts`, `lib/rank-engine.ts`, `components/profile/ranks-panel.tsx`,
`components/ui/rank-badge.tsx`, la ruta `/app/rangos` y `public/ranks/` (16 SVG).
`estimate1RM` sobrevivió en `lib/workout/one-rm.ts` porque lo usan las marcas
personales y la ficha de ejercicio. El perfil pasó de 3 pestañas a 2
(General/Ajustes). Los tokens `--rank-*` de `globals.css` se renombraron a
`--accent-green` / `--accent-red` (los otros tres se borraron). En Supabase se
eliminaron 4 columnas huérfanas de `profiles` (`share_ranks`, `rank_tier`,
`rank_division`, `rank_updated_at`) — ver
`supabase/migrations/20260805_remove_ranks.sql`.

Antes de eso se rediseñó la home (`src/app/page.tsx`): la tarjeta "hoy" es ahora un
carrusel de scroll nativo (scroll-snap, no drag manual) de 2 páginas — "Hoy"
(entreno del día) y "Calendario" (últimos 7 días / mes completo desplegable
con `ResizeObserver` ajustando la altura del contenedor dinámicamente). El
calendario mensual distingue días entrenados (círculo negro), hoy sin
entrenar (anillo), pasado sin entrenar (gris) y futuro (muy atenuado), y al
tocar un día entrenado muestra un panel con detalle de esa sesión (grupo
muscular, series, volumen).
