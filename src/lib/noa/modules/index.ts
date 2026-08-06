import "server-only";
import type { ToolModule } from "@/lib/noa/types";
import { trainingModule } from "@/lib/noa/modules/training";
import { nutritionModule } from "@/lib/noa/modules/nutrition";

/**
 * Registro central de módulos. Añadir un módulo nuevo (cardio, heatmap…) es
 * importarlo y meterlo en esta lista: el núcleo de NOA no se toca.
 *
 * Pendientes de implementar (interfaz diseñada, backing por construir):
 *   cardio, statistics, profile, calendar, notifications, library, settings,
 *   y HEATMAP (módulo aún inexistente en Rogue).
 */
export const ALL_MODULES: ToolModule[] = [trainingModule, nutritionModule];
