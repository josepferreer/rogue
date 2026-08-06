/**
 * Tool Registry — mapa Módulo → Tools. Nunca se entrega entero: el engine pide
 * solo el subconjunto de los módulos que el Intent Analyzer marcó como
 * relevantes. Un módulo fuera de scope no aporta ni un schema, así que Gemini
 * literalmente no sabe que esas tools existen.
 */
import type { JsonSchema, NoaModule, ToolDef, ToolModule } from "@/lib/noa/types";

export class ToolRegistry {
  private byModule = new Map<NoaModule, ToolModule>();
  private byName = new Map<string, ToolDef>();

  constructor(modules: ToolModule[]) {
    for (const mod of modules) {
      this.byModule.set(mod.id, mod);
      for (const tool of mod.tools) {
        if (this.byName.has(tool.name)) {
          throw new Error(`NOA: tool duplicada "${tool.name}"`);
        }
        this.byName.set(tool.name, tool);
      }
    }
  }

  /** Todos los módulos, para el Intent Analyzer (usa sus keywords). */
  modules(): ToolModule[] {
    return [...this.byModule.values()];
  }

  /** Tools de los módulos indicados. Vacío = charla general sin tools. */
  select(modules: NoaModule[]): ToolDef[] {
    const out: ToolDef[] = [];
    for (const id of modules) {
      const mod = this.byModule.get(id);
      if (mod) out.push(...mod.tools);
    }
    return out;
  }

  get(name: string): ToolDef | undefined {
    return this.byName.get(name);
  }

  /** Providers de contexto de los módulos en scope, para el Context Builder. */
  contextProviders(modules: NoaModule[]): ToolModule["contextProvider"][] {
    return modules
      .map((id) => this.byModule.get(id)?.contextProvider)
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }
}

/**
 * Proyección de una tool tal como la ve GEMINI: solo name, description y
 * parameters. Aquí se corta el acceso a handlers, tablas y módulos.
 */
export interface GeminiToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export function toGeminiSchemas(tools: ToolDef[]): GeminiToolSchema[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
