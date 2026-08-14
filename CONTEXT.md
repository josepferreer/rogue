# Contexto del proyecto "Rogue"

Rogue es una PWA de fitness tracking hecha con Next.js 16 (App Router, Turbopack),
React 19, TypeScript y Tailwind v4. Está en `C:\Users\Grupo Hogares\Desktop\rogue`.

## Stack y convenciones
- App Router con rutas: `/`, `/onboarding`, `/rutinas` (+ `/rutinas/editor`), `/biblioteca`
  (+ `/biblioteca/[id]`), `/cardio` (+ `/cardio/actividad/[id]`), `/comidas`, `/perfil`.
- Diseño mobile-first: un "shell" único (`src/components/layout/app-shell.tsx`)
  centra el contenido en `max-w-[440px]` en desktop y ocupa el ancho completo en
  móvil, simulando un frame de app nativa. Navegación inferior fija en
  `src/components/layout/bottom-nav.tsx`.
- Modales se renderizan vía `createPortal` dentro de `#app-shell` para que el
  ancho case con el contenido (patrón usado en varios `*-modal.tsx`). El nodo
  destino se obtiene **siempre** con `useAppShellPortal()`
  (`src/lib/use-app-shell-portal.ts`); nunca con
  `useState(() => document.getElementById("app-shell"))`, que se resuelve
  durante el render — cuando `HydrationGate` deja pasar, `AppShell` y la página
  se montan en el mismo commit y el nodo aún no está en el DOM, así que el
  destino quedaba a null para siempre y el modal no abría en carga directa de
  la ruta (entrando por un link sí, y por eso pasaba desapercibido).
- **Movimiento: todo con CSS**, sin librería de animación y sin la View
  Transitions API (solo la tienen los WebView Chromium; se vería distinto en el
  APK y en un Safari). Las animaciones viven en `globals.css`:
  - `.page-transition` — entrada de página (fade + 8px), la aplica
    `src/components/layout/page-transition.tsx` con `key={pathname}`. Su
    `animation-fill-mode` DEBE ser `backwards`: con `both`, el `transform` del
    último frame se queda y el elemento pasa a ser bloque contenedor de sus
    descendientes `position: fixed` (rompería el mapa a pantalla completa de
    `/app/cardio/actividad/[id]`).
  - `.overlay-anim` + `.sheet-anim` / `.dialog-anim` — modales y hojas. El
    contenedor lleva `overlay-anim`, el panel `sheet-anim` (sube desde abajo en
    móvil, escala en escritorio) o `dialog-anim` (los que ya nacen centrados,
    como `ConfirmDialog`). Ambos necesitan `data-state={state}`, que en
    `closing` cambia a los keyframes `*-out`. Tienen que ser keyframes PROPIOS,
    no `animation-direction: reverse` sobre los de entrada: cambiar la dirección
    no rearranca una animación ya terminada (y al cerrar, la de entrada terminó
    hace rato), así que el panel saltaba a invisible y se quedaba esperando.
    Solo cambiar `animation-name` la rearranca.
  - Para que la salida se vea, el modal usa `usePresence(open)`
    (`src/lib/use-presence.ts`) y cambia su guard de `if (!open)` a
    `if (!mounted)`: mantiene el panel montado 260 ms más. El hook deriva
    `closing` DURANTE el render, nunca en un efecto: un efecto corre después del
    commit, así que quedaba un pintado intermedio con `mounted` en false — el
    panel se desmontaba y se volvía a montar, y eso se veía como un parpadeo al
    cerrar. Al reabrir cancela el `closing`, si no el panel se queda invisible.
  - Lo llevan los 13 overlays de la app. Si añades otro, ponle las clases: la
    coherencia es el objetivo. Quedan FUERA a propósito las pantallas completas
    que no son modales (`route-tracker-modal`, la sesión de entreno y el mapa a
    pantalla completa de una actividad) y sobre todo `barcode-scanner`, que NO
    debe animarse: juega con la transparencia del WebView para dejar ver la
    cámara nativa que hay detrás.
  - `<Skeleton>` (`src/components/ui/skeleton.tsx`) en vez de "Cargando…"
    suelto: el texto centrado no ocupa el alto del contenido real y la página
    saltaba al resolver el fetch.
  - Hay un bloque `prefers-reduced-motion` global que reduce todo a 0.01 ms.
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
- Mapa de cardio con **MapLibre GL** (`src/components/cardio/map-view.tsx`).
  Motor WebGL sobre teselas vectoriales de CARTO (`basemaps.cartocdn.com`).
  Soporta modo **2D y 2.5D** con edificios 3D (`fill-extrusion`) y toggle
  persistido en `localStorage` (`rogue.mapMode`). La traza GPS se pinta como
  polilínea GeoJSON azul neón con halo. El modo 2.5D inclina la cámara 55°.
  CARTO es el único tercero que ve la zona que miras (debe figurar en la
  política de privacidad). **Pendiente: falta la atribución de OpenStreetMap/CARTO**
  — el mapa se pinta con `attributionControl: false` y la licencia ODbL la exige.
- **Seguir una ruta guardada**: al repetir una ruta NO se pinta la traza en vivo
  encima (serían dos líneas calcadas). Se pinta una sola polilínea, la de la
  ruta, en dos capas: el tramo pendiente tenue y discontinuo y, encima, el ya
  completado en verde. El corte lo calcula `src/lib/cardio/route-progress.ts`
  (`computeRouteProgress`), una función pura sobre la traza entera: no arranca
  hasta que el GPS entra en un radio de 35 m del inicio, solo avanza hacia
  delante y busca en una ventana hacia delante que se ensancha con el salto del
  GPS (para reengancharse tras un hueco sin saltar al tramo de vuelta en rutas
  circulares). A más de 45 m de la línea marca `offRoute` y no avanza.
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
  **Añadido 12/08/2026:** pestaña **Historial** en `/rutinas` (junto a "Rutina"
  y "Ejercicios") que lista las sesiones completadas ordenadas por fecha,
  mostrando nombre del entreno, fecha, duración y número de series.
- **Pilar 2 — Cardio: PARCIAL.** ~3,5 → ~6,5. Hecho: persistencia incremental
  durante la ruta (`upsert_cardio_progress`, envía solo puntos nuevos y es
  idempotente), listado sin la polilínea (se carga al abrir el detalle),
  contexto memoizado, snapshot con throttle.
  **Se eliminó el map matching (06/08/2026).** `/api/match` y
  `lib/cardio/map-matching.ts` ya no existen: mandaban la traza GPS del usuario
  (que empieza y acaba en su casa) al servidor de demostración público de OSRM,
  sin contrato de encargo de tratamiento, y en cada apertura del detalle. La
  política de OSRM además excluye productos detrás de un login. La limpieza de
  outliers —que es lo que de verdad quitaba las rectas cruzando manzanas— vive
  ahora en `lib/cardio/clean-trace.ts` y se aplica en cliente al dibujar
  (`<MapView cleanOutliers />`), sin red. **No reintroduzcas una llamada a un
  router externo sin resolver antes el encargo de tratamiento.**
  **Pendiente, decisión de producto:** tipo de actividad + elevación (sin tipo,
  el filtro de outliers a 28,8 km/h descarta la bici entera) y pasos/kcal, hoy
  estimados pero mostrados como cifras exactas.
- **Pilar 3 — Nutrición: PARCIAL.** ~3,0 → ~6,0. Hecho: el escáner pasa por
  `/api/food/[barcode]` (sesión + límite + `fields=` + fallback kJ→kcal); antes
  cada pantalla llamaba a Open Food Facts directa y el proxy era código muerto.
  Criterio `eaten` unificado en las 4 pantallas (resumen, tarjetas, hoja de
  comida, planificador): la cifra es lo comido y lo planificado va aparte.
  Desglose de platos en `meal_entries.breakdown` (ya no serializado dentro de
  `barcode`) y no se puede guardar un plato a 0 g. La despensa demo se siembra
  una sola vez (`profiles.pantry_seeded`) y un fallo de lectura ya no la
  disfraza de despensa del usuario: avisa y ofrece reintentar. Contextos de
  comidas y despensa memoizados. Además, un fallo pre-existente y transversal:
  8 modales (hoja de comida, planificador, despensa, perfil ×2, selector de
  ejercicios, diálogo de confirmación) resolvían el destino del portal durante
  el render y no abrían nunca en carga directa de su ruta — crítico para la
  PWA/APK, que arranca en una URL concreta. Ver `useAppShellPortal()` arriba.
  Ventana de 90 días en el diario (antes se traía el histórico entero en cada
  arranque) con carga bajo demanda al navegar más atrás (`ensureLoadedFrom`,
  tramos contiguos sin solape) e índice por día en el store: el planificador
  llamaba a `entriesForDay` 28 veces por render y cada una recorría el diario
  completo.
  Integridad despensa↔platos: las kcal de un plato manual se calculan siempre
  contra la despensa actual (`platoMacros`, la copia de `Plato.kcal` sólo se
  persiste, nunca se pinta), editar un alimento rehace la copia de sus platos,
  y borrarlo pide confirmación diciendo a cuántos platos afecta, lo quita de
  ellos y borra los que se queden sin ingredientes. Un ingrediente ausente ya
  no entra como "Desconocido" a 0 kcal: se avisa y no se cuenta. UI: selector
  de día y tarjetas de comida son `<button>` (`PastelCard as="button"`), y
  guardia contra doble pulsación al añadir al diario.
  **Añadido 12/08/2026:** **Módulo de hidratación** (`WaterTracker`):
  componente `src/components/comidas/water-tracker.tsx` integrado en
  `/app/comidas`. Permite registrar vasos de agua por día, con objetivo
  configurable, persistencia en Supabase (`water_log`) y visualización del
  progreso diario. La migración `20260811172816_water_log.sql` añade la tabla.
  **Pendiente:** **no hay agregado en Postgres** para
  nutrición y de momento no hace falta: nada en la UI necesita el histórico
  completo, sólo los días que se pintan. Si algún día hay pantalla de
  estadísticas de nutrición, ahí sí.
  **Pendiente:** integrar el WaterTracker en NOA (el asistente de IA) para que
  pueda leer y registrar agua via chat/voz.
  **Decisiones de producto, ya cerradas (06/08/2026):**
  - El semáforo de color es **siempre Nutri-Score** de OFF. Se eliminó
    `estimateHealthScore` (umbrales inventados de kcal/grasa que se pintaban
    con el mismo punto que el dato oficial). En alimentos creados a mano el
    color se elige a mano o se deja vacío. Los colores ya guardados de antes
    siguen ahí; ahora cuentan como elección manual.
  - Los objetivos **no** llevan historial: cambiarlos reescribe el pasado y así
    se queda. No volver a proponerlo.
  - "Plato listo" se decide por las **categorías canónicas de OFF**
    (`MEAL_TAGS` en `lib/food/ingredients.ts`), con veto de materia prima
    (`RAW_TAGS`). Antes bastaba `nova === 4` o 4+ ingredientes, y eso marcaba
    la Nutella o una bolsa de rúcula como plato listo. Verificado contra 13
    productos reales de supermercado español (ensaladas de pasta Hacendado /
    Carretilla / Florette vs atún Hacendado / Calvo, pasta seca, Nutella,
    Coca-Cola): 13/13. Al tocar esa heurística, repetir ese test.

## Transversal (06/08/2026)

- **La cola de escrituras sobrevive a una recarga.** `sync.ts` guardaba
  closures en un array de módulo y se perdía todo lo pendiente al recargar o
  cuando Android mataba el WebView. Ahora una escritura se describe con datos
  (`SyncOp`: `upsert` | `update` | `delete` | `rpc`), el ejecutor arma la
  llamada, y la cola se persiste en `localStorage`
  (`rogue.syncQueue.v1`). `resumeStoredWrites()` la reanuda al montar
  `SyncErrorToast`, solo para el usuario de la sesión actual. **Al añadir una
  escritura nueva: descríbela como `SyncOp`, no como función, y asegúrate de
  que es idempotente.**
- `global-error.tsx` (errores del layout raíz, con estilos en línea porque
  reemplaza el documento entero) y `not-found.tsx` dentro del diseño.
- Versión de cliente en `lib/version.ts`, visible en Perfil > Ajustes y en la
  pantalla de error fatal. Sale de `NEXT_PUBLIC_BUILD_ID` (en Vercel,
  `VERCEL_GIT_COMMIT_SHA`); en local, "dev".
- Escape cierra los modales (`lib/use-escape-to-close.ts`). Lleva una **pila**
  porque se anidan (planificador → hoja de comida, despensa → confirmación) y
  un listener por modal los cerraría todos de golpe.

### Lista de dependencias de C1 (el APK es un WebView a una URL remota)
Sin conexión la app **no abre**. Además Apple rechaza envoltorios web (guía 4.2).
Acumular aquí todo lo que dependa de resolverlo:
0. El diario de comidas es online-only: sin cobertura `/app/comidas` abre
   vacío y lo registrado se pierde al recargar. El escáner depende de
   `BarcodeDetector` + permiso de cámara: en el WebView sin declararlo cae
   siempre a entrada manual.
1. Offline de registro de entrenos.
2. Carga bajo demanda del calendario más allá de la ventana de 1 año.
3. Sin cobertura, el WebView no puede recargarse y una ruta a medias es irrecuperable.

Resueltos: la cola de escrituras ya persiste, y el versionado de cliente ya
existe (ver "Transversal"). Descartado: `sw.js` **sí** versiona la caché
(`rogue-v4`) y purga las antiguas al activar — ese punto de la lista era falso.

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

Antes de eso se rediseñó la home (`src/app/app/page.tsx`): la tarjeta "hoy" es ahora un
carrusel de scroll nativo (scroll-snap, no drag manual) de 3 páginas — "Hoy"
(entreno del día), "Volumen Semanal" y "Calendario" (últimos 7 días / mes completo
desplegable con `ResizeObserver` ajustando la altura del contenedor dinámicamente).
El calendario mensual distingue días entrenados (círculo negro), hoy sin
entrenar (anillo), pasado sin entrenar (gris) y futuro (muy atenuado), y al
tocar un día entrenado muestra un panel con detalle de esa sesión (grupo
muscular, series, volumen).

## Cambios 12/08/2026

- **Bug fix — Zona horaria en el calendario de la home.** La función `toKey(d: Date)`
  usaba `d.toISOString().slice(0, 10)` que devuelve UTC, causando que un
  entrenamiento registrado al final del día (ej. las 23:xx en España) apareciera
  en el día siguiente en el calendario expandido. Corregido usando getters locales
  (`getFullYear`, `getMonth`, `getDate`) en `toKey`, `useLastSevenDays`,
  `useSessionsByDay` y `useMonthDays` en `src/app/app/page.tsx`.

- **Historial de entrenamientos en Rutinas.** Nueva pestaña "Historial" en
  `/app/rutinas` (junto a "Rutina" y "Ejercicios"). El componente `HistoryPanel`
  lee las sesiones de `useRogue()` y las lista ordenadas de más reciente a más
  antigua, mostrando: nombre del entreno (`dayLabel`), fecha formateada, duración
  en minutos y número de series registradas. Estado vacío si no hay sesiones.

- **Bug fix — Prop `selectedDate` en WaterTracker.** La variable de estado que
  guarda el día seleccionado en `/app/comidas/page.tsx` se llama `selected`, pero
  se pasaba al componente como `selectedDate`. Corregido a `date={selected}`.
