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

const logBodyWeight: ToolDef = {
  name: "logBodyWeight",
  description:
    "Registra un pesaje en el historial de peso corporal y actualiza el peso actual del perfil. Úsala cuando el usuario diga cuánto pesa («hoy me he pesado 79,4»). Preferible a updateProfile para el peso: esta guarda el histórico, la otra solo sobrescribe el valor actual.",
  parameters: {
    type: "object",
    properties: {
      weightKg: { type: "number", description: "Peso en kilogramos." },
      date: {
        type: "string",
        description: "Día del pesaje en YYYY-MM-DD. Por defecto, hoy.",
      },
    },
    required: ["weightKg"],
  },
  module: "profile",
  kind: "write",
  sensitivity: "confirm",
  refetch: "profile",
  summarize(args) {
    const dia = typeof args.date === "string" ? ` (${args.date})` : "";
    return `Registrar ${Number(args.weightKg)} kg como tu peso${dia}.`;
  },
  async handler(args, ctx: NoaToolContext) {
    const weightKg = Number(args.weightKg);
    // Rango de cordura: filtra un "peso" que en realidad eran las repes o los
    // kilos de la barra, que es el error tipico al dictar.
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400) {
      throw new Error("Ese peso no parece correcto (debe estar entre 20 y 400 kg).");
    }
    const date =
      typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
        ? args.date
        : ctx.today;

    const { error } = await ctx.supabase
      .from("body_weight_log")
      .upsert(
        { user_id: ctx.userId, date, weight_kg: weightKg },
        { onConflict: "user_id,date" },
      );
    if (error) throw new Error(error.message);

    // El perfil guarda el peso ACTUAL: solo se toca si el pesaje es el mas
    // reciente (registrar uno antiguo no debe pisar el de hoy).
    const { data: ultimo } = await ctx.supabase
      .from("body_weight_log")
      .select("date, weight_kg")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimo && ultimo.date === date) {
      await ctx.supabase
        .from("profiles")
        .update({ bodyweight_kg: weightKg })
        .eq("user_id", ctx.userId);
    }

    return { registrado: true, date, pesoKg: weightKg };
  },
};

const getWeightHistory: ToolDef = {
  name: "getWeightHistory",
  description:
    "Historial de peso corporal del usuario en una ventana de días, con la variación total. Úsala para «¿cuánto he adelgazado este mes?» o para ver la tendencia. Si devuelve un solo pesaje, dilo: no hay tendencia con un único dato.",
  parameters: {
    type: "object",
    properties: {
      days: {
        type: "integer",
        description: "Ventana hacia atrás en días (def. 90, máx. 730).",
      },
    },
  },
  module: "profile",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const days = clampInt(args.days, 90, 1, 730);
    const desde = new Date(ctx.now.getTime() - days * 86400_000)
      .toISOString()
      .slice(0, 10);

    const { data, error } = await ctx.supabase
      .from("body_weight_log")
      .select("date, weight_kg")
      .gte("date", desde)
      .order("date", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((r) => ({
      date: r.date as string,
      pesoKg: Number(r.weight_kg),
    }));
    if (rows.length === 0) {
      return { ventanaDias: days, pesajes: [], aviso: "No hay pesajes en ese periodo." };
    }
    const primero = rows[0];
    const ultimo = rows[rows.length - 1];
    return {
      ventanaDias: days,
      pesajes: rows,
      primero,
      ultimo,
      variacionKg: Number((ultimo.pesoKg - primero.pesoKg).toFixed(2)),
      // Con un solo pesaje la "variacion" es 0 y enganaria: se avisa.
      tendenciaFiable: rows.length >= 2,
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
  tools: [
    getProfile,
    logBodyWeight,
    getWeightHistory,
    updateProfile,
    updatePreferences,
  ],
  intentKeywords: [
    "perfil",
    "peso",
    "pesado",
    "peso corporal",
    "adelgaz",
    "engord",
    "bascula",
    "báscula",
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

/** Entero acotado con valor por defecto, para args que vienen de Gemini. */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

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
