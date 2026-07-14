import {
  CalendarDays,
  Dumbbell,
  Home,
  Shield,
  Footprints,
  UtensilsCrossed,
} from "lucide-react";

/** Navegacion principal, compartida entre BottomNav (movil) y Sidebar (escritorio). */
export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/rutinas", label: "Rutinas", icon: CalendarDays },
  { href: "/cardio", label: "Cardio", icon: Footprints },
  { href: "/comidas", label: "Comidas", icon: UtensilsCrossed },
  { href: "/biblioteca", label: "Ejercicios", icon: Dumbbell },
  { href: "/rangos", label: "Rangos", icon: Shield },
] as const;

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
