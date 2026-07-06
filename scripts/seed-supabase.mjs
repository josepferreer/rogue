// Seed del catalogo de ejercicios a Supabase (tablas muscle_groups,
// equipment y exercises de supabase/schema.sql).
//
// Requiere variables de entorno:
//   SUPABASE_URL              https://<proyecto>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY clave service_role (no la anon)
//
// Uso: node scripts/seed-supabase.mjs
// Mientras no haya credenciales, la app funciona en modo demo leyendo
// src/data/exercises.es.json directamente (ver src/lib/exercises/repo.ts).

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. " +
      "La app seguira en modo demo con el dataset local.",
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exercises = JSON.parse(
  await readFile(join(root, "src", "data", "exercises.es.json"), "utf8"),
);

const GROUPS = [
  "Pecho", "Espalda", "Hombros", "Biceps", "Triceps", "Piernas", "Gluteos", "Core",
];
const EQUIPMENT = {
  barra: "Barra",
  mancuernas: "Mancuernas",
  maquina: "Maquina",
  polea: "Polea",
  "peso-corporal": "Peso corporal",
  kettlebell: "Kettlebell",
  "barra-z": "Barra Z",
  otro: "Otro",
};

async function upsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`${table}: ${res.status} ${await res.text()}`);
  }
  console.log(`OK ${table}: ${rows.length} filas`);
}

await upsert(
  "muscle_groups",
  GROUPS.map((nombre) => ({ id: nombre.toLowerCase(), nombre })),
);
await upsert(
  "equipment",
  Object.entries(EQUIPMENT).map(([id, nombre]) => ({ id, nombre })),
);
await upsert(
  "exercises",
  exercises.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    grupo: e.grupo.toLowerCase(),
    equipo: e.equipo,
    dificultad: e.dificultad,
    mecanica: e.mecanica,
    musculos_primarios: e.musculosPrimarios,
    musculos_secundarios: e.musculosSecundarios,
    instrucciones: e.instrucciones,
    consejos: e.consejos,
    fuente_id: e.fuenteId,
  })),
);

console.log("Seed completado.");
