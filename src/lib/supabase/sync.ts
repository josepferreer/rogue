/**
 * Cola de escrituras a Supabase.
 *
 * Todas las escrituras "best effort" de los stores pasan por aqui:
 * - Se ejecutan en orden (FIFO): el reintento de una escritura antigua nunca
 *   puede pisar una posterior (p.ej. dos patches seguidos al perfil).
 * - Ante un fallo (sin conexion, RLS, constraint...) se reintenta con espera;
 *   si sigue fallando queda registrada y la UI avisa (SyncErrorToast) con
 *   opcion de reintentar, en vez de fingir que se guardo.
 * - **Sobreviven a una recarga.** La cola se guarda en localStorage: antes
 *   vivia solo en memoria y todo lo pendiente se perdia en silencio al
 *   recargar, cerrar la pestana o cuando Android mataba el WebView.
 *
 * Por eso una escritura se describe con DATOS (`SyncOp`) y no con una funcion:
 * una closure no se puede serializar. El ejecutor arma la llamada aqui.
 *
 * Las operaciones deben ser IDEMPOTENTES (upsert / delete / update por clave),
 * porque un reintento puede repetir una escritura que fallo a medias.
 */

import { createClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;

export type SyncOp =
  | { kind: "upsert"; table: string; rows: Row | Row[] }
  | { kind: "update"; table: string; values: Row; match: Row }
  | { kind: "delete"; table: string; match: Row }
  | { kind: "rpc"; fn: string; args: Row };

export type PendingWrite = {
  id: string;
  /** Que se estaba guardando, para el mensaje ("el entreno", "la comida"...). */
  label: string;
  /** Operaciones del bloque; se ejecutan en orden y todas deben salir bien. */
  ops: SyncOp[];
  /** Sesion que la origino: no se reproduce con otro usuario logueado. */
  userId: string | null;
};

const STORAGE_KEY = "rogue.syncQueue.v1";
const RETRY_DELAYS_MS = [1500, 5000];
/** Tope para que localStorage no crezca sin limite si algo falla en bucle. */
const MAX_STORED = 200;

let queue: Promise<void> = Promise.resolve();
// Inmutables: cada cambio reasigna el array para que useSyncExternalStore
// detecte el nuevo snapshot por identidad.
let pending: PendingWrite[] = [];
let failed: PendingWrite[] = [];
const listeners = new Set<() => void>();

let client: ReturnType<typeof createClient> | null = null;
function supabase() {
  if (!client) client = createClient();
  return client;
}

function notify() {
  for (const listener of listeners) listener();
}

// --- Persistencia -----------------------------------------------------------

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pending: pending.slice(-MAX_STORED),
        failed: failed.slice(-MAX_STORED),
      }),
    );
  } catch {
    // Cuota llena o modo privado: seguimos en memoria, no rompemos la app.
  }
}

function loadStored(): { pending: PendingWrite[]; failed: PendingWrite[] } {
  if (typeof localStorage === "undefined") return { pending: [], failed: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pending: [], failed: [] };
    const data = JSON.parse(raw) as Partial<{
      pending: PendingWrite[];
      failed: PendingWrite[];
    }>;
    const ok = (w: unknown): w is PendingWrite =>
      !!w &&
      typeof w === "object" &&
      Array.isArray((w as PendingWrite).ops) &&
      typeof (w as PendingWrite).label === "string";
    return {
      pending: (data.pending ?? []).filter(ok),
      failed: (data.failed ?? []).filter(ok),
    };
  } catch {
    return { pending: [], failed: [] };
  }
}

// --- Suscripcion (SyncErrorToast) -------------------------------------------

export function subscribeSyncFailures(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFailedWrites(): PendingWrite[] {
  return failed;
}

// --- Ejecucion --------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runOp(op: SyncOp): Promise<void> {
  const db = supabase();
  if (op.kind === "upsert") {
    const { error } = await db.from(op.table).upsert(op.rows as never);
    if (error) throw error;
    return;
  }
  if (op.kind === "update") {
    const { error } = await db
      .from(op.table)
      .update(op.values as never)
      .match(op.match as never);
    if (error) throw error;
    return;
  }
  if (op.kind === "delete") {
    const { error } = await db.from(op.table).delete().match(op.match as never);
    if (error) throw error;
    return;
  }
  const { error } = await db.rpc(op.fn as never, op.args as never);
  if (error) throw error;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `w-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function removePending(id: string) {
  pending = pending.filter((w) => w.id !== id);
  persist();
}

async function attempt(write: PendingWrite) {
  for (let i = 0; ; i++) {
    try {
      for (const op of write.ops) await runOp(op);
      removePending(write.id);
      return;
    } catch (err) {
      if (i >= RETRY_DELAYS_MS.length) {
        console.error(`No se pudo guardar ${write.label}:`, err);
        removePending(write.id);
        failed = [...failed, write];
        persist();
        notify();
        return;
      }
      await sleep(RETRY_DELAYS_MS[i]);
    }
  }
}

function enqueue(write: PendingWrite) {
  pending = [...pending, write];
  persist();
  queue = queue.then(() => attempt(write));
}

/**
 * Encola una escritura. Nunca lanza: el fallo definitivo se reporta via
 * subscribeSyncFailures. `ops` se ejecuta en orden dentro del mismo bloque.
 */
/**
 * Ultimo usuario conocido. `getUser()` es async, asi que sin esta cache toda
 * escritura nace con `userId: null` y solo se sella un tick despues; si la app
 * se cierra en ese hueco, la escritura queda huerfana en localStorage. Con la
 * cache, en la practica nace ya sellada.
 */
let cachedUserId: string | null = null;

export function rememberSyncUser(userId: string | null) {
  cachedUserId = userId;
}

export function syncWrite(label: string, ops: SyncOp | SyncOp[]) {
  const write: PendingWrite = {
    id: newId(),
    label,
    ops: Array.isArray(ops) ? ops : [ops],
    userId: cachedUserId,
  };
  enqueue(write);
  // El usuario se sella dentro de la cola (getUser es async) para no arrastrar
  // un parametro mas por los ~20 puntos de escritura de los stores.
  queue = queue.then(async () => {
    if (write.userId !== null) return;
    const {
      data: { user },
    } = await supabase().auth.getUser();
    write.userId = user?.id ?? null;
    cachedUserId = write.userId;
    persist();
  });
}

/** Re-encola todas las escrituras fallidas (boton "Reintentar" del aviso). */
export function retryFailedWrites() {
  const toRetry = failed;
  failed = [];
  persist();
  notify();
  for (const write of toRetry) enqueue({ ...write, id: newId() });
}

/** Descarta los fallos pendientes (el usuario cierra el aviso). */
export function dismissFailedWrites() {
  failed = [];
  persist();
  notify();
}

/**
 * Reanuda lo que quedo a medias en una sesion anterior. Lo llama SyncErrorToast
 * al montar (vive en cliente, dentro de la zona autenticada).
 *
 * Solo se reproduce lo del usuario actual: si en este dispositivo entra otra
 * persona, esas escrituras no son suyas y ademas la RLS las rechazaria,
 * llenandole la pantalla de errores ajenos.
 */
export async function resumeStoredWrites() {
  const stored = loadStored();
  if (stored.pending.length === 0 && stored.failed.length === 0) return;

  const {
    data: { user },
  } = await supabase().auth.getUser();
  cachedUserId = user?.id ?? null;

  /**
   * Coincidencia EXACTA de usuario. Antes esto aceptaba tambien
   * `w.userId === null`, y esas escrituras huerfanas (las que se guardaron
   * antes de que `getUser()` sellara el id) se reproducian en la cuenta que
   * estuviera abierta al volver: si el dispositivo lo comparten dos personas,
   * los datos de una acababan en la cuenta de la otra. No se pueden atribuir,
   * asi que se descartan.
   */
  const mine = (w: PendingWrite) => w.userId !== null && w.userId === user?.id;

  const huerfanas = stored.pending.filter((w) => w.userId === null).length;
  if (huerfanas > 0) {
    console.warn(
      `[sync] ${huerfanas} escrituras sin usuario descartadas: no se pueden atribuir a una cuenta.`,
    );
  }

  failed = stored.failed.filter(mine);
  const resume = stored.pending.filter(mine);
  pending = [];
  persist();
  if (failed.length > 0) notify();
  for (const write of resume) enqueue({ ...write, id: newId() });
}
