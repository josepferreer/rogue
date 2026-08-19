// Aplica los parches de node_modules (patch-package) tras cada `npm install`.
//
// Por que no se llama a `patch-package` directo desde el postinstall:
//
// 1. Si falla, TIENE que romper el build local y el de Android. Durante un
//    tiempo el postinstall era `patch-package || exit 0` y el fallo quedaba
//    oculto: se compilo una APK entera con el plugin SIN parchear y nadie se
//    entero hasta depurar el GPS a mano en un movil.
//
// 2. Pero en Vercel NO debe romperlo. Alli solo se compila la web, y el unico
//    parche del repo es codigo nativo de Android que ese build ni toca. Ademas
//    Vercel restaura un `node_modules` cacheado que ya puede tener aplicado el
//    parche ANTERIOR: al intentar aplicar el nuevo encima, choca y tumbaba el
//    despliegue por algo que ahi da igual.
//
// Uso: node scripts/apply-patches.mjs

import { execSync } from "node:child_process";

try {
  // `npx --no-install` lo resuelve desde node_modules/.bin sin descargar nada.
  // Llamar a `patch-package` a secas solo funciona dentro de un hook de npm
  // (es quien mete .bin en el PATH), y este script tambien se ejecuta a mano.
  execSync("npx --no-install patch-package", { stdio: "inherit" });
} catch {
  if (process.env.VERCEL) {
    console.warn(
      "\n[apply-patches] patch-package ha fallado, pero se continua porque " +
        "estamos en Vercel: el parche es de Android y el build web no lo usa.\n" +
        "Si el fallo persiste, redespliega SIN cache para regenerar node_modules.\n",
    );
    process.exit(0);
  }
  console.error(
    "\n[apply-patches] patch-package ha fallado. Esto SI importa fuera de " +
      "Vercel: sin el parche, la APK se compila con el plugin original y el " +
      "GPS se comporta distinto.\n" +
      "Prueba: rm -rf node_modules/@capacitor-community/background-geolocation && npm install\n",
  );
  process.exit(1);
}
