# Rogue — Fitness & Nutrition Tracking App

Rogue es una PWA de seguimiento de entrenamiento y nutrición construida con [Next.js](https://nextjs.org/). Diseñada mobile-first, con una experiencia premium para registrar entrenos, comidas, cardio e hidratación.

## Funcionalidades principales

### 🏠 Dashboard (Inicio)
- **Entreno del día:** tarjeta con el foco, nº de ejercicios y tiempo estimado, con inicio directo de la sesión.
- **Calendario deslizable:** desliza la tarjeta de "hoy" a la izquierda para ver un calendario de actividad — últimos 7 días o, desplegado, el mes completo. Distingue días entrenados, hoy pendiente, días pasados sin entrenar y días futuros, y al tocar un día entrenado muestra el detalle de esa sesión (grupo muscular, series, volumen).
- **Estadísticas rápidas:** entrenos totales, volumen semanal levantado, racha de días y tiempo medio por sesión.
- **Accesos rápidos:** sugerencias de nuevos ejercicios.

### 🏋️ Sesión de entreno
- Registro de series (peso/reps) por ejercicio, con temporizador de descanso automático entre series.
- Añadir o eliminar series sobre la marcha, y sustituir un ejercicio en mitad del entreno reutilizando el selector de la biblioteca.
- **Minimizable:** la sesión activa se puede minimizar a un mini-player global y seguir navegando por la app sin perder el progreso.
- Resumen final con subidas de rango y marcas personales (PRs) al terminar.

### 🍽️ Comidas y nutrición
- **Diario de comidas** por franjas (desayuno, comida, cena y snack) con recuento de macros del día frente a los objetivos.
- **Escáner de códigos de barras** usando la API nativa `BarcodeDetector` del navegador: escanea un producto y trae sus datos de [Open Food Facts](https://world.openfoodfacts.org/) — macros por 100 g, ración, imagen y Nutri-Score.
- **Objetivos nutricionales** configurables (kcal y macros).
- **Seguimiento de hidratación:** registro de vasos de agua por día con objetivo configurable y progreso visual (`WaterTracker`).
- **Despensa:** alimentos y platos propios reutilizables, marcables como favoritos, con semáforo Nutri-Score.
- **Planificador semanal:** vista de la semana con las comidas y macros por día.

### 📚 Biblioteca de ejercicios
- Explorador completo con búsqueda y filtros por grupo muscular, equipo y dificultad.
- Ficha de ejercicio con instrucciones paso a paso, imágenes de ejecución y estadísticas.

### 🏃 Cardio y actividad
- Registro de rutas en tiempo real sobre mapa WebGL (**MapLibre GL**) con distancia, ritmo y duración.
- **Modo 2D / 2.5D:** toggle persistido en localStorage que activa edificios 3D y una cámara inclinada a 55°. La ruta se dibuja como polilínea GeoJSON azul neón con halo.
- Igual que el entreno de fuerza, la sesión de cardio es **minimizable** a un mini-player.
- Historial de actividades con detalle por sesión.

### 📅 Rutinas
- Gestor de rutinas con los días de entrenamiento, su enfoque y ejercicios planeados.
- Editor con reordenación de ejercicios por arrastre (drag & drop, con soporte táctil completo).
- Inicio rápido del entreno del día desde la propia rutina.
- **Historial de entrenamientos:** pestaña dedicada que lista todas las sesiones completadas con fecha, duración y series realizadas.

### 👤 Perfil, cuenta y ajustes
- Registro e inicio de sesión con email y contraseña (Supabase Auth).
- Sincronización de datos en la nube: entrenos, comidas, despensa y objetivos.
- Datos físicos (peso, altura, sexo, objetivo).
- Preferencias: tema claro/oscuro, unidades métrico/imperial, notificaciones (recordatorios de entreno, descansos, resúmenes semanales).

## Stack técnico

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack) + React 19 + TypeScript
- **Estilos:** Tailwind CSS v4, con theming por variables CSS (light/dark)
- **Iconos:** Lucide React
- **Backend:** [Supabase](https://supabase.com/) — auth por email/contraseña y persistencia (`@supabase/ssr`)
- **Estado:** React Context propio (sin librerías externas de estado) — stores separados para perfil/rutinas, sesión de entreno activa, tracking de cardio, comidas y despensa
- **Drag & drop:** `@dnd-kit` (core, sortable, modifiers, utilities)
- **Mapas:** MapLibre GL (WebGL) con teselas vectoriales de CartoDB para el tracking de rutas de cardio. Modo 2D/2.5D con edificios 3D.
- **Datos de alimentos:** API de Open Food Facts, normalizada a un modelo propio (`src/lib/food/`)
- **Animaciones:** Framer Motion
- **PWA:** manifest + service worker registrado para instalación e uso offline básico

## Estructura del proyecto

```
src/app/          rutas (App Router): inicio, login, onboarding, rutinas,
                  biblioteca, cardio, comidas, perfil
                  api/food/[barcode]  proxy a Open Food Facts
src/components/   cardio/, comidas/, exercise/, food/, layout/, profile/,
                  routines/, ui/, workout/
src/lib/          store/ (contexts), exercises/, food/, workout/, supabase/,
                  utils.ts, units.ts
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
