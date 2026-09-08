# Rogue — landing y API de NOA

Este repositorio **ya no es la aplicación**. Son dos cosas pequeñas y bien
delimitadas:

1. **La página de descarga** de Rogue, en <https://rogue-two.vercel.app>. Sirve
   el APK de Android y explica qué es la app.
2. **El servidor de NOA**, el asistente que vive dentro de la app. Aquí está su
   motor: los módulos, las herramientas y la conversación con Gemini.

La app está en otro sitio: **Rogue v3**, nativa, en Expo / React Native. Este
repo no la contiene y no la compila.

> **Si vienes del README anterior**, todo lo que describía —dashboard, sesión de
> entreno, comidas, cardio, rutinas, perfil, login, PWA— dejó de vivir aquí el
> 27 de agosto de 2026, en el commit `e127578` («la web se queda en landing +
> API de NOA»), que borró 184 ficheros. El README se había quedado quince días
> antes y nunca se actualizó. De ahí este.

## Qué hay de verdad

```
src/app/page.tsx          la landing entera: una sola página
src/app/layout.tsx        metadatos y tema
src/app/api/noa/          POST /api/noa    — el turno de NOA
src/app/api/version/      GET  /api/version — sha del despliegue
src/lib/noa/              el motor: módulos, herramientas, Gemini, auditoría
src/lib/api/guard.ts      quién puede llamar
public/downloads/         Rogue.apk, el fichero que se descarga
supabase/migrations/      28 migraciones (las de NOA entre ellas)
```

No hay `middleware.ts`, no hay Server Actions y no hay más rutas que la landing
y sus dos páginas de error.

## La descarga

El APK se sirve como fichero estático desde `public/downloads/Rogue.apk` y lo
enlaza una sola constante, `APK` en `src/app/page.tsx`. Se copia **a mano** al
publicar una versión.

**Para publicar un APK nuevo:**

1. Compilarlo en el repo de la app con `build-apk.ps1` (Windows) o
   `build-apk.sh` (Linux), **sin** la bandera de emulador: el APK del landing
   tiene que ser `arm64-v8a`. Uno de emulador (`x86_64`) se instala en un móvil
   y se cierra al arrancar.
2. Copiarlo sobre `public/downloads/Rogue.apk`.
3. Comprobar `APK_MB` en `src/app/page.tsx`. **Va en MEBIbytes**, que es como
   los cuenta Android: 68 lleva aguantando varias compilaciones seguidas
   mientras el navegador dice «71,7 MB». No se «corrige» a 71.
4. `git push`. Vercel despliega solo, en menos de un minuto.

Antes de subirlo conviene comprobar dos cosas del binario, que son las dos
trampas ya pagadas: que va firmado con la misma clave que el anterior —si no, a
quien lo tenga instalado le pedirá desinstalar primero— y que las variables de
Supabase están **dentro** del bundle, porque sin eso la app arranca y se queda
congelada en el splash sin ningún error.

> GitHub avisa en cada push de que el fichero pasa de 50 MB. Es un aviso, no un
> error: el límite duro son 100 MB. Lo que sí conviene tener presente es que
> cada publicación deja otros ~68 MB en el historial del repositorio.

## La API

### `POST /api/noa`

El turno completo de NOA. Recibe el mensaje, el historial reciente y una foto
del estado en vivo del móvil; devuelve la respuesta, las acciones que el cliente
debe ejecutar y las que están pendientes de que el usuario confirme.

```jsonc
// Entrada
{
  "message": "¿qué me toca hoy?",
  "history": [{ "role": "user", "content": "..." }],  // se recortan los últimos 12 turnos
  "confirm": { "actions": [{ "toolName": "...", "args": {} }] },  // rama de confirmación
  "clientDate": "2026-09-08",
  "clientNow": "2026-09-08T09:30:00+02:00",
  "live": {}                                          // entrada NO confiable, ver abajo
}

// Salida
{
  "reply": "...",
  "actions": [],   // ejecutar ya
  "pending": [],   // proponer al usuario, con id y resumen legible
  "meta": { "modules": [], "usedTools": [], "iterations": 1, "missingKey": false }
}
```

Errores: `401 unauthorized` sin sesión, `429 rate_limited`, `400 bad_request` si
el JSON no parsea, `400 message_required`, `400 toolName_required`.

Un fallo del motor **no** devuelve 5xx: sale como un turno normal con HTTP 200 y
una respuesta que dice qué ha pasado —que Gemini ha tardado demasiado, que la
cuota está agotada, que la clave no vale—. El detalle queda en el log.

`maxDuration` es 60 s, porque planificar una semana encadena varias llamadas.

### `GET /api/version`

Devuelve `{ version: <sha del despliegue> }` sin caché y sin autenticación.

> **Se quedó sin usuarios.** Existía para que el WebView del APK antiguo se
> enterase de que había código nuevo y se recargase. Ese APK ya no existe —el de
> hoy es React Native, no un WebView— y ni `use-deploy-watch` ni `DeployWatch`
> siguen en el repo. Se puede borrar el día que alguien lo confirme.

### Quién puede llamar

`requireCaller()` (`src/lib/api/guard.ts`) acepta dos vías: cabecera
`Authorization: Bearer <token>` —la app móvil, que no tiene cookies de este
dominio— o las cookies del navegador. El Bearer manda si vienen las dos. El
token **no** se descodifica a mano: se valida contra Supabase, así que uno
revocado deja de valer al momento. Si falla, se corta con 401 antes de leer el
cuerpo.

Hay un límite de **30 peticiones por usuario y minuto**. Es un `Map` en memoria
del proceso, así que en serverless cada instancia lleva su cuenta y **no es un
límite global**. Se asume a sabiendas: con BYOK, la cuota que se gasta es la del
propio usuario.

**La seguridad de fondo es la RLS de Supabase.** Se usa siempre la clave
pública, nunca la de servicio: con la de servicio, cada herramienta de NOA sería
una puerta abierta a la base entera.

## NOA por dentro

Un turno hace esto: detecta la intención por palabras clave, selecciona el
subconjunto de herramientas que puede usar, precarga un contexto, coge la clave
del usuario y entra en el bucle de Gemini (`gemini-3.5-flash-lite`, máximo 10
iteraciones, 45 s de tiempo límite). La lista blanca es dura: una herramienta
fuera del alcance del turno se rechaza sin ejecutarse.

Hay **ocho módulos** en `src/lib/noa/modules/` —entreno, nutrición, cardio,
estado en vivo, perfil, calendario, avisos y recuperación muscular— que suman
unas **40 herramientas**. Las de lectura se ejecutan solas bajo la RLS del
usuario; las que escriben salen como propuesta en `pending[]` con un resumen
legible, y solo se ejecutan cuando el cliente las devuelve en `confirm`.

> La excepción es `cancelReminder`, que está marcada como segura y se ejecuta
> sola. Cancela un aviso ya programado, así que tiene efecto: o se le pone
> confirmación, o queda dicho aquí que es deliberado.

Gemini nunca ve Supabase, ni tablas, ni SQL: solo el nombre, la descripción y
los parámetros de cada herramienta, y sus resultados en JSON. No existe ninguna
herramienta que ejecute SQL.

El campo `live` del cuerpo es **entrada no confiable** y pasa por una aduana que
valida y recorta: 40 ejercicios, 30 series por ejercicio, 220 muestras de ruta y
300 caracteres por texto. La ruta viaja como `[segundos, km acumulados]`, **sin
coordenadas**, a propósito.

Cada llamada a una herramienta se registra en `noa_tool_calls` con quién, qué,
cuándo y con qué resultado. Los argumentos pasan por un enmascarado que tapa
cualquier cosa que parezca una clave y trunca los textos largos. Un fallo de
auditoría nunca tumba la llamada.

### La clave de Gemini es del usuario (BYOK)

**No hay ninguna variable de entorno con la clave de Gemini, y no debe haberla.**
Cada usuario guarda la suya en su perfil y el servidor la lee bajo su propia
RLS; nunca vuelve entera al cliente. Sin clave, el turno responde
`meta.missingKey` y un texto que invita a ponerla en Ajustes.

## Variables de entorno

| Variable | Qué es |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Obligatoria.** Pública. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Obligatoria.** Pública por diseño. |
| `NEXT_PUBLIC_EXERCISE_IMG_BASE` | Opcional. Base de las imágenes de ejercicios. |
| `NEXT_PUBLIC_BUILD_ID` | Opcional. En Vercel la rellena `VERCEL_GIT_COMMIT_SHA`. |
| `SUPABASE_SECRET_KEY` | **Secreta.** No la usa ni la web ni NOA: solo los scripts de sembrado y de espejo de imágenes. |

Si faltan las dos obligatorias, la web no revienta: pinta una pantalla de
configuración que dice cuál falta.

`NEXT_PUBLIC_APP_VERSION` no se pone a mano; sale del `version` de
`package.json`.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # tests de node:test sobre src/**/*.test.ts
npm run lint
```

Hace falta un `.env` con al menos las dos variables obligatorias. **No hay
`.env.example`**: es lo primero que habría que añadir.

El despliegue es automático: lo que entra en `main` sale a Vercel.

## Lastre conocido

Cosas que están en el repositorio y no llama nadie. Se dejan escritas para que
la próxima persona no las tome por vivas:

- **Dependencias con cero imports** en `src/`: `@dnd-kit/*`, `maplibre-gl`,
  `@zxing/library`, `@capacitor-mlkit/barcode-scanning`,
  `@capacitor-community/background-geolocation`, `react-body-highlighter`.
  Todas son de cuando aquí vivía la app entera.
- `public/maplibre-gl-shared.mjs` y `public/maplibre-gl-worker.mjs`, sin nadie
  que los cargue.
- La carpeta `android/`, resto del envoltorio de Capacitor. Sus rastros de
  `minSdkVersion 24` **no** describen el APK que se sirve: ese es de Rogue v3 y
  pide Android 8.
- `GET /api/version`, explicado más arriba.
