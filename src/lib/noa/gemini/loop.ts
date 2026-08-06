import "server-only";
import type {
  NoaClientAction,
  NoaProposedAction,
  NoaToolContext,
  ToolDef,
} from "@/lib/noa/types";
import { toGeminiSchemas } from "@/lib/noa/registry";
import { callGemini, type GeminiContent } from "@/lib/noa/gemini/client";
import { executeTool } from "@/lib/noa/executor";

/**
 * Bucle de razonamiento: alterna Gemini ⇄ ejecución de tools hasta que el
 * modelo emite texto final o se agotan las iteraciones (freno anti-runaway).
 *
 * Allow-list dura: si Gemini pide una tool que NO está en el subconjunto en
 * scope, se rechaza y se le devuelve un error como resultado. No puede tocar
 * nada fuera de lo que el Intent Analyzer autorizó para este turno.
 */
const MAX_ITERATIONS = 10;

export interface LoopResult {
  reply: string;
  actions: NoaClientAction[];
  pending: NoaProposedAction[];
  usedTools: string[];
  iterations: number;
}

export interface LoopInput {
  apiKey: string;
  system: string;
  /** Conversación previa + turno actual, ya en formato Gemini. */
  contents: GeminiContent[];
  /** Tools en scope (subconjunto de módulos relevantes). */
  tools: ToolDef[];
  ctx: NoaToolContext;
}

export async function runGeminiLoop(input: LoopInput): Promise<LoopResult> {
  const schemas = toGeminiSchemas(input.tools);
  const byName = new Map(input.tools.map((t) => [t.name, t]));
  const contents = [...input.contents];

  const actions: NoaClientAction[] = [];
  const pending: NoaProposedAction[] = [];
  const usedTools: string[] = [];
  let reply = "";
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    const turn = await callGemini({
      apiKey: input.apiKey,
      system: input.system,
      contents,
      tools: schemas,
    });

    if (turn.text) reply = turn.text;

    // Sin tool-calls: turno final.
    if (turn.functionCalls.length === 0) break;

    // Registrar el turno del modelo TAL CUAL: sus partes traen el
    // `thoughtSignature` (Gemini 3.x) que es obligatorio reenviar, o el
    // functionResponse siguiente da 400. Nunca reconstruir estas partes.
    contents.push({ role: "model", parts: turn.modelParts });

    const responseParts: GeminiContent["parts"] = [];
    for (const call of turn.functionCalls) {
      usedTools.push(call.name);
      const tool = byName.get(call.name);

      // Allow-list: tool fuera de scope → error, nunca se ejecuta.
      if (!tool) {
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { error: "tool no disponible en este contexto" },
          },
        });
        continue;
      }

      const outcome = await executeTool(tool, call.args, input.ctx);
      switch (outcome.status) {
        case "result":
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { result: outcome.value },
            },
          });
          break;
        case "action":
          actions.push(outcome.action);
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { status: "dispatched" },
            },
          });
          break;
        case "pending":
          pending.push(outcome.proposal);
          responseParts.push({
            functionResponse: {
              name: call.name,
              // Gemini redacta la confirmación en lenguaje natural con esto.
              response: {
                status: "pending_confirmation",
                summary: outcome.proposal.summary,
              },
            },
          });
          break;
        case "error":
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: outcome.message },
            },
          });
          break;
      }
    }

    contents.push({ role: "user", parts: responseParts });
  }

  return { reply, actions, pending, usedTools, iterations };
}
