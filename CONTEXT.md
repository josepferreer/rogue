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

## Auditoría para beta pública (en curso, rama `auditoria/pilar-1-entrenamientos`)

Auditoría crítica módulo a módulo. Tres pilares: **Entrenamientos**, **Cardio**,
**Nutrición**. El APK (C1) se toca **al final**, cuando los tres estén hechos.

- **Pilar 1 — Entrenamientos: CERRADO.** Preparación para producción 4,0 → 7,5.
  Hecho: guardado atómico de rutinas (`save_routine`), aviso de descanso
  programado en el SO, unidades ancladas a la sesión, contextos memoizados,
  pila del botón atrás, descanso y peso editables + prellenado con la última
  sesión, guard de cambios sin guardar, agregados en Postgres
  (`workout_stats`) y ventana de historial de 1 año, timeout de carga.
- **Pilar 2 — Cardio: PARCIAL.** ~3,5 → ~6,5. Hecho: persistencia incremental
  durante la ruta (`upsert_cardio_progress`, envía solo puntos nuevos y es
  idempotente), listado sin la polilínea (se carga al abrir el detalle),
  contexto memoizado, snapshot con throttle.
  **Pendiente, decisión de producto:** tipo de actividad + elevación (sin tipo,
  el filtro de outliers a 28,8 km/h descarta la bici entera) y pasos/kcal, hoy
  estimados pero mostrados como cifras exactas.
- **Pilar 3 — Nutrición: SIN EMPEZAR.**

### Lista de dependencias de C1 (el APK es un WebView a una URL remota)
Sin conexión la app **no abre**. Además Apple rechaza envoltorios web (guía 4.2).
Acumular aquí todo lo que dependa de resolverlo:
1. Offline de registro de entrenos.
2. La cola de escrituras fallidas (`sync.ts`) vive en memoria: se pierde al recargar.
3. Carga bajo demanda del calendario más allá de la ventana de 1 año.
4. Versionado de cliente (hoy no se sabe qué versión ejecuta un usuario).
5. `public/sw.js` usa un nombre de caché constante: nunca se purga nada.
6. Sin cobertura, el WebView no puede recargarse y una ruta a medias es irrecuperable.

### Migraciones — aplicar SIEMPRE antes de desplegar el código
Las funciones nuevas degradan solas si aún no existen (avisan por consola en vez
de tumbar la app), pero el orden correcto es BD primero. **Las FK de
`exercise_id` están desactivadas a propósito**: se aplicaron con el catálogo
`exercises` sin sembrar y bloquearon toda escritura de entrenos. Para reponerlas
hay que ejecutar antes `node scripts/seed-supabase.mjs`; la migración ya aborta
sola si el catálogo no está listo.

## Estado anterior
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
