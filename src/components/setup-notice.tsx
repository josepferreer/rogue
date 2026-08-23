import { KeyRound } from "lucide-react";

/**
 * Pantalla informativa que sustituye a la app cuando faltan las variables de
 * entorno de Supabase (p.ej. al clonar el repo sin `.env.local`). Server
 * component: no necesita cliente ni estado.
 */
export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-[440px]">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <KeyRound className="size-6" />
        </span>

        <h1 className="mt-5 text-lg font-semibold tracking-tight">
          Falta configurar el entorno
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La app necesita las claves de Supabase para arrancar. Crea un archivo{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            .env.local
          </code>{" "}
          en la raiz del proyecto con estas variables:
        </p>

        <ul className="mt-4 space-y-2">
          {missing.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <code className="font-mono text-xs">{key}</code>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-xs uppercase text-muted-foreground">
                falta
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Encontraras la URL y la clave publicable en el panel de Supabase, en{" "}
          <span className="font-medium text-foreground">
            Project Settings &rarr; API
          </span>
          . Para el login por nombre de usuario tambien hara falta{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            SUPABASE_SECRET_KEY
          </code>{" "}
          (opcional). Reinicia el servidor de desarrollo tras crear el archivo.
        </p>
      </div>
    </div>
  );
}
