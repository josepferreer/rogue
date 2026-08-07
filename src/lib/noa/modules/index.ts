import "server-only";
import type { ToolModule } from "@/lib/noa/types";
import { trainingModule } from "@/lib/noa/modules/training";
import { nutritionModule } from "@/lib/noa/modules/nutrition";
import { cardioModule } from "@/lib/noa/modules/cardio";
import { profileModule } from "@/lib/noa/modules/profile";
import { calendarModule } from "@/lib/noa/modules/calendar";
import { notificationsModule } from "@/lib/noa/modules/notifications";

/**
 * Registro central de módulos. Añadir uno nuevo es importarlo y meterlo en esta
 * lista: el núcleo de NOA no se toca.
 *
 * Sin módulo propio a propósito:
 *   - `settings`    → sus ajustes son los de `profile.updatePreferences`; un
 *                     módulo aparte solo duplicaría las mismas dos tools.
 *   - `library`     → `training.searchExercise` ya resuelve el catálogo.
 *   - `statistics`  → cada dominio ya expone su resumen agregado
 *                     (`getTrainingSummary`, `getCardioSummary`,
 *                     `getNutritionDay`); un módulo transversal sería una capa
 *                     que solo reenvía.
 *   - `heatmap`     → la funcionalidad no existe todavía en Rogue.
 */
export const ALL_MODULES: ToolModule[] = [
  trainingModule,
  nutritionModule,
  cardioModule,
  profileModule,
  calendarModule,
  notificationsModule,
];
