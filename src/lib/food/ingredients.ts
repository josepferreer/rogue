// Extrae la lista de ingredientes de un producto de Open Food Facts y detecta
// si es un "plato listo" (varios ingredientes / ultraprocesado) frente a una
// materia prima simple. Solo se usan los NOMBRES: OFF no da gramos ni macros
// por ingrediente de forma fiable, asi que las cantidades se dejan en blanco y
// las macros correctas son las del producto entero (por 100 g).

type OffProduct = {
  ingredients?: unknown;
  ingredients_text_es?: unknown;
  ingredients_text?: unknown;
  nova_group?: unknown;
  categories_tags?: unknown;
};

// Categorias de OFF que delatan un plato/producto preparado.
const MEAL_HINT =
  /meal|salad|prepared|sandwich|pizza|sushi|soup|dish|ready|plate|wrap|lasagn|paella|risotto|hummus|dip/i;

function cleanName(raw: string): string {
  const name = raw
    .replace(/^[_\s]+|[_\s]+$/g, "") // guiones bajos que OFF usa para alergenos
    .replace(/\s+/g, " ")
    .replace(/^\d+([.,]\d+)?\s*%\s*/, "") // porcentaje al inicio
    .trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export type OffIngredients = {
  /** Nombres de ingredientes, limpios y deduplicados (maximo 25). */
  ingredients: string[];
  /** true si parece un producto listo (varios ingredientes / ultraprocesado). */
  isReadyMeal: boolean;
};

export function parseOffIngredients(product: OffProduct | null | undefined): OffIngredients {
  if (!product) return { ingredients: [], isReadyMeal: false };

  let names: string[] = [];

  // Preferimos la estructura (solo nivel superior; ignoramos sub-ingredientes).
  if (Array.isArray(product.ingredients)) {
    names = (product.ingredients as { text?: unknown }[])
      .map((i) => (typeof i?.text === "string" ? i.text : ""))
      .filter(Boolean);
  }

  // Fallback: texto plano. Corta por comas de nivel superior (respeta parentesis
  // para no partir sub-ingredientes como "pasta (trigo, agua)").
  if (names.length === 0) {
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
        if (buf.trim()) names.push(buf);
        buf = "";
      } else buf += ch;
    }
    if (buf.trim()) names.push(buf);
  }

  // Limpieza + deduplicado (case-insensitive) + tope de longitud/cantidad.
  const seen = new Set<string>();
  const ingredients: string[] = [];
  for (const raw of names) {
    const name = cleanName(raw);
    if (!name || name.length > 40) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ingredients.push(name);
    if (ingredients.length >= 25) break;
  }

  const nova = Number(product.nova_group);
  const cats = Array.isArray(product.categories_tags)
    ? (product.categories_tags as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  const mealHint = cats.some((c) => MEAL_HINT.test(c));

  // Producto listo: varios ingredientes y ademas ultraprocesado o categoria de
  // plato preparado (o simplemente muchos ingredientes).
  const isReadyMeal =
    ingredients.length >= 2 && (nova === 4 || mealHint || ingredients.length >= 4);

  return { ingredients, isReadyMeal };
}
