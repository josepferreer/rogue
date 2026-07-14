import type { FoodProduct } from "@/lib/food/types";

const OFF_FIELDS = [
  "product_name",
  "product_name_es",
  "brands",
  "nutriments",
  "nutriscore_grade",
  "image_front_small_url",
  "serving_size",
].join(",");

// OFF pide un User-Agent descriptivo (nombre app + contacto) por cortesia.
const USER_AGENT = "Rogue/1.0 (workout PWA; contact orriols002@gmail.com)";

type OffNutriments = Record<string, number | string | undefined>;

function num(v: number | string | undefined): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function normalize(barcode: string, p: Record<string, unknown>): FoodProduct {
  const n = (p.nutriments ?? {}) as OffNutriments;
  const name =
    (p.product_name_es as string) ||
    (p.product_name as string) ||
    "Producto sin nombre";
  const brand = ((p.brands as string) || "").split(",")[0]?.trim() || null;
  return {
    barcode,
    name,
    brand,
    imageUrl: (p.image_front_small_url as string) || null,
    servingSize: (p.serving_size as string) || null,
    kcal100: num(n["energy-kcal_100g"]),
    protein100: num(n["proteins_100g"]),
    fat100: num(n["fat_100g"]),
    carbs100: num(n["carbohydrates_100g"]),
    sugars100: num(n["sugars_100g"]),
    fiber100: num(n["fiber_100g"]),
    salt100: num(n["salt_100g"]),
    saturatedFat100: num(n["saturated-fat_100g"]),
    nutriscore: (p.nutriscore_grade as string) || null,
  };
}

/** Consulta un producto por codigo de barras en Open Food Facts. Devuelve null
 *  si el codigo no es valido o el producto no existe en la base de datos. */
export async function fetchOffProduct(
  barcode: string,
): Promise<FoodProduct | null> {
  const clean = barcode.replace(/\D/g, "");
  if (clean.length < 6) return null;

  const url = `https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${OFF_FIELDS}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: number;
    product?: Record<string, unknown>;
  };
  if (data.status === 0 || !data.product) return null;
  return normalize(clean, data.product);
}
