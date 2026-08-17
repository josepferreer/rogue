import "server-only";
import type {
  NoaLiveExercise,
  NoaToolContext,
  ToolDef,
  ToolModule,
} from "@/lib/noa/types";
import { estimateKcal } from "@/lib/cardio/estimates";
import { analyzePace, paceLabel } from "@/lib/noa/modules/live/pace";

/**
 * Módulo LIVE — lo que está pasando AHORA MISMO.
 *
 * Los demás módulos leen Supabase, es decir, el pasado. Este lee el snapshot
 * que el móvil adjunta al turno (`ctx.live`) y lo CRUZA con el historial:
 *
 *   getActiveWorkout → el entreno abierto, ejercicio a ejercicio, con lo que
 *                      hizo la última vez en cada uno, su récord y la nota que
 *                      dejó, para poder responder "¿cómo lo llevo?" de verdad.
 *   getActiveCardio  → la ruta grabándose, con tramos de correr/andar, splits
 *                      por km y tendencia del ritmo, comparado con su media.
 *
 * El módulo solo entra en scope cuando hay algo en curso (lo decide el engine).
 * Aun así cada tool comprueba `ctx.live`: si el snapshot no llegó, lo dice en
 * vez de inventarse una sesión.
 *
 * Igual que en `cardio`, aquí NO hay coordenadas. El análisis de ritmo sale de
 * una serie tiempo→distancia; la traza no sale del dispositivo.
 */

const getActiveWorkout: ToolDef = {
  name: "getActiveWorkout",
  description:
    "Estado del entreno que el usuario tiene ABIERTO ahora mismo en la app: cuánto lleva, qué series ha marcado ya, cuáles le faltan, cuánto peso lleva movido y, para cada ejercicio, lo que hizo la última vez, su mejor marca histórica y la nota que se dejó. Úsala SIEMPRE que pregunte por el entreno en curso («¿cómo lo llevo?», «¿voy bien?», «¿cuánto me queda?», «¿subo el peso?»). No sirve para entrenos pasados: para eso están getWorkoutHistory y getExerciseProgress.",
  parameters: { type: "object", properties: {} },
  module: "live",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    const live = ctx.live?.workout;
    if (!live || live.exercises.length === 0) {
      return {
        hayEntrenoEnCurso: false,
        mensaje:
          "El usuario no tiene ningún entreno abierto en la app en este momento.",
      };
    }

    const ids = live.exercises.map((e) => e.exerciseId);
    const [historial, notas, mismoDia] = await Promise.all([
      readExerciseHistory(ctx, ids),
      readLastNotes(ctx, ids),
      readLastSessionWithLabel(ctx, live.dayLabel),
    ]);

    const ejercicios = live.exercises.map((ex) => {
      const hechas = ex.sets.filter((s) => s.done && s.reps > 0);
      const volumen = hechas.reduce((a, s) => a + s.weightKg * s.reps, 0);
      const mejorHoy = bestSet(hechas);
      const prev = historial.get(ex.exerciseId);
      const nota = notas.get(ex.exerciseId);

      return {
        exerciseId: ex.exerciseId,
        nombre: ex.name,
        seriesHechas: hechas.length,
        seriesPlanificadas: Math.max(ex.plannedSets, ex.sets.length),
        seriesPendientes: pendingSets(ex),
        volumenKg: round(volumen, 1),
        mejorSerieHoy: mejorHoy,
        // Lo que hace útil la respuesta: el mismo ejercicio, la última vez.
        ultimaVez: prev?.ultimaVez ?? null,
        mejorHistorico: prev?.mejorHistorico ?? null,
        // Comparación ya resuelta aquí: el modelo no tiene que restar bien.
        diferenciaConUltimaVez: compare(mejorHoy, prev?.ultimaVez ?? null),
        notaAnterior: nota ?? null,
        notaDeHoy: ex.flag || ex.note ? { flag: ex.flag ?? null, texto: ex.note ?? null } : null,
      };
    });

    const seriesHechas = ejercicios.reduce((a, e) => a + e.seriesHechas, 0);
    const seriesTotales = ejercicios.reduce((a, e) => a + e.seriesPlanificadas, 0);
    const volumenHoy = ejercicios.reduce((a, e) => a + e.volumenKg, 0);

    return {
      hayEntrenoEnCurso: true,
      entreno: {
        dia: live.dayLabel,
        foco: live.focus ?? null,
        minutosTranscurridos: Math.round(live.elapsedSec / 60),
        descansando: live.restRemainingSec > 0,
        segundosDeDescansoRestantes: live.restRemainingSec,
        seriesHechas,
        seriesTotales,
        porcentajeCompletado:
          seriesTotales > 0 ? Math.round((seriesHechas / seriesTotales) * 100) : 0,
        volumenKgHoy: round(volumenHoy, 1),
      },
      // Referencia global: el mismo día de rutina, la última vez que lo hizo.
      mismoEntrenoAnterior: mismoDia
        ? {
            fecha: mismoDia.fecha,
            volumenKg: mismoDia.volumenKg,
            minutos: mismoDia.durationSec ? Math.round(mismoDia.durationSec / 60) : null,
            // Solo comparable cuando el entreno va por la mitad o más: a la
            // tercera serie de doce, "llevas un 20 % menos" no significa nada.
            volumenComparable: seriesTotales > 0 && seriesHechas / seriesTotales >= 0.5,
          }
        : null,
      ejercicios,
    };
  },
};

const getActiveCardio: ToolDef = {
  name: "getActiveCardio",
  description:
    "Estado de la ruta de cardio que se está GRABANDO ahora mismo con el GPS: distancia, tiempo, ritmo medio, ritmo de los últimos minutos y un desglose de los tramos en los que ha corrido, trotado, andado o estado parado, con los parciales por kilómetro. Incluye la comparación con su ritmo habitual. Úsala SIEMPRE que pregunte por la ruta en marcha («¿cómo ves mi ritmo?», «¿voy bien?», «¿cuánto llevo?», «¿estoy aflojando?»). No sirve para rutas terminadas: para eso está getCardioHistory.",
  parameters: { type: "object", properties: {} },
  module: "live",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    const live = ctx.live?.cardio;
    if (!live) {
      return {
        hayRutaEnCurso: false,
        mensaje: "El usuario no tiene ninguna ruta grabándose en este momento.",
      };
    }

    const analisis = analyzePace(live.samples);
    const [peso, habitual] = await Promise.all([
      readBodyweight(ctx),
      readUsualPace(ctx),
    ]);

    return {
      hayRutaEnCurso: true,
      enPausa: live.paused,
      siguiendoRutaGuardada: live.followingRoute,
      distanciaKm: round(live.distanceKm, 2),
      tiempoSec: live.durationSec,
      minutos: Math.round(live.durationSec / 60),
      ritmoMedioMinKm: paceLabel(live.distanceKm, live.durationSec),
      kcalEstimadas: estimateKcal(live.distanceKm, peso),
      // El desglose fino sale del análisis de la serie GPS; puede faltar al
      // principio de la ruta, y entonces se dice en vez de inventarlo.
      analisisFiable: analisis.suficiente,
      ritmoRecienteMinKm: analisis.ritmoRecienteMinKm,
      tendencia: analisis.tendencia,
      reparto: analisis.reparto,
      tramos: analisis.tramos,
      splitsPorKm: analisis.splitsPorKm,
      ritmoHabitual: habitual,
      notaSobreEstimaciones:
        "Las kcal son una estimación por peso y distancia, no una medición.",
    };
  },
};

/* ————————————————————— lecturas de apoyo ————————————————————— */

interface SetRef {
  reps: number;
  weightKg: number;
}

interface PrevExercise {
  ultimaVez: {
    fecha: string;
    series: SetRef[];
    mejorSerie: SetRef | null;
    est1RM: number | null;
  };
  mejorHistorico: { weightKg: number; est1RM: number } | null;
}

/** Ventana de historial para el cruce. Un año cubre cualquier "la última vez"
 *  razonable sin traerse la vida entera del usuario en cada turno. */
const HISTORY_DAYS = 365;
/** Tope de filas: con 40 ejercicios en sesión, de sobra para la última vez y
 *  el récord de cada uno. */
const HISTORY_ROWS = 600;

/**
 * Para cada ejercicio del entreno abierto: las series de la ÚLTIMA sesión en
 * que se hizo, y el mejor peso / 1RM estimado del último año.
 */
async function readExerciseHistory(
  ctx: NoaToolContext,
  exerciseIds: string[],
): Promise<Map<string, PrevExercise>> {
  const out = new Map<string, PrevExercise>();
  if (exerciseIds.length === 0) return out;

  const since = new Date(ctx.now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const { data, error } = await ctx.supabase
    .from("workout_sets")
    .select("exercise_id, weight_kg, reps, session_id, workout_sessions!inner(date)")
    .in("exercise_id", exerciseIds)
    .gte("workout_sessions.date", since)
    .order("workout_sessions(date)", { ascending: false })
    .limit(HISTORY_ROWS);
  if (error) throw new Error(error.message);

  // Las filas llegan de más reciente a más antigua: la primera sesión que
  // aparece para un ejercicio es, por construcción, la última vez que lo hizo.
  const lastSessionOf = new Map<string, string>();
  const buckets = new Map<string, { fecha: string; series: SetRef[] }>();
  const records = new Map<string, { weightKg: number; est1RM: number }>();

  for (const row of data ?? []) {
    const r = row as {
      exercise_id: string;
      weight_kg: number;
      reps: number;
      session_id: string;
      workout_sessions: { date: string } | { date: string }[];
    };
    const sess = Array.isArray(r.workout_sessions) ? r.workout_sessions[0] : r.workout_sessions;
    const fecha = String(sess?.date ?? "").slice(0, 10);
    const weightKg = num(r.weight_kg);
    const reps = num(r.reps);

    const record = records.get(r.exercise_id);
    const est = est1RM(weightKg, reps);
    if (!record || est > record.est1RM) {
      records.set(r.exercise_id, {
        weightKg: Math.max(weightKg, record?.weightKg ?? 0),
        est1RM: est,
      });
    } else if (weightKg > record.weightKg) {
      records.set(r.exercise_id, { ...record, weightKg });
    }

    const marked = lastSessionOf.get(r.exercise_id);
    if (marked === undefined) lastSessionOf.set(r.exercise_id, r.session_id);
    else if (marked !== r.session_id) continue;
    const bucket = buckets.get(r.exercise_id) ?? { fecha, series: [] };
    bucket.series.push({ reps, weightKg });
    buckets.set(r.exercise_id, bucket);
  }

  for (const [exerciseId, bucket] of buckets) {
    const mejor = bestSet(bucket.series);
    out.set(exerciseId, {
      ultimaVez: {
        fecha: bucket.fecha,
        series: bucket.series,
        mejorSerie: mejor,
        est1RM: mejor ? est1RM(mejor.weightKg, mejor.reps) : null,
      },
      mejorHistorico: records.get(exerciseId) ?? null,
    });
  }
  return out;
}

/** Última nota/flag de cada ejercicio ("la última vez me dejé dicho subir"). */
async function readLastNotes(
  ctx: NoaToolContext,
  exerciseIds: string[],
): Promise<Map<string, { flag: string | null; texto: string | null; fecha: string }>> {
  const out = new Map<string, { flag: string | null; texto: string | null; fecha: string }>();
  if (exerciseIds.length === 0) return out;

  const { data, error } = await ctx.supabase
    .from("exercise_notes")
    .select("exercise_id, flag, note, created_at")
    .in("exercise_id", exerciseIds)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const r = row as { exercise_id: string; flag: string | null; note: string | null; created_at: string };
    if (out.has(r.exercise_id)) continue; // la primera es la más reciente
    if (!r.flag && !r.note) continue;
    out.set(r.exercise_id, {
      flag: r.flag,
      texto: r.note,
      fecha: String(r.created_at).slice(0, 10),
    });
  }
  return out;
}

/** La última vez que hizo ESTE mismo día de rutina, para comparar el total. */
async function readLastSessionWithLabel(
  ctx: NoaToolContext,
  dayLabel: string,
): Promise<{ fecha: string; volumenKg: number; durationSec: number | null } | null> {
  const { data, error } = await ctx.supabase
    .from("workout_sessions")
    .select("date, duration_sec, workout_sets (weight_kg, reps)")
    .eq("day_label", dayLabel)
    .order("date", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const row = data?.[0] as
    | { date: string; duration_sec: number | null; workout_sets: { weight_kg: number; reps: number }[] }
    | undefined;
  if (!row) return null;

  const volumenKg = (row.workout_sets ?? []).reduce(
    (a, s) => a + num(s.weight_kg) * num(s.reps),
    0,
  );
  return {
    fecha: String(row.date).slice(0, 10),
    volumenKg: round(volumenKg, 1),
    durationSec: row.duration_sec === null ? null : num(row.duration_sec),
  };
}

/** Ritmo medio de las últimas rutas, para situar el de hoy. */
async function readUsualPace(
  ctx: NoaToolContext,
): Promise<{ sesiones: number; ritmoMedioMinKm: string | null; kmMedios: number } | null> {
  const { data, error } = await ctx.supabase
    .from("cardio_sessions")
    .select("distance_km, duration_sec")
    .order("date", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter((r) => num(r.distance_km) > 0);
  if (rows.length === 0) return null;
  const km = rows.reduce((a, r) => a + num(r.distance_km), 0);
  const sec = rows.reduce((a, r) => a + num(r.duration_sec), 0);
  return {
    sesiones: rows.length,
    ritmoMedioMinKm: paceLabel(km, sec),
    kmMedios: round(km / rows.length, 2),
  };
}

async function readBodyweight(ctx: NoaToolContext): Promise<number> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("bodyweight_kg")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const w = num(data?.bodyweight_kg);
  return w > 0 ? w : 75;
}

/* ————————————————————— contexto precargado ————————————————————— */

/**
 * Snapshot mínimo para el system prompt: que NOA sepa que hay algo en marcha
 * antes de llamar a nada. El detalle vive en las tools, no aquí.
 */
async function contextProvider(ctx: NoaToolContext) {
  const w = ctx.live?.workout;
  const c = ctx.live?.cardio;
  return {
    enCurso: {
      entreno: w
        ? {
            dia: w.dayLabel,
            minutos: Math.round(w.elapsedSec / 60),
            seriesHechas: w.exercises.reduce(
              (a, e) => a + e.sets.filter((s) => s.done).length,
              0,
            ),
          }
        : null,
      cardio: c
        ? {
            km: round(c.distanceKm, 2),
            minutos: Math.round(c.durationSec / 60),
            enPausa: c.paused,
          }
        : null,
    },
  };
}

export const liveModule: ToolModule = {
  id: "live",
  tools: [getActiveWorkout, getActiveCardio],
  // Sin palabras clave a propósito: este módulo NO se elige por lo que el
  // usuario escribe, sino por lo que está haciendo. Lo activa el engine cuando
  // el móvil manda una sesión en curso, y así "¿cómo voy?" funciona igual
  // escrito de mil maneras distintas.
  intentKeywords: [],
  contextProvider,
};

/* ————————————————————— utilidades ————————————————————— */

/** Fórmula de Epley, la misma que usa `getExerciseProgress`. */
function est1RM(weightKg: number, reps: number): number {
  if (reps <= 1) return round(weightKg, 1);
  return round(weightKg * (1 + reps / 30), 1);
}

/** Mejor serie por 1RM estimado (no por peso: 8×80 vale más que 1×85). */
function bestSet(sets: SetRef[]): SetRef | null {
  let best: SetRef | null = null;
  for (const s of sets) {
    if (s.reps <= 0) continue;
    if (!best || est1RM(s.weightKg, s.reps) > est1RM(best.weightKg, best.reps)) best = s;
  }
  return best;
}

/** Series que le quedan por marcar en un ejercicio. */
function pendingSets(ex: NoaLiveExercise): number {
  const marcadas = ex.sets.filter((s) => s.done).length;
  return Math.max(0, Math.max(ex.plannedSets, ex.sets.length) - marcadas);
}

/** Hoy contra la última vez, ya resuelto en kg y en 1RM estimado. */
function compare(
  hoy: SetRef | null,
  ultima: PrevExercise["ultimaVez"] | null,
): { pesoKg: number; est1RM: number } | null {
  if (!hoy || !ultima?.mejorSerie) return null;
  return {
    pesoKg: round(hoy.weightKg - ultima.mejorSerie.weightKg, 1),
    est1RM: round(est1RM(hoy.weightKg, hoy.reps) - (ultima.est1RM ?? 0), 1),
  };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
