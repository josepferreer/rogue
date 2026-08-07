# NOA — arquitectura Tool-First

NOA es **el agente**; vive en Rogue. **Gemini es solo el motor de razonamiento**:
recibe únicamente `{ name, description, parameters }` de un subconjunto de tools
y sus resultados en JSON. Nunca ve Supabase, tablas, SQL, handlers ni módulos.
Toda la lógica de negocio queda detrás de las tools.

## Flujo

```
POST /api/noa (guard: requireUser + rateLimit)
  └─ engine.runNoa
       1. analyzeIntent      turno → módulos relevantes         intent/analyzer.ts
       2. registry.select    módulos → subconjunto de tools     registry.ts
       3. buildContext       precarga snapshot compacto         context/builder.ts
       4. getUserGeminiKey   BYOK: clave del usuario (o corta)  keys.ts
       5. runGeminiLoop      razonar ⇄ ejecutar tools           gemini/loop.ts
            ├─ callGemini     único punto que habla con Gemini   gemini/client.ts
            └─ executeTool    read | write | client-action      executor.ts
                 └─ Action Gate  confirma writes/acciones        action-gate.ts
       6. NoaResponse { reply, actions[], pending[] }
```

## Piezas

| Fichero | Rol |
|---|---|
| `types.ts` | Contratos (`ToolDef`, `ToolModule`, `NoaClientAction`, `NoaResponse`). Seguro cliente+servidor. |
| `registry.ts` | Módulo→tools. `toGeminiSchemas` recorta lo que ve el modelo. |
| `intent/analyzer.ts` | Pre-filtro determinista por keywords (+ continuidad). Etapa router = TODO. |
| `context/builder.ts` | Snapshot compacto por módulo antes de llamar a Gemini. |
| `keys.ts` | BYOK: lee la clave del usuario en servidor; nunca la expone. |
| `gemini/client.ts` | REST `generateContent` con function calling nativo. Único acoplado a Gemini. |
| `gemini/loop.ts` | Bucle acotado; allow-list dura de tools. |
| `executor.ts` | Ejecuta una tool; aplica el Action Gate. |
| `action-gate.ts` | Decide qué requiere confirmación y arma la propuesta. |
| `audit.ts` | Log de tool-calls con redacción de secretos. |
| `personality-options.ts` | Tipos y catálogo de opciones. Cliente+servidor. |
| `personality.ts` | Preferencias → bloque de estilo del system prompt. Solo servidor. |
| `engine.ts` | Orquestador. |
| `modules/*` | Un módulo autocontenido por dominio. `training` y `nutrition` son los ejemplos completos. |

## Nutrición: de dónde salen las calorías

`addMealEntries` **no acepta macros del modelo**. Cada entrada referencia un
`pantryFoodId`, un `pantryDishId` o un `barcode`, y es el servidor quien resuelve
las macros (despensa u Open Food Facts). Si el usuario nombra algo que no tiene
en la despensa, NOA usa `searchFoodDatabase` y registra por `barcode`.

Así el modelo decide QUÉ registrar, nunca CUÁNTAS calorías tiene. El campo
`label` de cada entrada es **solo** para la tarjeta de confirmación; no se
guarda ni influye en los datos.

La excepción consciente es `savePantryFood`, donde las macros sí vienen en los
argumentos porque el caso de uso es que el usuario las dicte. Por eso su resumen
del Action Gate las enseña enteras antes de guardar.

`clearMealEntries` borra por defecto **solo lo planificado sin marcar**: lo que
el usuario ya marcó como comido es su historial real y hace falta pedir
`onlyPlanned: false` explícitamente para tocarlo.

Un plan semanal no es una tool aparte: es `addMealEntries` con muchas entradas
y `eaten: false`.

## Personalidad (capa de forma, no de lógica)

Cada usuario ajusta desde **Ajustes > NOA > Personalidad** cómo le habla NOA:
apodo, tono, carácter y longitud. Se guarda en `profiles` (migración
`20260806_noa_personality.sql`) y `engine.runNoa` lo inserta en el system prompt
entre las reglas base y el contexto.

**Esto NO toca el motor.** No pasa por el registro de tools, ni por el Action
Gate, ni por el bucle: el subconjunto de tools, la allow-list y las
confirmaciones son idénticos con cualquier combinación de ajustes. El bloque
termina reafirmando que el estilo nunca gana a usar una herramienta ni a decir
la verdad. Si se borrase el fichero, NOA respondería lo mismo con otro tono.

Al añadir una opción nueva: la clave va en `personality-options.ts` (compartido)
y su **texto de instrucción en `personality.ts`** (servidor). El cliente elige
claves; nunca redacta prompt.

## Seguridad (por construcción)

- Gemini solo recibe `{name, description, parameters}` → no ve estructura de BD.
- No existe —ni existirá— una tool `runSql`/`query`.
- Toda tool corre bajo la RLS del usuario (`ctx.supabase` autenticado).
- Allow-list: una tool-call fuera del scope del turno se rechaza.
- Writes y acciones con efecto pasan por el Action Gate (confirmación).
- La clave BYOK nunca se registra ni vuelve entera al cliente.

## Añadir un módulo

1. Crear `modules/<mod>/index.ts` exportando un `ToolModule`.
2. Registrarlo en `modules/index.ts` (`ALL_MODULES`).
   El núcleo de NOA no se toca.

## Canal de vuelta al cliente

NOA escribe en **servidor**, así que los stores del móvil no se enteran solos.
Cada write lleva `refetch: NoaRefetchScope` en su `ToolDef`; el executor emite
`{ type: "refetch", scope }` tras ejecutarlo con éxito y el dispatcher lo
traduce a la recarga del store correspondiente (`useMeals().reload`,
`useRogue().reloadRoutine`). **Al añadir un write nuevo, ponle su `refetch`** o
el usuario verá la pantalla sin actualizar y creerá que no ha pasado nada.

`cardio` todavía no tiene recarga en su store: ese scope se ignora a propósito
en vez de fingir que refresca.

La conversación vive en el componente `Noa` (no en la hoja, que se desmonta al
cerrar) y se persiste en `sessionStorage`.

## Intent en dos etapas

1. **Palabras clave** (gratis, determinista). Puntúa por número de aciertos y
   se queda con los 4 módulos mejores: con 6 módulos registrados, una frase
   larga casaba media app y le metía a Gemini decenas de tools irrelevantes.
2. **Router con Gemini** (`intent/router.ts`), SOLO si la etapa 1 se queda a
   cero. Es el caso que más dolía: "¿cómo lo llevo?" no casa nada y NOA
   respondía sin herramientas, o sea sin datos. Cuesta una llamada extra a la
   clave del usuario, por eso no se usa cuando la etapa 1 ya acertó. Si falla,
   el turno sigue como conversación general.

## Pendiente

- Módulos: **heatmap** (la funcionalidad no existe todavía en Rogue).
- Conectar writes a la cola persistente `SyncOp` (idempotente, offline).
- `openModal`, `prefillForm` y `highlight`: no hay registro de modales por
  nombre, formularios prellenables ni anclas. El dispatcher avisa en vez de
  fingir.
- El store de cardio no expone recarga, así que `deleteCardioSession` no lleva
  `refetch`: tras borrar una ruta hay que recargar para verlo.
- `rateLimit` cuenta por instancia (Map en memoria): en serverless el límite
  real se multiplica por el número de instancias. Con BYOK la cuota que se
  gasta es la del propio usuario, así que se deja así a sabiendas en vez de
  meter una ida y vuelta a BD en cada turno.
- Migraciones `20260806_noa_byok.sql` y `20260806_noa_personality.sql`
  aplicadas en Supabase.
```
