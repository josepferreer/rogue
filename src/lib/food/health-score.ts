/** Semaforo de "nivel de salud": SIEMPRE el Nutri-Score oficial que da Open
 *  Food Facts al escanear.
 *
 *  Habia ademas una estimacion propia por umbrales de macros (kcal > 350,
 *  grasa > 20...) que se pintaba con el mismo punto de color, asi que no habia
 *  forma de saber si el color venia de la EFSA o de una formula inventada. Se
 *  quito: en los alimentos creados a mano el color se elige a mano, o se deja
 *  en blanco. Mejor sin dato que con un dato que aparenta lo que no es. */

export type HealthScore = "green" | "yellow" | "orange" | "red";

/** Nutri-Score (a–e) -> color. null si el producto no lo trae o no es valido. */
export function nutriscoreToHealthScore(grade: string | null | undefined): HealthScore | null {
  switch (grade?.toLowerCase()) {
    case "a":
    case "b":
      return "green";
    case "c":
      return "yellow";
    case "d":
      return "orange";
    case "e":
      return "red";
    default:
      return null;
  }
}

/** Etiqueta legible del color, para tooltips y lectores de pantalla. */
export const HEALTH_LABEL: Record<HealthScore, string> = {
  green: "Nutri-Score A/B",
  yellow: "Nutri-Score C",
  orange: "Nutri-Score D",
  red: "Nutri-Score E",
};
