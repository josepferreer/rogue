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
| `engine.ts` | Orquestador. |
| `modules/*` | Un módulo autocontenido por dominio. `training` es el ejemplo completo. |

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

## Pendiente

- Módulos: nutrition, cardio, statistics, profile, calendar, notifications,
  library, settings, y **heatmap** (aún no existe en Rogue).
- Conectar writes a la cola persistente `SyncOp` (idempotente, offline).
- UI de chat + dispatcher de `NoaClientAction` en el cliente.
- Etapa 2 del Intent Analyzer (router con Gemini Flash) para casos ambiguos.
- Migración `20260806_noa_byok.sql` aplicada en Supabase.
```
