import { redirect } from "next/navigation";

// La biblioteca de ejercicios vive ahora dentro del hub de Entreno (pestana
// "Ejercicios"). Se mantiene la ruta como redirect para no romper enlaces
// antiguos. Las fichas de detalle siguen en /biblioteca/[id].
export default function BibliotecaPage() {
  redirect("/app/rutinas?tab=ejercicios");
}
