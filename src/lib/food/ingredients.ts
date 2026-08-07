// Extrae ingredientes y tamaño de racion de un producto de Open Food Facts, y
// detecta si es un "plato listo". De cada ingrediente se toma el nombre y, si
// OFF declara su porcentaje, se estiman los gramos dentro de una racion
// (grams = % * racion). Sin porcentaje, los gramos quedan en blanco.

type OffIngredientRaw = { text?: unknown; percent?: unknown };

type OffProduct = {
  ingredients?: unknown;
  ingredients_text_es?: unknown;
  ingredients_text?: unknown;
  categories_tags?: unknown;
  serving_size?: unknown;
};

// Categorias canonicas de OFF (tags `en:`) que identifican un plato preparado:
// lo que te comes tal cual, no un ingrediente que usas para cocinar.
//
// Se comparan EXACTAS a proposito. Antes esto era una regex por substring mas
// `nova === 4` o ">= 4 ingredientes", y eso marcaba como "plato listo" a
// cualquier ultraprocesado: la Nutella salia plato listo por tener 8
// ingredientes. La categoria es el unico dato de OFF que habla de esto.
const MEAL_TAGS = new Set([
  "en:meals",
  "en:prepared-salads",
  "en:pasta-salads",
  "en:pasta-dishes",
  "en:rice-dishes",
  "en:meals-with-fish",
  "en:salads-with-fish",
  "en:pizzas",
  "en:sandwiches",
  "en:sushi",
  "en:soups",
  "en:ready-made-meals",
  "en:lasagne",
  "en:paella",
  "en:risotto",
]);

// Materia prima que OFF etiqueta ADEMAS como "meals" (una bolsa de rucula sale
// con en:meals y en:prepared-salads). Si aparece alguna de estas, gana: es un
// alimento. Exactas tambien: "en:meats-and-their-products" no debe vetar una
// ensalada de pasta con jamon.
const RAW_TAGS = new Set([
  "en:vegetables",
  "en:leaf-vegetables",
  "en:fruits",
  "en:canned-fishes",
  "en:tunas",
  "en:cheeses",
  "en:yogurts",
  "en:spreads",
  "en:pastas",
]);

/** Ingrediente con nombre y, si OFF lo permite, gramos estimados en la racion. */
export type ParsedIngredient = { name: string; grams?: number };

export type OffIngredients = {
  ingredients: ParsedIngredient[];
  isReadyMeal: boolean;
  /** Tamaño de racion en g (0 si OFF no lo da o no esta en g/ml). */
  servingG: number;
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** "366 g", "30 g (3 uds)", "1,5 ml" -> gramos; 0 si no hay cantidad en g/ml. */
function parseServingG(s: unknown): number {
  if (typeof s !== "string") return 0;
  const m = s.match(/([\d]+(?:[.,][\d]+)?)\s*(g|gr|ml)\b/i);
  if (!m) return 0;
  const n = num(m[1]);
  return n && n > 0 ? Math.round(n) : 0;
}

function cleanName(raw: string): string {
  const name = raw
    .replace(/^[_\s]+|[_\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\d+([.,]\d+)?\s*%\s*/, "")
    .trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function parseOffIngredients(product: OffProduct | null | undefined): OffIngredients {
  if (!product) return { ingredients: [], isReadyMeal: false, servingG: 0 };

  const servingG = parseServingG(product.serving_size);

  // [nombre, porcentaje declarado|null]
  let entries: [string, number | null][] = [];

  if (Array.isArray(product.ingredients)) {
    entries = (product.ingredients as OffIngredientRaw[])
      .filter((i) => typeof i?.text === "string" && i.text)
      .map((i) => [i.text as string, num(i.percent)]);
  }

  // Fallback: texto plano (sin porcentajes). Corta por comas de nivel superior
  // respetando parentesis para no partir sub-ingredientes.
  if (entries.length === 0) {
    const txt =
      (typeof product.ingredients_text_es === "string" && product.ingredients_text_es) ||
      (typeof product.ingredients_text === "string" && product.ingredients_text) ||
      "";
    let depth = 0;
    let buf = "";
    for (const ch of txt) {
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        if (buf.trim()) entries.push([buf, null]);
        buf = "";
      } else buf += ch;
    }
    if (buf.trim()) entries.push([buf, null]);
  }

  // Limpieza + deduplicado + estimacion de gramos (% * racion) + topes.
  const seen = new Set<string>();
  const ingredients: ParsedIngredient[] = [];
  for (const [raw, percent] of entries) {
    const name = cleanName(raw);
    if (!name || name.length > 40) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const item: ParsedIngredient = { name };
    if (percent != null && percent > 0 && percent <= 100 && servingG > 0) {
      item.grams = Math.round((percent / 100) * servingG);
    }
    ingredients.push(item);
    if (ingredients.length >= 25) break;
  }

  const cats = Array.isArray(product.categories_tags)
    ? (product.categories_tags as unknown[]).filter((c): c is string => typeof c === "string")
    : [];

  const isReadyMeal =
    cats.some((c) => MEAL_TAGS.has(c)) && !cats.some((c) => RAW_TAGS.has(c));

  return { ingredients, isReadyMeal, servingG };
}
