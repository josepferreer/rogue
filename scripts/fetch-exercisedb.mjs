// Descarga el dataset completo de free-exercise-db (dominio publico, 870+
// ejercicios en ingles) a scripts/data/exercises.en.json. Se usa como fuente
// para ampliar el dataset curado en espanol (src/data/exercises.es.json) y
// para el seed de Supabase.
//
// Uso: node scripts/fetch-exercisedb.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATASET_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "data");
const outFile = join(outDir, "exercises.en.json");

const res = await fetch(DATASET_URL);
if (!res.ok) {
  console.error(`Error descargando dataset: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const data = await res.json();

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(data, null, 2));
console.log(`OK: ${data.length} ejercicios guardados en ${outFile}`);
