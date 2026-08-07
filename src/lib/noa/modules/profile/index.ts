import "server-only";
import type { NoaToolContext, ToolDef, ToolModule } from "@/lib/noa/types";

/**
 * Módulo PROFILE — datos físicos y preferencias del usuario.
 *
 * Lectura:   getProfile
 * Escritura: updateProfile, updatePreferences   (ambas con confirmación)
 *
 * Deliberadamente NO expone: `username` (cambiarlo tiene reglas de unicidad y
 * pertenece al registro), `email`, ni `noa_gemini_key`. Tampoco los ajustes de
 * personalidad de NOA: son cómo habla NOA, y dejar que se los cambie a sí
 * misma en conversación es un lío difícil de deshacer para el usuario. Todo eso
 * se toca en Ajustes, a mano.
 */

const SEXES = ["hombre", "mujer"] as const;
const UNITS = ["kg", "lb"] as const;

const getProfile: ToolDef = {
  name: "getProfile",
  description:
    "Datos del usuario: nombre, sexo, peso corporal, altura, objetivo y preferencias (unidades, avisos). Úsala antes de calcular nada que dependa del peso o de proponer cambios.",
  parameters: { type: "object", properties: {} },
  module: "profile",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    const { data, error } = await ctx.supabase
      .from("profiles")
      .select(
        "name, sex, bodyweight_kg, height_cm, goal, unit, notify_reminders, notify_rest_end, notify_weekly_summary",
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { perfil: null };

    return {
      perfil: {
        name: data.name,
        sex: data.sex,
        bodyweightKg: num(data.bodyweight_kg),
        heightCm: num(data.height_cm),
        goal: data.goal,
      },
      preferencias: {
        unit: data.unit,
        avisosEntreno: data.notify_reminders === true,
        avisoDescanso: data.notify_rest_end === true,
        resumenSemanal: data.notify_weekly_summary === true,
      },
    };
  },
};

const updateProfile: ToolDef = {
  name: "updateProfile",
  description:
    "Actualiza datos físicos del usuario. Manda SOLO los campos que cambian. El peso corporal afecta a estimaciones de toda la app, así que no lo cambies salvo que el usuario lo diga explícitamente.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre visible." },
      sex: { type: "string", enum: [...SEXES], description: "Sexo biológico." },
      bodyweightKg: { type: "number", description: "Peso corporal en kg." },
      heightCm: { type: "number", description: "Altura en cm." },
      goal: { type: "string", description: "Objetivo (p.ej. «Hipertrofia»)." },
    },
  },
  module: "profile",
  kind: "write",
  sensitivity: "confirm",
  refetch: "profile",
  summarize(args) {
    const cambios = [
      args.name !== undefined ? `nombre → ${args.name}` : null,
      args.sex !== undefined ? `sexo → ${args.sex}` : null,
      args.bodyweightKg !== undefined ? `peso → ${args.bodyweightKg} kg` : null,
      args.heightCm !== undefined ? `altura → ${args.heightCm} cm` : null,
      args.goal !== undefined ? `objetivo → ${args.goal}` : null,
    ].filter(Boolean);
    return `Actualizar tu perfil:\n${cambios.map((c) => `• ${c}`).join("\n")}`;
  },
  async handler(args, ctx: NoaToolContext) {
    const row: Record<string, unknown> = {};
    if (typeof args.name === "string") row.name = args.name.trim().slice(0, 60);
    if (typeof args.sex === "string" && (SEXES as readonly string[]).includes(args.sex)) {
      row.sex = args.sex;
    }
    // Rangos sanos: protegen de un número disparatado del modelo o de un lapsus
    // del usuario, que luego contaminaría todas las estimaciones.
    if (args.bodyweightKg !== undefined) {
      row.bodyweight_kg = inRange(args.bodyweightKg, 25, 350, "peso corporal");
    }
    if (args.heightCm !== undefined) {
      row.height_cm = inRange(args.heightCm, 100, 250, "altura");
    }
    if (typeof args.goal === "string") row.goal = args.goal.trim().slice(0, 60);

    if (Object.keys(row).length === 0) throw new Error("No hay nada que cambiar.");
    const { error } = await ctx.supabase
      .from("profiles")
      .update(row)
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return { actualizado: Object.keys(row) };
  },
};

const updatePreferences: ToolDef = {
  name: "updatePreferences",
  description:
    "Cambia las preferencias de la app: unidades de peso y qué avisos recibe el usuario.",
  parameters: {
    type: "object",
    properties: {
      unit: { type: "string", enum: [...UNITS], description: "Unidad de peso." },
      avisosEntreno: { type: "boolean", description: "Recordatorios de entreno." },
      avisoDescanso: { type: "boolean", description: "Aviso al acabar el descanso." },
      resumenSemanal: { type: "boolean", description: "Resumen semanal." },
    },
  },
  module: "profile",
  kind: "write",
  sensitivity: "confirm",
  refetch: "profile",
  summarize(args) {
    const cambios = [
      args.unit !== undefined ? `unidades → ${args.unit}` : null,
      args.avisosEntreno !== undefined
        ? `recordatorios de entreno → ${args.avisosEntreno ? "sí" : "no"}`
        : null,
      args.avisoDescanso !== undefined
        ? `aviso de descanso → ${args.avisoDescanso ? "sí" : "no"}`
        : null,
      args.resumenSemanal !== undefined
        ? `resumen semanal → ${args.resumenSemanal ? "sí" : "no"}`
        : null,
    ].filter(Boolean);
    return `Cambiar tus ajustes:\n${cambios.map((c) => `• ${c}`).join("\n")}`;
  },
  async handler(args, ctx: NoaToolContext) {
    const row: Record<string, unknown> = {};
    if (typeof args.unit === "string" && (UNITS as readonly string[]).includes(args.unit)) {
      row.unit = args.unit;
    }
    if (typeof args.avisosEntreno === "boolean") row.notify_reminders = args.avisosEntreno;
    if (typeof args.avisoDescanso === "boolean") row.notify_rest_end = args.avisoDescanso;
    if (typeof args.resumenSemanal === "boolean") {
      row.notify_weekly_summary = args.resumenSemanal;
    }

    if (Object.keys(row).length === 0) throw new Error("No hay nada que cambiar.");
    const { error } = await ctx.supabase
      .from("profiles")
      .update(row)
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return { actualizado: Object.keys(row) };
  },
};

async function contextProvider(ctx: NoaToolContext) {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("name, bodyweight_kg, goal, unit")
    .maybeSingle();
  return {
    profile: data
      ? {
          name: data.name,
          bodyweightKg: num(data.bodyweight_kg),
          goal: data.goal,
          unit: data.unit,
        }
      : null,
  };
}

export const profileModule: ToolModule = {
  id: "profile",
  tools: [getProfile, updateProfile, updatePreferences],
  intentKeywords: [
    "perfil",
    "peso",
    "pesar",
    "altura",
    "estatura",
    "objetivo",
    "unidades",
    "kilos",
    "libras",
    "ajuste",
    "ajustes",
    "preferencia",
    "preferencias",
    "aviso",
    "avisos",
    "notificacion",
    "notificaciones",
  ],
  contextProvider,
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inRange(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`Valor fuera de rango para ${label} (${min}–${max}).`);
  }
  return Math.round(n * 10) / 10;
}
