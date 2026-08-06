import "server-only";
import type { NoaToolContext, ToolDef, ToolModule } from "@/lib/noa/types";
import { fetchOffProduct, searchOffProducts } from "@/lib/food/openfoodfacts";

/**
 * Módulo NUTRITION — diario de comidas, objetivos y despensa.
 *
 * Lectura:   getNutritionDay, getMealEntries, getNutritionGoals,
 *            searchPantry, searchFoodDatabase
 * Escritura: addMealEntries, clearMealEntries, setNutritionGoals,
 *            savePantryFood, savePantryDish   (todas con confirmación)
 *
 * REGLA DE ORO: **NOA no inventa macros para el diario.**
 *
 * `addMealEntries` no acepta calorías sueltas. Cada entrada referencia algo
 * real y es el servidor quien resuelve sus macros:
 *   - `pantryFoodId` / `pantryDishId` → de la despensa del usuario
 *   - `barcode`                       → de Open Food Facts
 * Si el usuario nombra algo que no está en su despensa, NOA debe llamar antes a
 * `searchFoodDatabase` y usar el `barcode` que le devuelva. Así una cifra del
 * diario siempre tiene procedencia; el modelo elige QUÉ registrar, nunca
 * CUÁNTAS calorías tiene.
 *
 * La excepción consciente es `savePantryFood`: ahí las macros SÍ vienen en los
 * argumentos, porque el caso de uso es que el usuario las dicte ("mi batido
 * son 120 kcal"). Por eso el resumen del Action Gate las enseña enteras: lo que
 * se guarda se ve antes de guardarse.
 *
 * Un plan semanal es simplemente `addMealEntries` con muchas entradas y
 * `eaten: false`: quedan como comidas planificadas, y el usuario las va
 * marcando en la app según se las come.
 */

const MEAL_TYPES = ["desayuno", "comida", "cena", "snack"] as const;
type MealType = (typeof MEAL_TYPES)[number];

/** Tope de entradas por llamada: un plan semanal completo cabe de sobra
 *  (7 días × 4 comidas = 28) y acota lo que puede escribir un solo turno. */
const MAX_ENTRIES = 60;

// —————————————————————————————————————————————————————————————
// Lectura
// —————————————————————————————————————————————————————————————

const getNutritionDay: ToolDef = {
  name: "getNutritionDay",
  description:
    "Resumen nutricional de un día: kcal y macros ya consumidas, lo que queda planificado sin marcar, y los objetivos. Úsala para «¿cómo voy hoy?» o «¿cuánto me queda?».",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Día en formato YYYY-MM-DD. Por defecto, hoy.",
      },
    },
  },
  module: "nutrition",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const date = asDate(args.date, ctx);
    const [entries, goals] = await Promise.all([
      readEntries(ctx, date, date),
      readGoals(ctx),
    ]);

    const eaten = sumMacros(entries.filter((e) => e.eaten));
    const planned = sumMacros(entries.filter((e) => !e.eaten));
    return {
      date,
      objetivos: goals,
      consumido: eaten,
      planificadoSinMarcar: planned,
      restante: {
        kcal: round(goals.kcal - eaten.kcal),
        protein: round(goals.protein - eaten.protein),
        fat: round(goals.fat - eaten.fat),
        carbs: round(goals.carbs - eaten.carbs),
      },
      comidas: MEAL_TYPES.map((t) => ({
        mealType: t,
        items: entries
          .filter((e) => e.mealType === t)
          .map((e) => ({ id: e.id, name: e.name, quantityG: e.quantityG, kcal: round(e.kcal), eaten: e.eaten })),
      })),
    };
  },
};

const getMealEntries: ToolDef = {
  name: "getMealEntries",
  description:
    "Entradas del diario de comidas entre dos fechas, con sus macros. Úsala para revisar la semana, comparar días o encontrar el id de una entrada.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Fecha inicial YYYY-MM-DD (incluida)." },
      to: { type: "string", description: "Fecha final YYYY-MM-DD (incluida). Por defecto, igual que `from`." },
    },
    required: ["from"],
  },
  module: "nutrition",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const from = asDate(args.from, ctx);
    const to = asDate(args.to, ctx, from);
    const entries = await readEntries(ctx, from, to);
    return {
      from,
      to,
      total: entries.length,
      entries: entries.map((e) => ({
        id: e.id,
        date: e.date,
        mealType: e.mealType,
        name: e.name,
        quantityG: e.quantityG,
        kcal: round(e.kcal),
        protein: round(e.protein),
        carbs: round(e.carbs),
        fat: round(e.fat),
        eaten: e.eaten,
      })),
    };
  },
};

const getNutritionGoals: ToolDef = {
  name: "getNutritionGoals",
  description:
    "Objetivos diarios de calorías y macros del usuario. Llámala antes de proponer cambios en los objetivos.",
  parameters: { type: "object", properties: {} },
  module: "nutrition",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    return { objetivos: await readGoals(ctx) };
  },
};

const searchPantry: ToolDef = {
  name: "searchPantry",
  description:
    "Busca en la despensa del usuario (sus alimentos y platos guardados) y devuelve sus identificadores y macros por 100 g. Úsala SIEMPRE antes de registrar comida: es la fuente preferida frente a la base de datos externa.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texto a buscar en el nombre. Omítelo para listar todo." },
      limit: { type: "integer", description: "Máximo de resultados por tipo (def. 15)." },
    },
  },
  module: "nutrition",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = clampInt(args.limit, 15, 1, 40);

    const foods = ctx.supabase
      .from("pantry_foods")
      .select("id, name, kcal, protein, carbs, fat, serving_g")
      .order("name")
      .limit(limit);
    const dishes = ctx.supabase
      .from("pantry_dishes")
      .select("id, name, kcal, protein, carbs, fat, foods, serving_g")
      .order("name")
      .limit(limit);

    const [f, d] = await Promise.all([
      query ? foods.ilike("name", `%${query}%`) : foods,
      query ? dishes.ilike("name", `%${query}%`) : dishes,
    ]);
    if (f.error) throw new Error(f.error.message);
    if (d.error) throw new Error(d.error.message);

    return {
      alimentos: (f.data ?? []).map((a) => ({
        pantryFoodId: a.id,
        name: a.name,
        por100g: { kcal: num(a.kcal), protein: num(a.protein), carbs: num(a.carbs), fat: num(a.fat) },
        racionG: num(a.serving_g) || null,
      })),
      platos: (d.data ?? []).map((p) => ({
        pantryDishId: p.id,
        name: p.name,
        // Un plato "listo" (sin ingredientes enlazados) lleva macros por 100 g;
        // uno manual las calcula de sus ingredientes al registrarlo.
        tipo: Array.isArray(p.foods) && p.foods.length > 0 ? "manual" : "listo",
        ingredientes: Array.isArray(p.foods) ? p.foods.length : 0,
      })),
    };
  },
};

const searchFoodDatabase: ToolDef = {
  name: "searchFoodDatabase",
  description:
    "Busca alimentos en la base de datos pública Open Food Facts y devuelve sus macros reales por 100 g junto a su código de barras (barcode). Úsala SOLO si el alimento no está en la despensa. NUNCA estimes tú las calorías de un alimento: búscalo aquí y usa el barcode que te devuelva.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Nombre del alimento (p.ej. «arroz basmati»)." },
      limit: { type: "integer", description: "Máximo de resultados (def. 6, máx. 10)." },
    },
    required: ["query"],
  },
  module: "nutrition",
  kind: "read",
  sensitivity: "safe",
  async handler(args) {
    const query = typeof args.query === "string" ? args.query : "";
    const limit = clampInt(args.limit, 6, 1, 10);
    const products = await searchOffProducts(query, limit);
    return {
      resultados: products.map((p) => ({
        barcode: p.barcode,
        name: p.name,
        brand: p.brand,
        por100g: {
          kcal: p.kcal100,
          protein: p.protein100,
          carbs: p.carbs100,
          fat: p.fat100,
        },
        racionG: p.servingG || null,
      })),
    };
  },
};

// —————————————————————————————————————————————————————————————
// Escritura
// —————————————————————————————————————————————————————————————

/** Una entrada tal como la propone el modelo. */
interface EntryInput {
  date?: string;
  mealType?: string;
  quantityG?: number;
  eaten?: boolean;
  pantryFoodId?: string;
  pantryDishId?: string;
  barcode?: string;
  /** Solo para la tarjeta de confirmación. NO se guarda. */
  label?: string;
}

const addMealEntries: ToolDef = {
  name: "addMealEntries",
  description:
    "Registra comidas en el diario. Sirve tanto para una comida suelta como para planificar días enteros (una llamada con muchas entradas). Cada entrada DEBE referenciar un pantryFoodId, un pantryDishId o un barcode: las macros las resuelve la app, no las pongas tú. Usa eaten=false para planificar (el usuario las marcará al comerlas) y eaten=true para algo ya comido.",
  parameters: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        description: "Entradas a registrar (máx. 60).",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Día YYYY-MM-DD." },
            mealType: {
              type: "string",
              enum: [...MEAL_TYPES],
              description: "Comida del día.",
            },
            quantityG: { type: "number", description: "Cantidad en gramos." },
            eaten: {
              type: "boolean",
              description: "true = ya comido; false = planificado (por defecto).",
            },
            pantryFoodId: { type: "string", description: "Id de un alimento de la despensa." },
            pantryDishId: { type: "string", description: "Id de un plato de la despensa." },
            barcode: { type: "string", description: "Código de barras de searchFoodDatabase." },
            label: {
              type: "string",
              description:
                "Nombre legible del alimento, SOLO para que el usuario vea qué confirma. No afecta a lo que se guarda: las macros salen siempre de la referencia.",
            },
          },
          required: ["date", "mealType", "quantityG", "label"],
        },
      },
    },
    required: ["entries"],
  },
  module: "nutrition",
  kind: "write",
  sensitivity: "confirm",
  summarize(args) {
    const entries = Array.isArray(args.entries) ? (args.entries as EntryInput[]) : [];

    // Pocas entradas: se enseña qué se registra, alimento por alimento. Nadie
    // debería confirmar "1 comida" sin saber cuál.
    const describe = (e: EntryInput) =>
      `${e.label ?? "alimento"} · ${Math.round(Number(e.quantityG) || 0)} g` +
      `${e.eaten === true ? "" : " (planificado)"}`;

    if (entries.length <= 6) {
      const lineas = entries.map((e) => `• ${e.date} ${e.mealType}: ${describe(e)}`);
      return `Registrar ${entries.length} comida(s):\n${lineas.join("\n")}`;
    }

    // Un plan semanal no cabe entero: se resume por día, con los alimentos.
    const byDate = new Map<string, EntryInput[]>();
    for (const e of entries) {
      const d = String(e.date ?? "?");
      byDate.set(d, [...(byDate.get(d) ?? []), e]);
    }
    const dias = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, items]) => {
        const nombres = items.map((i) => i.label ?? "?").join(", ");
        return `• ${d} — ${items.length} comida(s): ${truncate(nombres, 90)}`;
      });
    const planificadas = entries.filter((e) => e.eaten !== true).length;
    return `Registrar ${entries.length} comidas (${planificadas} como planificadas):\n${dias.join("\n")}`;
  },
  async handler(args, ctx: NoaToolContext) {
    const raw = Array.isArray(args.entries) ? (args.entries as EntryInput[]) : [];
    if (raw.length === 0) throw new Error("No hay entradas que registrar.");
    if (raw.length > MAX_ENTRIES) {
      throw new Error(`Demasiadas entradas de una vez (máx. ${MAX_ENTRIES}).`);
    }

    // Se resuelven todas las referencias ANTES de escribir nada: si una es
    // inválida, no se registra media comida.
    const rows: Record<string, unknown>[] = [];
    for (const e of raw) {
      const date = asDate(e.date, ctx);
      const mealType = asMealType(e.mealType);
      const quantityG = Number(e.quantityG);
      if (!Number.isFinite(quantityG) || quantityG <= 0) {
        throw new Error(`Cantidad inválida para el ${date} (${mealType}).`);
      }

      const food = await resolveFood(e, ctx);
      rows.push({
        user_id: ctx.userId,
        date,
        meal_type: mealType,
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        quantity_g: Math.round(quantityG),
        kcal_100: food.kcal100,
        protein_100: food.protein100,
        fat_100: food.fat100,
        carbs_100: food.carbs100,
        eaten: e.eaten === true,
      });
    }

    const { error } = await ctx.supabase.from("meal_entries").insert(rows);
    if (error) throw new Error(error.message);
    return { registradas: rows.length };
  },
};

const clearMealEntries: ToolDef = {
  name: "clearMealEntries",
  description:
    "Borra entradas del diario de un rango de fechas, opcionalmente solo de una comida concreta. Úsala antes de reescribir un plan para no duplicar comidas.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "Fecha inicial YYYY-MM-DD (incluida)." },
      to: { type: "string", description: "Fecha final YYYY-MM-DD (incluida). Por defecto, igual que `from`." },
      mealType: {
        type: "string",
        enum: [...MEAL_TYPES],
        description: "Limitar a una comida del día. Omítelo para borrar todas.",
      },
      onlyPlanned: {
        type: "boolean",
        description: "true = borrar solo lo planificado sin marcar, respetando lo ya comido. Recomendado (por defecto true).",
      },
    },
    required: ["from"],
  },
  module: "nutrition",
  kind: "write",
  sensitivity: "confirm",
  summarize(args) {
    const from = String(args.from ?? "?");
    const to = String(args.to ?? from);
    const meal = typeof args.mealType === "string" ? ` (${args.mealType})` : "";
    const alcance =
      args.onlyPlanned === false ? "TODAS las comidas" : "las comidas planificadas sin marcar";
    return `Borrar ${alcance}${meal} del ${from} al ${to}.`;
  },
  async handler(args, ctx: NoaToolContext) {
    const from = asDate(args.from, ctx);
    const to = asDate(args.to, ctx, from);
    let q = ctx.supabase
      .from("meal_entries")
      .delete()
      .gte("date", from)
      .lte("date", to);
    if (typeof args.mealType === "string") q = q.eq("meal_type", asMealType(args.mealType));
    // Por defecto NO se toca lo que el usuario ya marcó como comido: eso es
    // su historial real, no un plan que se pueda reescribir.
    if (args.onlyPlanned !== false) q = q.eq("eaten", false);

    const { error } = await q;
    if (error) throw new Error(error.message);
    return { borradas: true };
  },
};

const setNutritionGoals: ToolDef = {
  name: "setNutritionGoals",
  description:
    "Cambia los objetivos diarios de calorías y macros. Llama antes a getNutritionGoals y propón valores coherentes con el peso y el objetivo del usuario.",
  parameters: {
    type: "object",
    properties: {
      kcal: { type: "integer", description: "Objetivo de calorías." },
      protein: { type: "integer", description: "Proteína en gramos." },
      fat: { type: "integer", description: "Grasas en gramos." },
      carbs: { type: "integer", description: "Hidratos en gramos." },
    },
    required: ["kcal", "protein", "fat", "carbs"],
  },
  module: "nutrition",
  kind: "write",
  sensitivity: "confirm",
  summarize(args) {
    return `Cambiar tus objetivos diarios a ${args.kcal} kcal · P ${args.protein} g · G ${args.fat} g · H ${args.carbs} g.`;
  },
  async handler(args, ctx: NoaToolContext) {
    const goals = {
      kcal_target: positiveInt(args.kcal, "calorías"),
      protein_target: positiveInt(args.protein, "proteína"),
      fat_target: positiveInt(args.fat, "grasas"),
      carbs_target: positiveInt(args.carbs, "hidratos"),
    };
    const { error } = await ctx.supabase.from("nutrition_goals").upsert({
      user_id: ctx.userId,
      ...goals,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { objetivos: goals };
  },
};

const savePantryFood: ToolDef = {
  name: "savePantryFood",
  description:
    "Crea un alimento en la despensa del usuario con sus macros POR 100 G. Úsala solo cuando el usuario te dicte los valores o los hayas obtenido de searchFoodDatabase; nunca te los inventes.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre del alimento." },
      kcal: { type: "number", description: "Calorías por 100 g." },
      protein: { type: "number", description: "Proteína (g) por 100 g." },
      carbs: { type: "number", description: "Hidratos (g) por 100 g." },
      fat: { type: "number", description: "Grasas (g) por 100 g." },
      servingG: { type: "number", description: "Ración habitual en gramos (opcional)." },
    },
    required: ["name", "kcal", "protein", "carbs", "fat"],
  },
  module: "nutrition",
  kind: "write",
  sensitivity: "confirm",
  summarize(args) {
    return `Guardar «${args.name}» en tu despensa — por 100 g: ${args.kcal} kcal · P ${args.protein} g · H ${args.carbs} g · G ${args.fat} g.`;
  },
  async handler(args, ctx: NoaToolContext) {
    const name = asName(args.name);
    const { data, error } = await ctx.supabase
      .from("pantry_foods")
      .insert({
        user_id: ctx.userId,
        name,
        kcal: nonNegative(args.kcal),
        protein: nonNegative(args.protein),
        carbs: nonNegative(args.carbs),
        fat: nonNegative(args.fat),
        serving_g: nonNegative(args.servingG ?? 0),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { pantryFoodId: data?.id, name };
  },
};

const savePantryDish: ToolDef = {
  name: "savePantryDish",
  description:
    "Crea un plato en la despensa a partir de alimentos que YA existen en ella (usa searchPantry para obtener sus pantryFoodId). Las macros del plato las calcula la app desde sus ingredientes.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre del plato." },
      foods: {
        type: "array",
        description: "Ingredientes del plato.",
        items: {
          type: "object",
          properties: {
            pantryFoodId: { type: "string", description: "Id del alimento en la despensa." },
            quantityG: { type: "number", description: "Cantidad en gramos." },
          },
          required: ["pantryFoodId", "quantityG"],
        },
      },
    },
    required: ["name", "foods"],
  },
  module: "nutrition",
  kind: "write",
  sensitivity: "confirm",
  summarize(args) {
    const foods = Array.isArray(args.foods) ? args.foods : [];
    return `Guardar el plato «${args.name}» con ${foods.length} ingrediente(s) en tu despensa.`;
  },
  async handler(args, ctx: NoaToolContext) {
    const name = asName(args.name);
    const foods = Array.isArray(args.foods)
      ? (args.foods as { pantryFoodId?: string; quantityG?: number }[])
      : [];
    if (foods.length === 0) throw new Error("El plato necesita al menos un ingrediente.");

    const ids = foods.map((f) => String(f.pantryFoodId ?? ""));
    const { data, error } = await ctx.supabase
      .from("pantry_foods")
      .select("id, kcal")
      .in("id", ids);
    if (error) throw new Error(error.message);

    const kcalById = new Map((data ?? []).map((a) => [a.id as string, num(a.kcal)]));
    let kcal = 0;
    const items = foods.map((f) => {
      const id = String(f.pantryFoodId ?? "");
      if (!kcalById.has(id)) {
        throw new Error(`El alimento ${id} no está en la despensa.`);
      }
      const quantityG = Math.round(nonNegative(f.quantityG));
      kcal += (kcalById.get(id) ?? 0) * (quantityG / 100);
      return { alimentoId: id, quantityG };
    });

    const { data: dish, error: insertError } = await ctx.supabase
      .from("pantry_dishes")
      .insert({ user_id: ctx.userId, name, kcal: Math.round(kcal), foods: items })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    return { pantryDishId: dish?.id, name, kcalTotales: Math.round(kcal) };
  },
};

// —————————————————————————————————————————————————————————————
// Helpers
// —————————————————————————————————————————————————————————————

interface ResolvedFood {
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal100: number;
  protein100: number;
  fat100: number;
  carbs100: number;
}

/**
 * Traduce la referencia de una entrada a macros reales. Es el punto donde se
 * sostiene la regla: si no se puede resolver contra la despensa o contra Open
 * Food Facts, la entrada NO se registra.
 */
async function resolveFood(e: EntryInput, ctx: NoaToolContext): Promise<ResolvedFood> {
  if (e.pantryFoodId) {
    const { data, error } = await ctx.supabase
      .from("pantry_foods")
      .select("name, kcal, protein, carbs, fat")
      .eq("id", e.pantryFoodId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`No encuentro el alimento ${e.pantryFoodId} en tu despensa.`);
    return {
      name: data.name as string,
      brand: null,
      barcode: null,
      kcal100: num(data.kcal),
      protein100: num(data.protein),
      fat100: num(data.fat),
      carbs100: num(data.carbs),
    };
  }

  if (e.pantryDishId) {
    const { data, error } = await ctx.supabase
      .from("pantry_dishes")
      .select("name, kcal, protein, carbs, fat, foods")
      .eq("id", e.pantryDishId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`No encuentro el plato ${e.pantryDishId} en tu despensa.`);

    const foods = Array.isArray(data.foods)
      ? (data.foods as { alimentoId: string; quantityG: number }[])
      : [];
    // Plato "listo": ya guarda sus macros por 100 g.
    if (foods.length === 0) {
      return {
        name: data.name as string,
        brand: null,
        barcode: null,
        kcal100: num(data.kcal),
        protein100: num(data.protein),
        fat100: num(data.fat),
        carbs100: num(data.carbs),
      };
    }

    // Plato manual: se recalcula desde sus ingredientes y se normaliza a 100 g,
    // igual que hace la app al añadirlo desde la despensa.
    const ids = foods.map((f) => f.alimentoId);
    const { data: rows, error: fErr } = await ctx.supabase
      .from("pantry_foods")
      .select("id, kcal, protein, carbs, fat")
      .in("id", ids);
    if (fErr) throw new Error(fErr.message);
    const byId = new Map((rows ?? []).map((a) => [a.id as string, a]));

    let kcal = 0, protein = 0, carbs = 0, fat = 0, weight = 0;
    for (const f of foods) {
      const a = byId.get(f.alimentoId);
      if (!a) continue; // ingrediente borrado: no se cuenta (ni se inventa)
      const factor = f.quantityG / 100;
      kcal += num(a.kcal) * factor;
      protein += num(a.protein) * factor;
      carbs += num(a.carbs) * factor;
      fat += num(a.fat) * factor;
      weight += f.quantityG;
    }
    if (weight <= 0) throw new Error(`El plato «${data.name}» no tiene ingredientes válidos.`);
    const per100 = 100 / weight;
    return {
      name: data.name as string,
      brand: null,
      barcode: null,
      kcal100: kcal * per100,
      protein100: protein * per100,
      fat100: fat * per100,
      carbs100: carbs * per100,
    };
  }

  if (e.barcode) {
    const result = await fetchOffProduct(String(e.barcode));
    if (result.status !== "ok") {
      throw new Error(`No pude resolver el código de barras ${e.barcode}.`);
    }
    const p = result.product;
    if (p.kcal100 == null) {
      throw new Error(`«${p.name}» no tiene calorías declaradas: no puedo registrarlo.`);
    }
    return {
      name: p.name,
      brand: p.brand,
      barcode: p.barcode,
      kcal100: p.kcal100,
      protein100: p.protein100 ?? 0,
      fat100: p.fat100 ?? 0,
      carbs100: p.carbs100 ?? 0,
    };
  }

  throw new Error(
    "Cada comida debe referenciar un pantryFoodId, un pantryDishId o un barcode. Busca el alimento con searchPantry o searchFoodDatabase antes de registrarlo.",
  );
}

interface DiaryEntry {
  id: string;
  date: string;
  mealType: MealType;
  name: string;
  quantityG: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  eaten: boolean;
}

async function readEntries(
  ctx: NoaToolContext,
  from: string,
  to: string,
): Promise<DiaryEntry[]> {
  const { data, error } = await ctx.supabase
    .from("meal_entries")
    .select("id, date, meal_type, name, quantity_g, kcal_100, protein_100, carbs_100, fat_100, eaten")
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .limit(500);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const factor = num(r.quantity_g) / 100;
    return {
      id: r.id as string,
      date: r.date as string,
      mealType: r.meal_type as MealType,
      name: r.name as string,
      quantityG: num(r.quantity_g),
      kcal: num(r.kcal_100) * factor,
      protein: num(r.protein_100) * factor,
      carbs: num(r.carbs_100) * factor,
      fat: num(r.fat_100) * factor,
      eaten: r.eaten === true,
    };
  });
}

async function readGoals(ctx: NoaToolContext) {
  const { data, error } = await ctx.supabase
    .from("nutrition_goals")
    .select("kcal_target, protein_target, fat_target, carbs_target")
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Mismos valores por defecto que la app cuando el usuario no los ha tocado.
  return {
    kcal: num(data?.kcal_target) || 2000,
    protein: num(data?.protein_target) || 130,
    fat: num(data?.fat_target) || 65,
    carbs: num(data?.carbs_target) || 220,
  };
}

function sumMacros(entries: DiaryEntry[]) {
  return entries.reduce(
    (acc, e) => ({
      kcal: round(acc.kcal + e.kcal),
      protein: round(acc.protein + e.protein),
      carbs: round(acc.carbs + e.carbs),
      fat: round(acc.fat + e.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Fecha local YYYY-MM-DD, como la guarda la app (no UTC). */
function todayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function asDate(value: unknown, ctx: NoaToolContext, fallback?: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  return fallback ?? todayKey(ctx.now);
}

function asMealType(value: unknown): MealType {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if ((MEAL_TYPES as readonly string[]).includes(v)) return v as MealType;
  throw new Error(`Comida no válida: «${String(value)}». Usa desayuno, comida, cena o snack.`);
}

function asName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new Error("Falta el nombre.");
  return name.slice(0, 80);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function nonNegative(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function positiveInt(value: unknown, label: string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Valor inválido para ${label}.`);
  return n;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Snapshot compacto para el Context Builder cuando el turno es de nutrición. */
async function contextProvider(ctx: NoaToolContext) {
  const today = todayKey(ctx.now);
  const [entries, goals] = await Promise.all([readEntries(ctx, today, today), readGoals(ctx)]);
  const eaten = sumMacros(entries.filter((e) => e.eaten));
  return {
    nutrition: {
      hoy: today,
      consumidoHoy: eaten,
      objetivoKcal: goals.kcal,
      entradasHoy: entries.length,
    },
  };
}

export const nutritionModule: ToolModule = {
  id: "nutrition",
  tools: [
    getNutritionDay,
    getMealEntries,
    getNutritionGoals,
    searchPantry,
    searchFoodDatabase,
    addMealEntries,
    clearMealEntries,
    setNutritionGoals,
    savePantryFood,
    savePantryDish,
  ],
  intentKeywords: [
    "comida",
    "comer",
    "comido",
    "dieta",
    "nutricion",
    "alimento",
    "alimentacion",
    "caloria",
    "calorias",
    "kcal",
    "macro",
    "macros",
    "proteina",
    "proteinas",
    "hidrato",
    "hidratos",
    "carbohidrato",
    "grasa",
    "grasas",
    "desayuno",
    "almuerzo",
    "cena",
    "snack",
    "despensa",
    "plato",
    "receta",
    "menu",
    "plan",
    "objetivo",
    "deficit",
    "superavit",
  ],
  contextProvider,
};
