import type { NextConfig } from "next";

// Host desde el que se sirven las imagenes de ejercicios. Por defecto el
// repositorio publico de free-exercise-db; si se define
// NEXT_PUBLIC_EXERCISE_IMG_BASE (ver scripts/mirror-exercise-images.mjs) se
// autoriza tambien ese origen, para poder servirlas desde un bucket propio sin
// depender de raw.githubusercontent.com, que no es un CDN.
function exerciseImagePattern() {
  const base = process.env.NEXT_PUBLIC_EXERCISE_IMG_BASE;
  if (!base) return null;
  try {
    const url = new URL(base);
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      pathname: `${url.pathname.replace(/\/$/, "")}/**`,
    };
  } catch {
    return null;
  }
}

const custom = exerciseImagePattern();

const nextConfig: NextConfig = {
  // Permite probar el dev server desde el movil por IP local (LAN).
  allowedDevOrigins: ["192.168.1.59", "192.168.88.128"],
  async headers() {
    return [
      {
        source: "/:path*.mjs",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ];
  },
  env: {
    // Identifica el build que ejecuta el usuario (ver lib/version.ts). En
    // Vercel viene del commit; en otro proveedor, define NEXT_PUBLIC_BUILD_ID.
    NEXT_PUBLIC_BUILD_ID:
      process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.1.0",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/yuhonas/free-exercise-db/**",
      },
      ...(custom ? [custom] : []),
    ],
  },
};

export default nextConfig;
