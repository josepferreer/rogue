"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { syncWrite } from "@/lib/supabase/sync";

type SupabaseClient = ReturnType<typeof createClient>;

export type MealType = "desayuno" | "comida" | "cena" | "snack";

export const MEAL_TYPES: { type: MealType; label: string }[] = [
  { type: "desayuno", label: "Desayuno" },
  { type: "comida", label: "Comida" },
  { type: "cena", label: "Cena" },
  { type: "snack", label: "Snacks" },
];

/** Un ingrediente de un plato registrado desde la despensa: sus gramos en esta
 *  entrada y sus macros por 100 g, para poder reeditar cantidades despues sin
 *  depender de que el alimento siga existiendo en la despensa. */
export type BreakdownItem = {
  id: string;
  name: string;
  quantityG: number;
  kcal100: number;
  p100: number;
  c100: number;
  f100: number;
};

/** Un alimento registrado en el diario. Los *_100 son por 100 g; los totales
 *  reales se calculan con quantityG (ver entryMacros). */
export type MealEntry = {
  id: string;
  date: string; // YYYY-MM-DD local
  mealType: MealType;
  name: string;
  brand: string | null;
  barcode: string | null;
  quantityG: number;
  kcal100: number | null;
  protein100: number | null;
  fat100: number | null;
  carbs100: number | null;
  eaten: boolean;
  /** Desglose por ingrediente si la entrada es un plato de la despensa; null
   *  en alimentos sueltos. Vivia serializado dentro de `barcode`. */
  breakdown: BreakdownItem[] | null;
};

export type NutritionGoals = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type MacroTotals = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export const DEFAULT_GOALS: NutritionGoals = {
  kcal: 2000,
  protein: 130,
  fat: 65,
  carbs: 220,
};

/** Fecha local (no UTC) en formato YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Suma (o resta) dias a una clave YYYY-MM-DD y devuelve otra clave. */
export function shiftDayKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

/** Ventana que se carga al arrancar: los ultimos 3 meses y todo el futuro
 *  (las comidas planificadas hacia delante son pocas y se quieren siempre).
 *  Al navegar mas atras, `ensureLoadedFrom` trae el tramo que falte. */
const INITIAL_WINDOW_DAYS = 90;

/** Macros reales de una entrada segun sus gramos (base *_100 por 100 g). */
export function entryMacros(e: MealEntry): MacroTotals {
  const f = e.quantityG / 100;
  return {
    kcal: (e.kcal100 ?? 0) * f,
    protein: (e.protein100 ?? 0) * f,
    fat: (e.fat100 ?? 0) * f,
    carbs: (e.carbs100 ?? 0) * f,
  };
}

export function sumMacros(entries: MealEntry[]): MacroTotals {
  return entries.reduce<MacroTotals>(
    (acc, e) => {
      const m = entryMacros(e);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

/** Separa un dia en lo realmente comido y lo que sigue solo planificado.
 *  Todas las pantallas muestran `eaten` como cifra principal y `planned` como
 *  secundaria: antes el resumen del dia contaba solo lo comido mientras las
 *  tarjetas y el planificador sumaban todo, y las cifras se contradecian. */
export function splitMacros(entries: MealEntry[]): {
  eaten: MacroTotals;
  planned: MacroTotals;
} {
  return {
    eaten: sumMacros(entries.filter((e) => e.eaten)),
    planned: sumMacros(entries.filter((e) => !e.eaten)),
  };
}

export type NewMealEntry = Omit<MealEntry, "id">;

type MealsContextValue = {
  hydrated: boolean;
  /** Se esta trayendo un tramo anterior del diario (ver ensureLoadedFrom). */
  loadingOlder: boolean;
  entries: MealEntry[];
  goals: NutritionGoals;
  entriesForDay: (date: string) => MealEntry[];
  /** Garantiza que el diario esta cargado desde `date` (YYYY-MM-DD). La pide
   *  quien pinte fechas hacia atras (selector semanal, planificador); si ya
   *  esta dentro de la ventana cargada no hace nada. */
  ensureLoadedFrom: (date: string) => void;
  /** Re-lee diario y objetivos (lo usa NOA tras escribir en servidor). */
  reload: () => Promise<void>;
  addEntry: (input: NewMealEntry) => void;
  updateEntryQuantity: (id: string, quantityG: number) => void;
  updateEntry: (id: string, data: Partial<Omit<MealEntry, "id" | "date" | "mealType">>) => void;
  removeEntry: (id: string) => void;
  setGoals: (goals: NutritionGoals) => void;
  /** Devuelve los ml de agua registrados en un día, o 0 si no hay registro. */
  waterForDay: (date: string) => number;
  /** Actualiza (upsert) el registro de agua de un día. */
  updateWaterLog: (date: string, waterMl: number) => void;
};

const MealsContext = createContext<MealsContextValue | null>(null);

/** Identidad estable para los dias sin comidas: entriesForDay alimenta varios
 *  useMemo y devolver un array nuevo cada vez los invalidaria siempre. */
const EMPTY_ENTRIES: MealEntry[] = [];

type MealRow = {
  id: string;
  date: string;
  meal_type: MealType;
  name: string;
  brand: string | null;
  barcode: string | null;
  quantity_g: number;
  kcal_100: number | null;
  protein_100: number | null;
  fat_100: number | null;
  carbs_100: number | null;
  eaten: boolean | null;
  breakdown?: unknown;
};

const ENTRY_COLUMNS =
  "id, date, meal_type, name, brand, barcode, quantity_g, kcal_100, protein_100, fat_100, carbs_100, eaten";

/** Formato antiguo: el desglose iba dentro de `barcode`. Se sigue leyendo para
 *  las filas que la migracion no pudo convertir, y se vuelve a escribir asi si
 *  la columna `breakdown` todavia no existe. */
const LEGACY_PLATO_PREFIX = "__plato__:";

/** Columna `breakdown` (migracion 20260805_nutricion_pilar3.sql). Si aun no
 *  esta aplicada se degrada al formato antiguo en vez de tumbar el diario. */
let hasBreakdownColumn = true;

function parseBreakdown(raw: unknown): BreakdownItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items = raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      id: String(x.id ?? ""),
      name: String(x.name ?? "Desconocido"),
      quantityG: Number(x.quantityG) || 0,
      kcal100: Number(x.kcal100) || 0,
      p100: Number(x.p100) || 0,
      c100: Number(x.c100) || 0,
      f100: Number(x.f100) || 0,
    }));
  return items.length > 0 ? items : null;
}

function legacyBreakdown(barcode: string | null): BreakdownItem[] | null {
  if (!barcode?.startsWith(LEGACY_PLATO_PREFIX)) return null;
  try {
    return parseBreakdown(JSON.parse(barcode.slice(LEGACY_PLATO_PREFIX.length)));
  } catch {
    return null;
  }
}

function rowToEntry(r: MealRow): MealEntry {
  const num = (v: number | null) => (v === null ? null : Number(v));
  const isLegacy = !!r.barcode?.startsWith(LEGACY_PLATO_PREFIX);
  return {
    id: r.id,
    date: r.date,
    mealType: r.meal_type,
    name: r.name,
    brand: r.brand,
    barcode: isLegacy ? null : r.barcode,
    quantityG: Number(r.quantity_g),
    kcal100: num(r.kcal_100),
    protein100: num(r.protein_100),
    fat100: num(r.fat_100),
    carbs100: num(r.carbs_100),
    eaten: r.eaten ?? false,
    breakdown: parseBreakdown(r.breakdown) ?? legacyBreakdown(r.barcode),
  };
}

/** Como viajan `breakdown` y `barcode` a la BD segun exista o no la columna. */
function breakdownFields(entry: {
  breakdown: BreakdownItem[] | null;
  barcode: string | null;
}): Record<string, unknown> {
  if (hasBreakdownColumn) {
    return { breakdown: entry.breakdown, barcode: entry.barcode };
  }
  return {
    barcode: entry.breakdown
      ? LEGACY_PLATO_PREFIX + JSON.stringify(entry.breakdown)
      : entry.barcode,
  };
}

/**
 * Trae el diario de una ventana de fechas `[from, until]` (ambas inclusive;
 * `until` opcional = sin tope por arriba, para no perder comidas planificadas
 * a futuro).
 *
 * Antes se traia el historico ENTERO en cada arranque: un usuario a 12
 * entradas al dia genera ~4.400 filas al año y todas viajaban al movil para
 * pintar, casi siempre, una sola semana. La consulta usa
 * `meal_entries_user_date_idx (user_id, date)`.
 */
async function fetchEntries(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  until?: string,
): Promise<MealEntry[]> {
  // Paginado con .range(): un diario activo supera las 1000 filas (limite
  // silencioso por defecto de PostgREST) en pocos meses.
  const rows = await fetchAllPages<MealRow>(async (offset, to) => {
    // Los dos `select` van literales: supabase-js deduce el tipo de la fila del
    // string, y una expresion calculada le da un ParserError.
    const page = async (withBreakdown: boolean) => {
      const q = supabase.from("meal_entries");
      const sel = withBreakdown
        ? q.select(`${ENTRY_COLUMNS}, breakdown`)
        : q.select(ENTRY_COLUMNS);
      let filtered = sel.eq("user_id", userId).gte("date", from);
      if (until) filtered = filtered.lte("date", until);
      const { data, error } = await filtered
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, to);
      return { data: data as MealRow[] | null, error };
    };

    let { data, error } = await page(hasBreakdownColumn);
    // 42703 = columna inexistente: la migracion aun no esta aplicada.
    if (error?.code === "42703" && hasBreakdownColumn) {
      console.warn(
        "meal_entries.breakdown no existe todavia: aplica 20260805_nutricion_pilar3.sql. " +
          "Mientras tanto el desglose de platos sigue en `barcode`.",
      );
      hasBreakdownColumn = false;
      ({ data, error } = await page(false));
    }
    if (error) throw error;
    return data ?? [];
  });
  return rows.map(rowToEntry);
}

async function fetchGoals(
  supabase: SupabaseClient,
  userId: string,
): Promise<NutritionGoals> {
  const { data, error } = await supabase
    .from("nutrition_goals")
    .select("kcal_target, protein_target, fat_target, carbs_target")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_GOALS;
  return {
    kcal: data.kcal_target,
    protein: data.protein_target,
    fat: data.fat_target,
    carbs: data.carbs_target,
  };
}

async function fetchWaterLogs(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  until?: string,
): Promise<Record<string, number>> {
  let q = supabase
    .from("water_log")
    .select("date, water_ml")
    .eq("user_id", userId)
    .gte("date", from);
  if (until) q = q.lte("date", until);

  const { data, error } = await q;
  if (error) throw error;

  const logs: Record<string, number> = {};
  for (const row of data ?? []) {
    logs[row.date] = row.water_ml;
  }
  return logs;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MealsProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();

  const [hydrated, setHydrated] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [waterLogs, setWaterLogs] = useState<Record<string, number>>({});
  const [goals, setGoalsState] = useState<NutritionGoals>(DEFAULT_GOALS);
  const userIdRef = useRef<string | null>(null);
  // Primer dia cargado. Todo lo anterior aun no esta en `entries`, asi que
  // pintarlo sin pedirlo antes daria dias vacios que si tienen comidas.
  const rangeStartRef = useRef<string>(shiftDayKey(dayKey(), -INITIAL_WINDOW_DAYS));

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        userIdRef.current = null;
        setEntries([]);
        setGoalsState(DEFAULT_GOALS);
        setHydrated(true);
        return;
      }
      if (user.id === userIdRef.current) {
        setHydrated(true);
        return;
      }
      const windowStart = shiftDayKey(dayKey(), -INITIAL_WINDOW_DAYS);
      let loadedEntries: MealEntry[];
      let loadedGoals: NutritionGoals;
      let loadedWater: Record<string, number>;
      try {
        [loadedEntries, loadedGoals, loadedWater] = await Promise.all([
          fetchEntries(supabase, user.id, windowStart),
          fetchGoals(supabase, user.id),
          fetchWaterLogs(supabase, user.id, windowStart),
        ]);
      } catch (err) {
        // El diario queda vacio hasta la proxima navegacion (userIdRef no se
        // fija, asi que se reintentara); no bloquea el resto de la app.
        console.error("No se pudo cargar el diario de comidas:", err);
        if (active) setHydrated(true);
        return;
      }
      if (!active) return;
      userIdRef.current = user.id;
      rangeStartRef.current = windowStart;
      setEntries(loadedEntries);
      setGoalsState(loadedGoals);
      setWaterLogs(loadedWater);
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, [pathname, supabase]);

  // Indice por dia: el planificador llama a entriesForDay 28 veces por render
  // (4 comidas x 7 dias) y antes cada llamada recorria el diario entero.
  const entriesByDay = useMemo(() => {
    const map = new Map<string, MealEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [entries]);

  const entriesForDay = useCallback(
    (date: string) => entriesByDay.get(date) ?? EMPTY_ENTRIES,
    [entriesByDay],
  );

  /**
   * Re-lee el diario y los objetivos desde la ventana ya cargada. La usa NOA
   * tras escribir en servidor: ese cambio no pasa por `addEntry`, así que sin
   * esto la pantalla seguiría enseñando el diario de antes.
   */
  const reload = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const [freshEntries, freshGoals] = await Promise.all([
        fetchEntries(supabase, userId, rangeStartRef.current),
        fetchGoals(supabase, userId),
      ]);
      setEntries(freshEntries);
      setGoalsState(freshGoals);
    } catch (err) {
      console.error("No se pudo recargar el diario:", err);
    }
  }, [supabase]);

  const ensureLoadedFrom = useCallback(
    (date: string) => {
      const userId = userIdRef.current;
      if (!userId || date >= rangeStartRef.current) return;

      // El tramo pedido va hasta el dia anterior al ya cargado: no se repite
      // nada y las entradas nuevas no se duplican.
      const until = shiftDayKey(rangeStartRef.current, -1);
      rangeStartRef.current = date;
      setLoadingOlder(true);
      (async () => {
        try {
          const [olderEntries, olderWater] = await Promise.all([
            fetchEntries(supabase, userId, date, until),
            fetchWaterLogs(supabase, userId, date, until),
          ]);
          setEntries((prev) => {
            const known = new Set(prev.map((e) => e.id));
            const nuevos = olderEntries.filter((e) => !known.has(e.id));
            return nuevos.length > 0 ? [...nuevos, ...prev] : prev;
          });
          setWaterLogs((prev) => ({ ...prev, ...olderWater }));
        } catch (err) {
          // Se reabre la ventana para que un nuevo intento vuelva a pedirlo.
          rangeStartRef.current = shiftDayKey(until, 1);
          console.error("No se pudo cargar el diario anterior:", err);
        } finally {
          setLoadingOlder(false);
        }
      })();
    },
    [supabase],
  );

  const addEntry = useCallback(
    (input: NewMealEntry) => {
      const entry: MealEntry = { ...input, id: newId() };
      setEntries((prev) => [...prev, entry]);

      const userId = userIdRef.current;
      if (userId) {
        // Upsert por el id generado en cliente: reintentable sin duplicar.
        syncWrite("la comida", {
          kind: "upsert",
          table: "meal_entries",
          rows: {
            id: entry.id,
            user_id: userId,
            date: entry.date,
            meal_type: entry.mealType,
            name: entry.name,
            brand: entry.brand,
            ...breakdownFields(entry),
            quantity_g: entry.quantityG,
            kcal_100: entry.kcal100,
            protein_100: entry.protein100,
            fat_100: entry.fat100,
            carbs_100: entry.carbs100,
            eaten: entry.eaten,
          },
        });
      }
    },
    [],
  );

  const updateEntryQuantity = useCallback(
    (id: string, quantityG: number) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, quantityG } : e)),
      );
      const userId = userIdRef.current;
      if (userId) {
        syncWrite("la comida", {
          kind: "update",
          table: "meal_entries",
          values: { quantity_g: quantityG },
          match: { id },
        });
      }
    },
    [],
  );

  const updateEntry = useCallback(
    (id: string, data: Partial<Omit<MealEntry, "id" | "date" | "mealType">>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...data } : e)),
      );
      const userId = userIdRef.current;
      if (userId) {
        const payload: Record<string, unknown> = {};
        if (data.name !== undefined) payload.name = data.name;
        if (data.brand !== undefined) payload.brand = data.brand;
        // `breakdown` y `barcode` van juntos: con la columna sin migrar, el
        // desglose se reescribe dentro de `barcode` (ver breakdownFields).
        if (data.barcode !== undefined || data.breakdown !== undefined) {
          const base = entries.find((e) => e.id === id);
          Object.assign(
            payload,
            breakdownFields({
              breakdown:
                data.breakdown !== undefined ? data.breakdown : base?.breakdown ?? null,
              barcode: data.barcode !== undefined ? data.barcode : base?.barcode ?? null,
            }),
          );
        }
        if (data.quantityG !== undefined) payload.quantity_g = data.quantityG;
        if (data.kcal100 !== undefined) payload.kcal_100 = data.kcal100;
        if (data.protein100 !== undefined) payload.protein_100 = data.protein100;
        if (data.fat100 !== undefined) payload.fat_100 = data.fat100;
        if (data.carbs100 !== undefined) payload.carbs_100 = data.carbs100;
        if (data.eaten !== undefined) payload.eaten = data.eaten;

        if (Object.keys(payload).length > 0) {
          syncWrite("la comida", {
            kind: "update",
            table: "meal_entries",
            values: payload,
            match: { id },
          });
        }
      }
    },
    [entries],
  );

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      const userId = userIdRef.current;
      if (userId) {
        syncWrite("la comida", { kind: "delete", table: "meal_entries", match: { id } });
      }
    },
    [],
  );

  const setGoals = useCallback(
    (next: NutritionGoals) => {
      setGoalsState(next);
      const userId = userIdRef.current;
      if (userId) {
        syncWrite("los objetivos", {
          kind: "upsert",
          table: "nutrition_goals",
          rows: {
            user_id: userId,
            kcal_target: Math.round(next.kcal),
            protein_target: Math.round(next.protein),
            fat_target: Math.round(next.fat),
            carbs_target: Math.round(next.carbs),
            updated_at: new Date().toISOString(),
          },
        });
      }
    },
    [],
  );

  const waterForDay = useCallback(
    (date: string) => waterLogs[date] ?? 0,
    [waterLogs],
  );

  const updateWaterLog = useCallback(
    (date: string, waterMl: number) => {
      setWaterLogs((prev) => ({ ...prev, [date]: waterMl }));
      const userId = userIdRef.current;
      if (userId) {
        syncWrite("el agua", {
          kind: "upsert",
          table: "water_log",
          rows: {
            user_id: userId,
            date,
            water_ml: waterMl,
            updated_at: new Date().toISOString(),
          },
        });
      }
    },
    [],
  );

  const value: MealsContextValue = useMemo(
    () => ({
      hydrated,
      loadingOlder,
      entries,
      goals,
      entriesForDay,
      ensureLoadedFrom,
      reload,
      addEntry,
      updateEntryQuantity,
      updateEntry,
      removeEntry,
      setGoals,
      waterForDay,
      updateWaterLog,
    }),
    [
      hydrated,
      loadingOlder,
      entries,
      goals,
      waterForDay,
      updateWaterLog,
      entriesForDay,
      ensureLoadedFrom,
      reload,
      addEntry,
      updateEntryQuantity,
      updateEntry,
      removeEntry,
      setGoals,
    ],
  );

  return <MealsContext.Provider value={value}>{children}</MealsContext.Provider>;
}

export function useMeals(): MealsContextValue {
  const ctx = useContext(MealsContext);
  if (!ctx) throw new Error("useMeals debe usarse dentro de MealsProvider");
  return ctx;
}
