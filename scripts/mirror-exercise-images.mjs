// Copia las imagenes de ejercicios de free-exercise-db a Supabase Storage.
//
// Por que (auditoria Pilar 1, A6): la app sirve hoy las ~400 imagenes desde
// raw.githubusercontent.com. Eso NO es un CDN: aplica limitacion de tasa, no
// garantiza disponibilidad y puede cortar trafico masivo. Con una beta publica,
// el dia que GitHub limite se queda la biblioteca entera en blanco, y ademas
// depende de un tercero para una funcion nuclear del producto.
//
// Las imagenes son de dominio publico (free-exercise-db), asi que se pueden
// alojar sin problema.
//
// Requiere las mismas variables que seed-supabase.mjs:
//   NEXT_PUBLIC_SUPABASE_URL  https://<proyecto>.supabase.co
//   SUPABASE_SECRET_KEY       clave secreta (sb_secret_..., no la publishable)
//
// Uso:
//   node scripts/mirror-exercise-images.mjs
//
// Despues, en .env / Vercel:
//   NEXT_PUBLIC_EXERCISE_IMG_BASE=https://<proyecto>.supabase.co/storage/v1/object/public/exercise-images
//
// Es idempotente: reejecutarlo salta lo que ya esta subido (usa upsert) y se
// puede interrumpir y reanudar sin dejar nada a medias.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const BUCKET = "exercise-images";
const SOURCE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
// Concurrencia moderada: suficiente para acabar en un par de minutos sin que
// GitHub nos corte por rafaga.
const CONCURRENCY = 6;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exercises = JSON.parse(
  await readFile(join(root, "src", "data", "exercises.es.json"), "utf8"),
);

/** Crea el bucket publico si no existe. */
async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 5 * 1024 * 1024,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    }),
  });
  if (res.ok) {
    console.log(`Bucket "${BUCKET}" creado.`);
    return;
  }
  const body = await res.text();
  // 409 = ya existe, que es lo normal a partir de la segunda ejecucion.
  if (res.status === 409 || body.includes("already exists")) {
    console.log(`Bucket "${BUCKET}" ya existe.`);
    return;
  }
  throw new Error(`No se pudo crear el bucket: ${res.status} ${body}`);
}

async function mirrorOne(path) {
  const source = `${SOURCE_BASE}/${path}`;
  const sourceRes = await fetch(source);
  if (!sourceRes.ok) {
    // Hay ejercicios del dataset cuyo fuenteId no tiene los 2 frames. No es
    // fatal: se avisa y se sigue, la UI ya tolera imagenes que no cargan.
    return { path, ok: false, reason: `origen ${sourceRes.status}` };
  }
  const bytes = Buffer.from(await sourceRes.arrayBuffer());

  const upRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: bytes,
    },
  );
  if (!upRes.ok) {
    return { path, ok: false, reason: `subida ${upRes.status} ${await upRes.text()}` };
  }
  return { path, ok: true };
}

/** Ejecuta `worker` sobre `items` con como mucho `limit` en vuelo a la vez. */
async function pool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

await ensureBucket();

// Cada ejercicio tiene 2 frames (inicio/fin del movimiento).
const paths = [];
for (const exercise of exercises) {
  if (!exercise.fuenteId) continue;
  paths.push(`${exercise.fuenteId}/0.jpg`, `${exercise.fuenteId}/1.jpg`);
}
const unique = [...new Set(paths)];

console.log(`Copiando ${unique.length} imagenes a ${BUCKET}...`);
const results = await pool(unique, CONCURRENCY, mirrorOne);

const failed = results.filter((r) => !r.ok);
console.log(`OK ${results.length - failed.length}/${results.length}`);
if (failed.length > 0) {
  console.log("\nNo copiadas:");
  for (const f of failed) console.log(`  ${f.path}: ${f.reason}`);
}
console.log(
  `\nAhora define en .env y en Vercel:\n` +
    `  NEXT_PUBLIC_EXERCISE_IMG_BASE=${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`,
);
