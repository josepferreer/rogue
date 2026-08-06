import "server-only";
import type { FoodProduct } from "@/lib/food/types";
import { nutriscoreToHealthScore } from "@/lib/food/health-score";
import { parseOffIngredients } from "@/lib/food/ingredients";

// Solo estos campos: la respuesta completa de un producto de OFF pasa de los
// 200 KB (traducciones, imagenes, historico de ediciones) y la paga el movil
// del usuario en cada escaneo.
const OFF_FIELDS = [
  "product_name",
  "product_name_es",
  "brands",
  "nutriments",
  "nutriscore_grade",
  "image_front_small_url",
  "serving_size",
  // Necesarios para parseOffIngredients (ingredientes + "plato listo").
  "ingredients",
  "ingredients_text",
  "ingredients_text_es",
  "categories_tags",
].join(",");

// OFF pide un User-Agent descriptivo (nombre app + contacto) por cortesia.
const USER_AGENT = "Rogue/1.0 (workout PWA; contact orriols002@gmail.com)";

// Si OFF tarda mas que esto, mejor "no encontrado" que dejar el escaner colgado.
const TIMEOUT_MS = 8000;

type OffNutriments = Record<string, number | string | undefined>;

function num(v: number | string | undefined): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Muchos productos europeos solo declaran kJ. Sin este fallback se guardaban
 *  como alimentos de 0 kcal y el usuario los daba por buenos. */
function kcalPer100(n: OffNutriments): number | null {
  const kcal = num(n["energy-kcal_100g"]);
  if (kcal != null) return kcal;
  const kj = num(n["energy-kj_100g"]);
  return kj != null ? Math.round((kj / 4.184) * 10) / 10 : null;
}

function normalize(barcode: string, p: Record<string, unknown>): FoodProduct {
  const n = (p.nutriments ?? {}) as OffNutriments;
  const name =
    (p.product_name_es as string) ||
    (p.product_name as string) ||
    "Producto sin nombre";
  const brand = ((p.brands as string) || "").split(",")[0]?.trim() || null;
  const nutriscore = (p.nutriscore_grade as string) || null;
  const parsed = parseOffIngredients(p);
  return {
    barcode,
    name,
    brand,
    imageUrl: (p.image_front_small_url as string) || null,
    servingSize: (p.serving_size as string) || null,
    servingG: parsed.servingG,
    kcal100: kcalPer100(n),
    protein100: num(n["proteins_100g"]),
    fat100: num(n["fat_100g"]),
    carbs100: num(n["carbohydrates_100g"]),
    sugars100: num(n["sugars_100g"]),
    fiber100: num(n["fiber_100g"]),
    salt100: num(n["salt_100g"]),
    saturatedFat100: num(n["saturated-fat_100g"]),
    nutriscore,
    healthScore: nutriscoreToHealthScore(nutriscore),
    ingredients: parsed.ingredients,
    isReadyMeal: parsed.isReadyMeal,
  };
}

/**
 * Resultado de consultar OFF. `not_found` y `unavailable` son cosas MUY
 * distintas para el usuario: antes todo fallo (timeout, 5xx, rate limit de
 * OFF) se convertia en null y la app decia "producto no encontrado", asi que
 * un hipo de OFF hacia creer que el producto no existe y mandaba a teclearlo
 * a mano.
 */
export type OffLookup =
  | { status: "ok"; product: FoodProduct }
  | { status: "not_found" }
  | { status: "unavailable" };

/** Consulta un producto por codigo de barras en Open Food Facts. */
export async function fetchOffProduct(barcode: string): Promise<OffLookup> {
  const clean = barcode.replace(/\D/g, "");
  if (clean.length < 6) return { status: "not_found" };

  const url = `https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${OFF_FIELDS}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Red caida o timeout.
    return { status: "unavailable" };
  }
  // OFF responde 404 solo si el codigo no esta; el resto (429, 5xx) es "ahora
  // no puedo", no "no existe".
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) return { status: "unavailable" };

  let data: { status?: number; product?: Record<string, unknown> };
  try {
    data = await res.json();
  } catch {
    return { status: "unavailable" };
  }
  if (data.status === 0 || !data.product) return { status: "not_found" };
  return { status: "ok", product: normalize(clean, data.product) };
}
