import "server-only";
import type { NoaModule, NoaToolContext } from "@/lib/noa/types";
import type { ToolRegistry } from "@/lib/noa/registry";

/**
 * Context Builder — antes de llamar a Gemini, precarga un snapshot COMPACTO por
 * módulo activo, para que el modelo arranque informado y necesite menos idas y
 * vueltas. Ej.: nutrición → { objetivoKcal, kcalHoy, proteinaHoy, entrenoHoy }.
 *
 * Usa los mismos providers de cada módulo (una sola fuente de verdad). Un
 * provider que falla no tumba el turno: se omite su parte del contexto.
 */
export type NoaContextSnapshot = Record<NoaModule | string, unknown>;

export async function buildContext(
  registry: ToolRegistry,
  modules: NoaModule[],
  ctx: NoaToolContext,
): Promise<NoaContextSnapshot> {
  const providers = registry.contextProviders(modules);
  const snapshot: NoaContextSnapshot = {};

  await Promise.all(
    providers.map(async (provider) => {
      if (!provider) return;
      try {
        const part = await provider(ctx);
        Object.assign(snapshot, part);
      } catch (err) {
        console.warn(
          "[noa:context] provider falló:",
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );

  return snapshot;
}

/** Serializa el snapshot como bloque legible para el system prompt. */
export function renderContextBlock(snapshot: NoaContextSnapshot): string {
  if (Object.keys(snapshot).length === 0) return "";
  return [
    "CONTEXTO PRECARGADO (datos reales del usuario, ya obtenidos vía tools):",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");
}
