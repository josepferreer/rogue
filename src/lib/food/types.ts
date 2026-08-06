import type { HealthScore } from "@/lib/food/health-score";
import type { ParsedIngredient } from "@/lib/food/ingredients";

/** Alimento normalizado a partir de Open Food Facts. Todos los valores
 *  nutricionales son POR 100 g/ml (la base que da OFF); las cantidades reales
 *  se calculan al añadir al diario segun los gramos consumidos.
 *
 *  Lo construye SIEMPRE el servidor (`/api/food/[barcode]`): el cliente no
 *  habla con OFF directamente, asi que aqui llega ya parseado. */
export type FoodProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** Texto de la racion tal cual lo da OFF, p.ej. "15 g". */
  servingSize: string | null;
  /** Racion en gramos (0 = OFF no la da o no esta en g/ml). */
  servingG: number;
  kcal100: number | null;
  protein100: number | null;
  fat100: number | null;
  carbs100: number | null;
  sugars100: number | null;
  fiber100: number | null;
  salt100: number | null;
  saturatedFat100: number | null;
  /** Nutri-Score a–e en minuscula, o null si el producto no lo tiene. */
  nutriscore: string | null;
  /** Color derivado del Nutri-Score (null si el producto no lo trae). */
  healthScore: HealthScore | null;
  /** Ingredientes declarados, con gramos estimados cuando OFF da el %. */
  ingredients: ParsedIngredient[];
  /** El producto parece un plato preparado (heuristica de `ingredients.ts`). */
  isReadyMeal: boolean;
};
