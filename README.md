# Rogue — Fitness & Nutrition Tracking App

Rogue es una PWA de seguimiento de entrenamiento y nutrición construida con [Next.js](https://nextjs.org/). Diseñada mobile-first, con una experiencia gamificada del progreso físico mediante un sistema de rangos por grupo muscular.

## Funcionalidades principales

### 🏠 Dashboard (Inicio)
- **Entreno del día:** tarjeta con el foco, nº de ejercicios y tiempo estimado, con inicio directo de la sesión.
- **Calendario deslizable:** desliza la tarjeta de "hoy" a la izquierda para ver un calendario de actividad — últimos 7 días o, desplegado, el mes completo. Distingue días entrenados, hoy pendiente, días pasados sin entrenar y días futuros, y al tocar un día entrenado muestra el detalle de esa sesión (grupo muscular, series, volumen).
- **Estadísticas rápidas:** entrenos totales, volumen semanal levantado y entrenos de la semana.
- **Accesos rápidos:** rangos musculares y sugerencias de nuevos ejercicios.

### 🏋️ Sesión de entreno
- Registro de series (peso/reps) por ejercicio, con temporizador de descanso automático entre series.
- Añadir o eliminar series sobre la marcha, y sustituir un ejercicio en mitad del entreno reutilizando el selector de la biblioteca.
- **Minimizable:** la sesión activa se puede minimizar a un mini-player global y seguir navegando por la app sin perder el progreso.
- Resumen final con subidas de rango y marcas personales (PRs) al terminar.

### 🍽️ Comidas y nutrición
- **Diario de comidas** por franjas (desayuno, comida, cena y snack) con recuento de macros del día frente a los objetivos.
- **Escáner de códigos de barras** usando la API nativa `BarcodeDetector` del navegador: escanea un producto y trae sus datos de [Open Food Facts](https://world.openfoodfacts.org/) — macros por 100 g, ración, imagen y Nutri-Score.
- **Objetivos nutricionales** configurables (kcal y macros).
- **Despensa:** alimentos y platos propios reutilizables, marcables como favoritos, con semáforo de salud (`green`/`yellow`/`orange`/`red`).
- **Planificador semanal:** vista de la semana con las comidas y macros por día.

### 📚 Biblioteca de ejercicios
- Explorador completo con búsqueda y filtros por grupo muscular, equipo y dificultad.
- Ficha de ejercicio con instrucciones paso a paso, imágenes de ejecución y estadísticas.

### 🏃 Cardio y actividad
- Registro de rutas en tiempo real sobre mapa (Leaflet) con distancia, ritmo y duración.
- Igual que el entreno de fuerza, la sesión de cardio es **minimizable** a un mini-player.
- Historial de actividades con detalle por sesión.

### 📅 Rutinas
- Gestor de rutinas con los días de entrenamiento, su enfoque y ejercicios planeados.
- Editor con reordenación de ejercicios por arrastre (drag & drop, con soporte táctil completo).
- Inicio rápido del entreno del día desde la propia rutina.

### 👤 Perfil, cuenta y ajustes
- Registro e inicio de sesión con email y contraseña (Supabase Auth).
- Sincronización de datos en la nube: entrenos, comidas, despensa y objetivos.
- Datos físicos (peso, altura, sexo, objetivo) usados en el cálculo de rangos.
- Preferencias: tema claro/oscuro, unidades métrico/imperial, notificaciones (recordatorios de entreno, descansos, resúmenes semanales).

## Stack técnico

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack) + React 19 + TypeScript
- **Estilos:** Tailwind CSS v4, con theming por variables CSS (light/dark)
- **Iconos:** Lucide React
- **Backend:** [Supabase](https://supabase.com/) — auth por email/contraseña y persistencia (`@supabase/ssr`)
- **Estado:** React Context propio (sin librerías externas de estado) — stores separados para perfil/rutinas, sesión de entreno activa, tracking de cardio, comidas y despensa
- **Drag & drop:** `@dnd-kit` (core, sortable, modifiers, utilities)
- **Mapas:** Leaflet / React Leaflet para el tracking de rutas de cardio
- **Datos de alimentos:** API de Open Food Facts, normalizada a un modelo propio (`src/lib/food/`)
- **Animaciones:** Framer Motion
- **PWA:** manifest + service worker registrado para instalación e uso offline básico

## Estructura del proyecto

```
src/app/          rutas (App Router): inicio, login, onboarding, rutinas,
                  biblioteca, cardio, comidas, rangos, perfil
                  api/food/[barcode]  proxy a Open Food Facts
src/components/   cardio/, exercise/, food/, layout/, profile/, routines/,
                  ui/, workout/
src/lib/          store/ (contexts), exercises/, food/, workout/, supabase/,
                  rank-engine.ts, ranks.ts, mock-data.ts, utils.ts
supabase/         schema.sql y migrations/
```

Ver [CONTEXT.md](./CONTEXT.md) para el contexto técnico completo y convenciones de diseño del proyecto.

## Empezar a desarrollar

Instala las dependencias:

```bash
npm install
```

Crea un archivo `.env.local` en la raíz con las credenciales de tu proyecto de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
```

Aplica el esquema de base de datos desde `supabase/schema.sql` y las migraciones de `supabase/migrations/`.

Arranca el servidor de desarrollo:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver el resultado.

> **Nota:** el escáner de códigos de barras usa la API `BarcodeDetector`, disponible en navegadores basados en Chromium. En navegadores sin soporte, los alimentos se pueden añadir manualmente.
