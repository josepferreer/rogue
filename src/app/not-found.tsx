import Link from "next/link";
import { Compass } from "lucide-react";

/** 404 dentro del diseno de la app: antes salia el de Next por defecto, en
 *  blanco y sin forma de volver. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Compass className="size-6" />
      </span>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Aquí no hay nada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La página que buscas no existe o ha cambiado de sitio.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
