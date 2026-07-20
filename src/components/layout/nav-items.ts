import {
  CircleUserRound,
  Dumbbell,
  Home,
  Footprints,
  UtensilsCrossed,
} from "lucide-react";

/** Navegacion principal, compartida entre BottomNav (movil) y Sidebar (escritorio).
 *  Los rangos viven dentro de Perfil (pestana "Rangos") y la biblioteca de
 *  ejercicios dentro de Entreno (pestana "Ejercicios"). */
export const NAV_ITEMS = [
  { href: "/app", label: "Inicio", icon: Home },
  // "Entreno" agrupa rutina + biblioteca de ejercicios. matchPrefixes marca la
  // pestana como activa tambien en las fichas de ejercicio (/app/biblioteca/[id]).
  { href: "/app/rutinas", label: "Entreno", icon: Dumbbell, matchPrefixes: ["/app/biblioteca"] },
  { href: "/app/cardio", label: "Cardio", icon: Footprints },
  { href: "/app/comidas", label: "Comidas", icon: UtensilsCrossed },
  { href: "/app/perfil", label: "Perfil", icon: CircleUserRound },
] as const;

export function isNavItemActive(
  pathname: string,
  item: { href: string; matchPrefixes?: readonly string[] },
): boolean {
  if (item.href === "/app") return pathname === "/app";
  if (pathname.startsWith(item.href)) return true;
  return (item.matchPrefixes ?? []).some((p) => pathname.startsWith(p));
}
