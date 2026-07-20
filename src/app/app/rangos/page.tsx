import { redirect } from "next/navigation";

// Los rangos viven ahora dentro del perfil (pestana "Rangos"). Se mantiene la
// ruta como redirect para no romper enlaces/bookmarks antiguos.
export default function RangosPage() {
  redirect("/app/perfil?tab=rangos");
}
