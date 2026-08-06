import "server-only";
import type { GeminiToolSchema } from "@/lib/noa/registry";

/**
 * ÚNICO fichero que habla con Gemini. Todo lo demás es agnóstico al proveedor.
 *
 * Usa la REST API `generateContent` con function calling NATIVO
 * (`tools[].functionDeclarations`), sin SDK, para no añadir dependencia. La
 * clave es BYOK: entra por parámetro (la del usuario), nunca de una env global.
 *
 * Gemini recibe solo: system prompt + conversación + schemas {name, description,
 * parameters} + resultados de tools en JSON. Nunca Supabase, tablas ni SQL.
 */

// Modelo fijo (no alias `-latest`): el tier gratuito da 500 solicitudes/día a
// gemini-3.5-flash-lite, frente a las 20 que da el flash "latest" (hoy 3.6).
// BYOK: la key del usuario debe tener acceso a este modelo. Verificado 08/2026.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Un turno que arma un plan semanal (decenas de entradas en una sola
// function call) tarda bastante más que una respuesta corta. Con 20 s se
// cortaban justo esos, que son los más caros de rehacer.
const TIMEOUT_MS = 45_000;

/** Rol de un turno en el formato de la API de Gemini. */
export type GeminiRole = "user" | "model";

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Parte de contenido: texto, llamada a función o respuesta de función.
 *
 * `thoughtSignature` viene en las partes del modelo (Gemini 3.x) y es
 * OBLIGATORIO reenviarla tal cual al devolver el `functionResponse`, o la API
 * responde 400. Por eso el loop reenvía las partes del modelo sin reconstruir.
 */
export type GeminiPart =
  | { text: string; thoughtSignature?: string }
  | { functionCall: GeminiFunctionCall; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

/** Resultado normalizado de un turno del modelo. */
export interface GeminiTurn {
  text: string;
  functionCalls: GeminiFunctionCall[];
  /** Partes crudas del modelo (con `thoughtSignature`), para reenviarlas tal
   *  cual en el siguiente turno. No las reconstruyas: perderías la firma. */
  modelParts: GeminiPart[];
}

export interface CallGeminiOptions {
  apiKey: string;
  system: string;
  contents: GeminiContent[];
  tools: GeminiToolSchema[];
}

/** Error tipado para distinguir "clave inválida" de un fallo transitorio. */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function callGemini(opts: CallGeminiOptions): Promise<GeminiTurn> {
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    ...(opts.tools.length > 0
      ? {
          tools: [
            {
              functionDeclarations: opts.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
            },
          ],
          // AUTO: el modelo decide entre responder texto o llamar a una tool
          // (lo correcto para un agente). ANY lo forzaría a llamar siempre a
          // alguna, útil solo si en un turno queremos obligar el uso de tools.
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        }
      : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINT(GEMINI_MODEL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Clave del usuario por cabecera (no en la URL: no acaba en logs).
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Sin esto, un timeout o un corte de red escapaban como AbortError/TypeError
    // crudo: la route devolvia 500 y el chat solo decia "no he podido
    // responder", sin forma de saber que habia pasado.
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new GeminiError(
      aborted
        ? `Gemini no respondió en ${TIMEOUT_MS / 1000}s`
        : `No se pudo contactar con Gemini: ${err instanceof Error ? err.message : String(err)}`,
      aborted ? 504 : 503,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(
      `Gemini respondió ${res.status}: ${detail.slice(0, 200)}`,
      res.status,
    );
  }

  const json = (await res.json()) as GeminiGenerateResponse;
  return normalizeTurn(json);
}

// —— Formas mínimas de la respuesta que nos interesan ——
interface GeminiGenerateResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
  }[];
}

function normalizeTurn(json: GeminiGenerateResponse): GeminiTurn {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  const functionCalls: GeminiFunctionCall[] = [];

  for (const part of parts) {
    if ("text" in part && part.text) text += part.text;
    if ("functionCall" in part && part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      });
    }
  }

  return { text: text.trim(), functionCalls, modelParts: parts };
}
