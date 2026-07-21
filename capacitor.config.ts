import type { CapacitorConfig } from "@capacitor/cli";

// Configuracion de Capacitor. Como la app NO es estatica (Server Actions, rutas
// API, middleware/proxy), el contenedor nativo carga la app servida via
// server.url en vez de empaquetar assets estaticos.
//
// - En DESARROLLO: apunta al dev server por la IP de la red local (el movil debe
//   estar en la misma wifi). cleartext=true permite http.
// - En PRODUCCION: cambia server.url a tu dominio https y quita cleartext (o
//   elimina el bloque server para empaquetar un build real).
//
// server.url apunta a /app (no a la raiz): la landing publica vive en `/` y NO
// debe formar parte de la app nativa. Al arrancar, el contenedor entra directo
// en la app; si no hay sesion, el proxy del servidor redirige a /login.
const config: CapacitorConfig = {
  appId: "com.rogue.app",
  appName: "Rogue",
  webDir: "capacitor-www",
  server: {
    url: "https://rogue-two.vercel.app/app",
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      // Icono monocromo en la barra de estado (drawable ic_stat_rogue) y color
      // de acento. Android exige que el small icon sea una silueta blanca.
      smallIcon: "ic_stat_rogue",
      iconColor: "#FFFFFF",
    },
  },
};

export default config;
