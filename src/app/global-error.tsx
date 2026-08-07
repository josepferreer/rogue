"use client";

import { useEffect } from "react";
import { APP_VERSION } from "@/lib/version";

/**
 * Ultimo cortafuegos: captura los errores del PROPIO layout raiz, que `error.tsx`
 * no puede coger (vive dentro de ese layout). Sin esto, un fallo en los
 * providers dejaba la pantalla en blanco sin nada que pulsar.
 *
 * Reemplaza el documento entero, asi que tiene que traer sus <html>/<body> y no
 * puede usar los estilos ni los componentes de la app: va todo en linea a
 * proposito, para que funcione aunque lo que haya reventado sea el tema o la
 * hoja de estilos.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error fatal:", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "22rem" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            La app no ha podido arrancar
          </h1>
          <p style={{ fontSize: "0.875rem", opacity: 0.7, marginTop: "0.5rem" }}>
            Ha ocurrido un error inesperado. Tus datos guardados no se han perdido.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "9999px",
              border: "none",
              background: "#fafafa",
              color: "#0a0a0a",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          {/* Version y digest: sin esto no hay forma de saber que ejecutaba el
              usuario cuando reporta un fallo. */}
          <p style={{ fontSize: "0.6875rem", opacity: 0.4, marginTop: "2rem" }}>
            Rogue {APP_VERSION}
            {error.digest ? ` · ${error.digest}` : ""}
          </p>
        </div>
      </body>
    </html>
  );
}
