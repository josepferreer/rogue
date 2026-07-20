import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rogue - Entrena con rango",
    short_name: "Rogue",
    description:
      "Planifica tus entrenamientos, explora la biblioteca de ejercicios y sube de rango musculo a musculo.",
    id: "/app",
    // La PWA instalada abre directa en la app; la landing publica vive en "/"
    // y solo se ve desde el navegador. scope se queda en "/" para que /login
    // (parte del flujo de sesion) siga dentro del ambito de la PWA.
    start_url: "/app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#f6f6f8",
    theme_color: "#f6f6f8",
    lang: "es",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
