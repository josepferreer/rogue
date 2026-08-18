import { NextResponse } from "next/server";

/**
 * Qué versión está desplegada ahora mismo.
 *
 * Existe por un problema muy concreto de la APK: el contenedor abre la URL una
 * vez y ese documento vive en el WebView durante DÍAS. Aunque despliegues, nadie
 * vuelve a pedir el HTML, así que nadie descubre que hay bundles nuevos y el
 * móvil sigue ejecutando código viejo. Pasó de verdad: un fallo del GPS ya
 * corregido en `main` siguió dando la lata en el móvil horas después.
 *
 * El cliente compara esto con la versión que trae cargada y recarga si cambió
 * (ver `use-deploy-watch`). No cachear NUNCA: es justo lo que se pregunta para
 * saber si la caché está vieja.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * SHA del commit desplegado. MISMO origen que el bundle del cliente
 * (`NEXT_PUBLIC_BUILD_ID`, que next.config saca de `VERCEL_GIT_COMMIT_SHA`), para
 * que la comparación en `DeployWatch` sea de manzanas con manzanas. En local
 * queda "" → "dev".
 */
const VERSION = process.env.NEXT_PUBLIC_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev";

export async function GET() {
  return NextResponse.json(
    { version: VERSION },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
