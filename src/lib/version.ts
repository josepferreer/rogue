/**
 * Version del cliente que se esta ejecutando.
 *
 * Hace falta porque el APK es un WebView contra una URL remota: cada despliegue
 * cambia la app de todos los usuarios a la vez y, sin esto, cuando alguien
 * reporta un fallo no hay forma de saber que codigo tenia delante.
 *
 * `NEXT_PUBLIC_BUILD_ID` lo inyecta el proveedor de despliegue (en Vercel,
 * `VERCEL_GIT_COMMIT_SHA`); en local queda "dev".
 */
const RAW_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

/** Version legible: "0.1.0 (a1b2c3d)" o "0.1.0 (dev)". */
export const APP_VERSION = `${process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"} (${
  RAW_BUILD ? RAW_BUILD.slice(0, 7) : "dev"
})`;
