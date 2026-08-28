import "server-only";
import type { NoaToolContext, ToolDef, ToolModule } from "@/lib/noa/types";
import { filterExercises, getExercises } from "@/lib/exercises/repo";
import {
  DIFFICULTY_IDS,
  EQUIPMENT_IDS,
  MUSCLE_IDS,
  grupoFromDb,
  grupoToDb,
  validateCustomExercise,
} from "@/lib/exercises/custom";
import { EXERCISE_CATEGORIES, MUSCLE_LABELS } from "@/lib/exercises/types";
import type { EquipmentId, Exercise, MuscleId } from "@/lib/exercises/types";
import { WEEKDAY_LABELS } from "@/lib/workout/types";

/**
 * Módulo TRAINING — entrenamientos.
 *
 * Lectura:  getWorkoutHistory, getTrainingSummary, getRoutine, searchExercise,
 *           listExercisesByMuscle
 * Cliente:  startWorkout (abre el mini-player)
 * Escritura: saveRoutine (vía rpc `save_routine`, con confirmación)
 *
 * `save_routine` REEMPLAZA la rutina semanal entera de forma atómica, así que
 * `saveRoutine` recibe el estado completo de días. Para modificaciones
 * incrementales NOA debe llamar antes a `getRoutine` y reenviar los días que
 * quiera conservar; el Action Gate enseña el resultado antes de guardar.
 */

const getWorkoutHistory: ToolDef = {
  name: "getWorkoutHistory",
  description:
    "Devuelve las últimas sesiones de entrenamiento del usuario (fecha, día y duración). Úsala para preguntas sobre entrenos recientes o adherencia.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Cuántas sesiones devolver (por defecto 10, máx. 50).",
      },
    },
  },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const limit = clampInt(args.limit, 10, 1, 50);
    const { data, error } = await ctx.supabase
      .from("workout_sessions")
      .select("id, day_label, date, duration_sec")
      .order("date", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { sessions: data ?? [] };
  },
};

const getTrainingSummary: ToolDef = {
  name: "getTrainingSummary",
  description:
    "Resumen agregado de entrenamiento (volumen, frecuencia, etc.) calculado en Postgres. Úsala para progreso general, no para una sesión concreta.",
  parameters: { type: "object", properties: {} },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    const { data, error } = await ctx.supabase.rpc("workout_stats");
    if (error) throw new Error(error.message);
    return { summary: data };
  },
};

const getRoutine: ToolDef = {
  name: "getRoutine",
  description:
    "Devuelve la rutina semanal actual del usuario: sus días (con etiqueta, foco, días de la semana) y los ejercicios de cada uno. Llámala SIEMPRE antes de modificar la rutina, para no borrar días existentes.",
  parameters: { type: "object", properties: {} },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    const { data: routines, error: rErr } = await ctx.supabase
      .from("routines")
      .select("id, name")
      .order("created_at")
      .limit(1);
    if (rErr) throw new Error(rErr.message);
    const routine = routines?.[0];
    if (!routine) return { routine: null };

    const { data: days, error: dErr } = await ctx.supabase
      .from("routine_days")
      .select("id, label, focus, weekdays, position")
      .eq("routine_id", routine.id)
      .order("position");
    if (dErr) throw new Error(dErr.message);

    const dayIds = (days ?? []).map((d) => d.id as string);
    const { data: exs, error: eErr } = dayIds.length
      ? await ctx.supabase
          .from("routine_exercises")
          .select("routine_day_id, exercise_id, sets, reps, rest_sec, suggested_kg, position")
          .in("routine_day_id", dayIds)
          .order("position")
      : { data: [], error: null };
    if (eErr) throw new Error(eErr.message);

    const byDay = new Map<string, unknown[]>();
    for (const e of exs ?? []) {
      const list = byDay.get(e.routine_day_id as string) ?? [];
      list.push({
        exerciseId: e.exercise_id,
        sets: e.sets,
        reps: e.reps,
        restSec: e.rest_sec,
        suggestedKg: e.suggested_kg,
      });
      byDay.set(e.routine_day_id as string, list);
    }

    return {
      routine: {
        routineId: routine.id,
        name: routine.name,
        days: (days ?? []).map((d) => ({
          id: d.id,
          label: d.label,
          focus: d.focus,
          weekdays: d.weekdays,
          exercises: byDay.get(d.id as string) ?? [],
        })),
      },
    };
  },
};

const searchExercise: ToolDef = {
  name: "searchExercise",
  description:
    "Busca ejercicios en el catálogo por nombre y/o grupo muscular. Devuelve sus identificadores reales (id), necesarios para añadirlos a una rutina. Úsala para resolver nombres concretos antes de guardar. Para explorar todos los ejercicios disponibles de un músculo, usa listExercisesByMuscle.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texto a buscar en el nombre." },
      grupo: {
        type: "string",
        enum: [...EXERCISE_CATEGORIES],
        description: "Filtra por grupo muscular.",
      },
      limit: { type: "integer", description: "Máximo de resultados (def. 12)." },
    },
  },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const grupo =
      typeof args.grupo === "string" &&
      (EXERCISE_CATEGORIES as readonly string[]).includes(args.grupo)
        ? (args.grupo as (typeof EXERCISE_CATEGORIES)[number])
        : undefined;
    const query = typeof args.query === "string" ? args.query : undefined;
    const limit = clampInt(args.limit, 12, 1, 30);

    // El catalogo publico sale del dataset local; los personalizados solo estan
    // en Supabase. En servidor no hay store que los registre en la fachada, asi
    // que se consultan aqui: si no, NOA no encontraria un ejercicio que el
    // usuario acaba de crear y le propondria crearlo otra vez.
    const propios = await listCustomExercisesFor(ctx);
    const list = filterExercises(
      [...(await getExercises({})), ...propios],
      { query, grupo },
    );
    return {
      exercises: list.slice(0, limit).map((e) => ({
        id: e.id,
        nombre: e.nombre,
        grupo: e.grupo,
        equipo: e.equipo,
        dificultad: e.dificultad,
        mecanica: e.mecanica,
        esPersonalizado: e.esPersonalizado ?? false,
      })),
    };
  },
};

/** Ejercicios propios del usuario. La RLS ya filtra por owner. */
async function listCustomExercisesFor(ctx: NoaToolContext): Promise<Exercise[]> {
  const { data, error } = await ctx.supabase
    .from("exercises")
    .select(
      "id, nombre, grupo, equipo, dificultad, mecanica, musculos_primarios, musculos_secundarios, instrucciones, consejos",
    )
    .eq("owner_id", ctx.userId);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    grupo: grupoFromDb(r.grupo as string),
    equipo: r.equipo as Exercise["equipo"],
    dificultad: r.dificultad as Exercise["dificultad"],
    mecanica: r.mecanica as Exercise["mecanica"],
    musculosPrimarios: (r.musculos_primarios ?? []) as Exercise["musculosPrimarios"],
    musculosSecundarios: (r.musculos_secundarios ?? []) as Exercise["musculosSecundarios"],
    instrucciones: (r.instrucciones ?? []) as string[],
    consejos: (r.consejos ?? []) as string[],
    fuenteId: null,
    esPersonalizado: true,
  }));
}

const createCustomExercise: ToolDef = {
  name: "createCustomExercise",
  description:
    "Crea un ejercicio personalizado del usuario cuando NO existe en el catálogo. Úsala si searchExercise no encuentra nada parecido y el usuario quiere registrar ese movimiento, o si te pide crearlo directamente. Los músculos que indiques alimentan el mapa de calor y el cálculo de recuperación muscular del usuario: elígelos con criterio y no inventes si no estás seguro del ejercicio; en ese caso, pregunta antes. El usuario SIEMPRE confirma antes de que se cree.",
  parameters: {
    type: "object",
    properties: {
      nombre: { type: "string", description: "Nombre del ejercicio, en español." },
      grupo: {
        type: "string",
        enum: [...EXERCISE_CATEGORIES],
        description: "Categoría bajo la que aparecerá en la biblioteca.",
      },
      equipo: {
        type: "string",
        enum: [...EQUIPMENT_IDS],
        description: "Material necesario.",
      },
      dificultad: { type: "string", enum: [...DIFFICULTY_IDS] },
      mecanica: { type: "string", enum: ["compuesto", "aislamiento"] },
      musculosPrimarios: {
        type: "array",
        items: { type: "string", enum: [...MUSCLE_IDS] },
        description: "Músculos que más trabaja. Obligatorio, al menos uno.",
      },
      musculosSecundarios: {
        type: "array",
        items: { type: "string", enum: [...MUSCLE_IDS] },
        description: "Músculos que asisten al movimiento.",
      },
      instrucciones: {
        type: "array",
        items: { type: "string" },
        description: "Pasos de ejecución, uno por elemento.",
      },
      consejos: { type: "array", items: { type: "string" } },
    },
    required: ["nombre", "grupo", "equipo", "musculosPrimarios"],
  },
  module: "training",
  kind: "write",
  sensitivity: "confirm",
  refetch: "training",
  summarize(args) {
    const nombre = typeof args.nombre === "string" ? args.nombre : "ejercicio";
    const musculos = Array.isArray(args.musculosPrimarios)
      ? (args.musculosPrimarios as string[])
          .map((m) => MUSCLE_LABELS[m as MuscleId] ?? m)
          .join(", ")
      : "";
    return `Crear el ejercicio «${nombre}» (${args.grupo}, ${args.equipo}). Músculos principales: ${musculos}. Contará para tu mapa de calor.`;
  },
  async handler(args, ctx: NoaToolContext) {
    // Misma validacion que el formulario de la biblioteca: los ids de musculo
    // tienen que existir o el mapa de calor se llena de huecos silenciosos.
    const exercise = validateCustomExercise({
      nombre: String(args.nombre ?? ""),
      grupo: String(args.grupo ?? ""),
      equipo: String(args.equipo ?? ""),
      dificultad: args.dificultad ? String(args.dificultad) : undefined,
      mecanica: args.mecanica ? String(args.mecanica) : undefined,
      musculosPrimarios: (args.musculosPrimarios ?? []) as string[],
      musculosSecundarios: (args.musculosSecundarios ?? []) as string[],
      instrucciones: (args.instrucciones ?? []) as string[],
      consejos: (args.consejos ?? []) as string[],
    });

    const { error } = await ctx.supabase.from("exercises").insert({
      id: exercise.id,
      owner_id: ctx.userId,
      nombre: exercise.nombre,
      // FK a muscle_groups(id), que son minusculas.
      grupo: grupoToDb(exercise.grupo),
      equipo: exercise.equipo,
      dificultad: exercise.dificultad,
      mecanica: exercise.mecanica,
      musculos_primarios: exercise.musculosPrimarios,
      musculos_secundarios: exercise.musculosSecundarios,
      instrucciones: exercise.instrucciones,
      consejos: exercise.consejos,
      fuente_id: null,
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error(`Ya tienes un ejercicio llamado "${exercise.nombre}".`);
      }
      throw new Error(error.message);
    }
    return {
      created: true,
      id: exercise.id,
      nombre: exercise.nombre,
      grupo: exercise.grupo,
    };
  },
};

const getExerciseProgress: ToolDef = {
  name: "getExerciseProgress",
  description:
    "Muestra la evolución histórica de un ejercicio concreto: peso máximo, 1RM estimado (fórmula de Epley) y un desglose por sesión con la mejor serie de cada día. Úsala cuando el usuario pregunte por su progreso en un ejercicio, si se ha estancado, o cuánto lleva levantando. Necesitas el exerciseId (búscalo con searchExercise si no lo tienes).",
  parameters: {
    type: "object",
    properties: {
      exerciseId: {
        type: "string",
        description: "Id del ejercicio (ej. 'press-banca-con-barra').",
      },
      weeks: {
        type: "integer",
        description: "Cuántas semanas hacia atrás analizar (def. 12, máx. 52).",
      },
    },
    required: ["exerciseId"],
  },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const exerciseId = typeof args.exerciseId === "string" ? args.exerciseId.trim() : "";
    if (!exerciseId) throw new Error("exerciseId requerido.");
    const weeks = clampInt(args.weeks, 12, 1, 52);
    const since = new Date(ctx.now.getTime() - weeks * 7 * 86400_000).toISOString();

    // Busca todas las series de este ejercicio + la fecha de su sesión.
    const { data, error } = await ctx.supabase
      .from("workout_sets")
      .select("weight_kg, reps, session_id, workout_sessions!inner(date, day_label)")
      .eq("exercise_id", exerciseId)
      .gte("workout_sessions.date", since)
      .order("workout_sessions(date)", { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return {
        exerciseId,
        mensaje: "No hay series registradas para este ejercicio en el período seleccionado.",
        sesiones: [],
      };
    }

    // Agrupa por sesión y calcula la mejor serie (máx 1RM estimado) de cada día.
    const bySession = new Map<
      string,
      { date: string; dayLabel: string; sets: { weightKg: number; reps: number; est1RM: number }[] }
    >();

    for (const row of data) {
      const r = row as {
        weight_kg: number;
        reps: number;
        session_id: string;
        workout_sessions: { date: string; day_label: string } | { date: string; day_label: string }[];
      };
      const sess = Array.isArray(r.workout_sessions) ? r.workout_sessions[0] : r.workout_sessions;
      const dateStr = String(sess?.date ?? "").slice(0, 10);
      const label = String(sess?.day_label ?? "");
      const weightKg = Number(r.weight_kg) || 0;
      const reps = Number(r.reps) || 0;
      // Fórmula de Epley: 1RM ≈ peso × (1 + reps/30)
      const est1RM = reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;

      const existing = bySession.get(r.session_id) ?? { date: dateStr, dayLabel: label, sets: [] };
      existing.sets.push({ weightKg, reps, est1RM });
      bySession.set(r.session_id, existing);
    }

    const sesiones = [...bySession.values()].map((s) => {
      const bestSet = s.sets.reduce((best, cur) => (cur.est1RM > best.est1RM ? cur : best));
      return {
        fecha: s.date,
        dayLabel: s.dayLabel,
        series: s.sets.length,
        mejorSerie: { weightKg: bestSet.weightKg, reps: bestSet.reps },
        est1RM: bestSet.est1RM,
      };
    });

    const maxWeight = Math.max(...sesiones.map((s) => s.mejorSerie.weightKg));
    const max1RM = Math.max(...sesiones.map((s) => s.est1RM));

    // Detecta estancamiento: si las últimas 3 sesiones tienen el mismo peso máximo.
    const ultimas3 = sesiones.slice(-3);
    const estancado =
      ultimas3.length >= 3 &&
      ultimas3.every((s) => s.mejorSerie.weightKg === ultimas3[0].mejorSerie.weightKg);

    return {
      exerciseId,
      semanas: weeks,
      totalSesiones: sesiones.length,
      pesoMaximo: maxWeight,
      est1RMMax: max1RM,
      estancado,
      sesiones,
    };
  },
};

const listExercisesByMuscle: ToolDef = {
  name: "listExercisesByMuscle",
  description:
    "Devuelve el catálogo COMPLETO de ejercicios de uno o varios grupos musculares, ordenados por relevancia (compuestos primero, luego aislamientos). Úsala SIEMPRE antes de crear o modificar una rutina desde cero, para saber qué ejercicios hay disponibles en el catálogo real y elegir los mejores en vez de inventar nombres. Por ejemplo, si el usuario pide 'una rutina de pecho y tríceps', llama a esta tool con grupos=['Pecho','Triceps'] para ver todas las opciones y escoger.",
  parameters: {
    type: "object",
    properties: {
      grupos: {
        type: "array",
        items: {
          type: "string",
          enum: [...EXERCISE_CATEGORIES],
        },
        description:
          "Lista de grupos musculares a consultar (ej. ['Pecho', 'Triceps']). Siempre en castellano con mayúscula inicial.",
      },
      equipo: {
        type: "string",
        description:
          "Filtra por equipamiento (ej. 'barra', 'mancuernas', 'polea', 'maquina', 'peso-corporal'). Omite si no hay restricción.",
      },
    },
    required: ["grupos"],
  },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(args) {
    const gruposRaw = Array.isArray(args.grupos) ? args.grupos : [];
    const grupos = gruposRaw.filter(
      (g): g is (typeof EXERCISE_CATEGORIES)[number] =>
        typeof g === "string" &&
        (EXERCISE_CATEGORIES as readonly string[]).includes(g),
    );

    if (grupos.length === 0) {
      return { exercises: [], error: "Ningún grupo muscular válido especificado." };
    }

    const equipoArg = typeof args.equipo === "string" ? args.equipo : undefined;
    const equipo = equipoArg as EquipmentId | undefined;

    // Fetch each group in parallel
    const results = await Promise.all(
      grupos.map((grupo) =>
        getExercises({ grupo, ...(equipo ? { equipo } : {}) }),
      ),
    );

    // Merge and deduplicate by id, compuestos primero
    const seen = new Set<string>();
    const merged: {
      id: string;
      nombre: string;
      grupo: string;
      equipo: string;
      mecanica: string;
      dificultad: string;
      musculosPrimarios: string[];
    }[] = [];

    for (const list of results) {
      const sorted = [...list].sort((a, b) => {
        if (a.mecanica === b.mecanica) return 0;
        return a.mecanica === "compuesto" ? -1 : 1;
      });
      for (const e of sorted) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        merged.push({
          id: e.id,
          nombre: e.nombre,
          grupo: e.grupo,
          equipo: e.equipo,
          mecanica: e.mecanica,
          dificultad: e.dificultad,
          musculosPrimarios: e.musculosPrimarios,
        });
      }
    }

    return { total: merged.length, exercises: merged };
  },
};

const startWorkout: ToolDef = {
  name: "startWorkout",
  description:
    "Inicia una sesión de entrenamiento en la app (abre el mini-player). Opcionalmente para un día de rutina concreto.",
  parameters: {
    type: "object",
    properties: {
      routineDayId: {
        type: "string",
        description: "Id del día de rutina a iniciar; omítelo para entreno libre.",
      },
    },
  },
  module: "training",
  kind: "client-action",
  sensitivity: "confirm",
  toAction(args) {
    return {
      type: "startWorkout",
      routineDayId:
        typeof args.routineDayId === "string" ? args.routineDayId : undefined,
    };
  },
};

const finishWorkout: ToolDef = {
  name: "finishWorkout",
  description:
    "Termina la sesión de entrenamiento que está en curso en el mini-player y la guarda en el historial, con las series que el usuario ya haya marcado como hechas. Úsala cuando el usuario diga que ha acabado el entreno que tenía abierto. Si no hay ninguna sesión en curso, o no hay series marcadas, avisa de ello y no guarda nada: en ese caso usa logWorkout.",
  parameters: { type: "object", properties: {} },
  module: "training",
  kind: "client-action",
  sensitivity: "confirm",
  summarize() {
    return "Terminar el entreno en curso y guardarlo en tu historial.";
  },
  toAction() {
    return { type: "finishWorkout" };
  },
};

const logWorkout: ToolDef = {
  name: "logWorkout",
  description:
    "Registra en el historial un entreno YA realizado, sin necesidad de haberlo iniciado en la app. Úsala cuando el usuario diga que ha entrenado y quiera apuntarlo. Para ejercicios con pesos distintos por serie (ej. '12 con 59 kg, 10 con 66 kg, 10 con 66 kg'), usa setDetails con una entrada por serie. Para series uniformes, usa sets+reps+weightKg. Consulta antes getRoutine o searchExercise para obtener los exerciseId correctos.",
  parameters: {
    type: "object",
    properties: {
      dayLabel: {
        type: "string",
        description:
          "Nombre del entreno tal como aparecerá en el historial, p. ej. 'Pecho y tríceps' o 'Día A'.",
      },
      exercises: {
        type: "array",
        description: "Ejercicios realizados, con sus series.",
        items: {
          type: "object",
          properties: {
            exerciseId: { type: "string", description: "Id del ejercicio." },
            sets: {
              type: "number",
              description: "Número de series iguales (usa esto si todas las series tienen el mismo peso y reps).",
            },
            reps: { type: "number", description: "Repeticiones por serie (cuando todas son iguales)." },
            weightKg: {
              type: "number",
              description: "Peso en kilos por serie (cuando todas son iguales). 0 si es peso corporal.",
            },
            setDetails: {
              type: "array",
              description:
                "Usa esto en vez de sets/reps/weightKg cuando cada serie tiene peso o reps distintos. Una entrada por serie.",
              items: {
                type: "object",
                properties: {
                  reps: { type: "number", description: "Repeticiones de esta serie." },
                  weightKg: { type: "number", description: "Peso en kg de esta serie. 0 si es peso corporal." },
                },
                required: ["reps", "weightKg"],
              },
            },
          },
          required: ["exerciseId"],
        },
      },
      durationSec: {
        type: "number",
        description: "Duración del entreno en segundos, si el usuario la indica.",
      },
      date: {
        type: "string",
        description:
          "Cuándo se hizo, en formato YYYY-MM-DD. Úsalo cuando el usuario hable de un día que no es hoy ('ayer', 'el lunes', 'anteayer'). Si no lo dice, omítelo y se guardará con la fecha de hoy.",
      },
    },
    required: ["dayLabel", "exercises"],
  },
  module: "training",
  kind: "client-action",
  sensitivity: "confirm",
  summarize(args) {
    const raw = Array.isArray(args.exercises) ? args.exercises : [];
    const lineas = raw.map((e) => {
      const ex = e as Record<string, unknown>;
      const nombre = String(ex.exerciseId ?? "?").replace(/-/g, " ");
      // Si hay setDetails, mostramos el detalle de cada serie.
      if (Array.isArray(ex.setDetails) && ex.setDetails.length > 0) {
        const detalle = (ex.setDetails as { reps: number; weightKg: number }[])
          .map((s, i) => `  Serie ${i + 1}: ${s.reps} reps × ${s.weightKg} kg`)
          .join("\n");
        return `• ${nombre}:\n${detalle}`;
      }
      const kg = Number(ex.weightKg) || 0;
      return `• ${nombre}: ${ex.sets}×${ex.reps}${kg > 0 ? ` con ${kg} kg` : ""}`;
    });
    const titulo = String(args.dayLabel ?? "Entreno");
    return `Guardar «${titulo}» en tu historial:\n${lineas.join("\n")}`;
  },
  toAction(args) {
    const raw = Array.isArray(args.exercises) ? args.exercises : [];
    const exercises = raw
      .map((e) => {
        const ex = e as Record<string, unknown>;
        const exerciseId = String(ex.exerciseId ?? "");
        if (!exerciseId) return null;
        // Formato detallado: una entrada por serie con pesos distintos.
        if (Array.isArray(ex.setDetails) && ex.setDetails.length > 0) {
          return {
            exerciseId,
            setDetails: (ex.setDetails as Record<string, unknown>[]).map((s) => ({
              reps: clampInt(s.reps, 1, 1, 500),
              weightKg: Math.max(0, Number(s.weightKg) || 0),
            })),
          };
        }
        // Formato simple: N series iguales.
        return {
          exerciseId,
          sets: clampInt(ex.sets, 1, 1, 50),
          reps: clampInt(ex.reps, 1, 1, 500),
          weightKg: Math.max(0, Number(ex.weightKg) || 0),
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const durationSec =
      args.durationSec === undefined
        ? undefined
        : clampInt(args.durationSec, 0, 0, 86400);

    // Solo se pasa si tiene la forma esperada: una fecha a medias es peor que
    // ninguna, porque el entreno acabaria en un dia al azar del historial.
    const bruta = typeof args.date === "string" ? args.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(bruta) ? bruta : undefined;

    return {
      type: "logWorkout",
      dayLabel: String(args.dayLabel ?? "Entreno"),
      exercises,
      durationSec,
      ...(date ? { date } : {}),
    };
  },
};

const deleteWorkoutSession: ToolDef = {
  name: "deleteWorkoutSession",
  description:
    "Borra un entreno del historial (y todas sus series). Úsala solo si el usuario lo pide explícitamente (p.ej. 'borra el entreno de ayer' o 'ese entreno estaba mal, elimínalo'). Llama antes a getWorkoutHistory para obtener el id correcto de la sesión que quiere eliminar.",
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Id de la sesión a eliminar (obtenido de getWorkoutHistory).",
      },
      dayLabel: {
        type: "string",
        description: "Nombre del entreno, solo para mostrar en la confirmación.",
      },
    },
    required: ["sessionId"],
  },
  module: "training",
  kind: "write",
  sensitivity: "confirm",
  refetch: "training",
  summarize(args) {
    const label = typeof args.dayLabel === "string" && args.dayLabel ? args.dayLabel : "este entreno";
    return `Eliminar «${label}» de tu historial (se borrarán todas sus series).`;
  },
  async handler(args, ctx: NoaToolContext) {
    const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
    if (!sessionId) throw new Error("sessionId requerido.");
    const { error } = await ctx.supabase
      .from("workout_sessions")
      .delete()
      .eq("id", sessionId);
    if (error) throw new Error(error.message);
    return { deleted: true, sessionId };
  },
};

/** Forma de un día tal como lo espera `save_routine` (y esta tool). */
interface RoutineDayInput {
  id?: string;
  label: string;
  focus?: string;
  weekdays: number[];
  exercises: {
    exerciseId: string;
    sets?: number;
    reps?: number;
    restSec?: number;
    suggestedKg?: number;
  }[];
}

const saveRoutine: ToolDef = {
  name: "saveRoutine",
  description:
    "Guarda la rutina semanal COMPLETA (la reemplaza entera). Cada día lleva label, focus, weekdays (0=domingo … 6=sábado) y exercises con exerciseId (de searchExercise o listExercisesByMuscle). IMPORTANTE: llama SIEMPRE a listExercisesByMuscle antes de crear una rutina desde cero, para elegir ejercicios reales del catálogo. Para modificar sin perder días, llama antes a getRoutine e incluye TODOS los días que quieras conservar.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre de la rutina (opcional)." },
      days: {
        type: "array",
        description: "Días de la semana con sus ejercicios.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Nombre del día (p.ej. «Empuje»)." },
            focus: { type: "string", description: "Foco (p.ej. «Pecho y tríceps»)." },
            weekdays: {
              type: "array",
              items: { type: "integer" },
              description: "Días de la semana (0=domingo … 6=sábado).",
            },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  exerciseId: { type: "string" },
                  sets: { type: "integer" },
                  reps: { type: "integer" },
                  restSec: { type: "integer" },
                  suggestedKg: { type: "number" },
                },
                required: ["exerciseId"],
              },
            },
          },
          required: ["label", "weekdays", "exercises"],
        },
      },
    },
    required: ["days"],
  },
  module: "training",
  kind: "write",
  sensitivity: "confirm",
  refetch: "training",
  summarize(args) {
    const days = Array.isArray(args.days) ? (args.days as RoutineDayInput[]) : [];
    const lines = days.map((d) => {
      const wd = (d.weekdays ?? []).map((n) => WEEKDAY_LABELS[n] ?? "?").join("");
      const n = d.exercises?.length ?? 0;
      return `• ${wd || "sin día"} · ${d.label} (${n} ej.)`;
    });
    return `Guardar tu rutina con ${days.length} día(s):\n${lines.join("\n")}`;
  },
  async handler(args, ctx: NoaToolContext) {
    if (!Array.isArray(args.days)) throw new Error("Faltan los días de la rutina.");
    const name = typeof args.name === "string" ? args.name : null;
    const { data, error } = await ctx.supabase.rpc("save_routine", {
      p_routine_id: null,
      p_name: name,
      p_days: args.days,
    });
    if (error) throw new Error(error.message);
    return { saved: true, result: data };
  },
};

/** Snapshot compacto para el Context Builder cuando el turno es de training. */
async function contextProvider(ctx: NoaToolContext) {
  const { data } = await ctx.supabase
    .from("workout_sessions")
    .select("day_label, date")
    .order("date", { ascending: false })
    .limit(1);
  return { training: { ultimaSesion: data?.[0] ?? null } };
}

export const trainingModule: ToolModule = {
  id: "training",
  tools: [
    getWorkoutHistory,
    getTrainingSummary,
    getRoutine,
    searchExercise,
    getExerciseProgress,
    listExercisesByMuscle,
    startWorkout,
    finishWorkout,
    logWorkout,
    deleteWorkoutSession,
    saveRoutine,
    createCustomExercise,
  ],
  intentKeywords: [
    "entreno",
    "entrenar",
    "entrenamiento",
    "rutina",
    "ejercicio",
    "serie",
    "series",
    "repeticion",
    "pecho",
    "espalda",
    "pierna",
    "biceps",
    "triceps",
    "hombro",
    "gym",
    // Nombres de ejercicios y jerga de gimnasio: son la señal MÁS fiable de que
    // se habla de entrenamiento, y antes no casaban ninguna keyword. Una frase
    // como "hoy he hecho banca 4x8" se quedaba sin módulo y acababa en el router,
    // que a veces elegía mal (llegó a mandarla a cardio).
    "banca",
    "press",
    "sentadilla",
    "dominada",
    "remo",
    "curl",
    "peso muerto",
    "jalon",
    "jalón",
    "fondos",
    "zancada",
    "femoral",
    "gemelo",
    "abdominal",
    "mancuerna",
    "barra",
    "repes",
    "rm",
    "levant",
    "musculo",
    "músculo",
    "fuerza",
    "volumen",
    "hipertrofia",
  ],
  contextProvider,
};

/** Entero acotado con valor por defecto, para args que vienen de Gemini. */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
