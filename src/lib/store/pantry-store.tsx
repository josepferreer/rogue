"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { syncWrite } from "@/lib/supabase/sync";
import type { HealthScore } from "@/lib/food/health-score";

export type { HealthScore };

/** Ingrediente de un producto listo: nombre y, si OFF declaraba su porcentaje,
 *  gramos estimados dentro de la racion (si no, queda en blanco). */
export type Ingredient = { name: string; grams?: number };

export type Alimento = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  isFavorite: boolean;
  healthScore?: HealthScore;
  /** Ingredientes de un producto listo escaneado (informativo).
   *  Vacio/undefined para alimentos simples y creados a mano. */
  ingredients?: Ingredient[];
  /** Tamaño de racion en g del producto (0/undefined = desconocido). */
  servingG?: number;
};

/** Normaliza el jsonb de ingredientes: acepta el formato viejo (string[]) y el
 *  nuevo ({name, grams?}[]); devuelve undefined si esta vacio. */
function normalizeIngredients(raw: unknown): Ingredient[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: Ingredient[] = raw.map((x) =>
    typeof x === "string"
      ? { name: x }
      : {
          name: String((x as { name?: unknown }).name ?? ""),
          grams:
            typeof (x as { grams?: unknown }).grams === "number"
              ? (x as { grams: number }).grams
              : undefined,
        },
  );
  const clean = out.filter((i) => i.name);
  return clean.length > 0 ? clean : undefined;
}

export type PlatoFood = {
  alimentoId: string;
  quantityG: number;
};

export type Plato = {
  id: string;
  name: string;
  kcal: number;
  foods: PlatoFood[];
  isFavorite: boolean;
  healthScore?: HealthScore;
  /** Macros por 100 g de un plato "listo" (producto preparado escaneado). Solo
   *  se usan cuando el plato no tiene ingredientes enlazables (foods vacio); en
   *  los platos manuales las macros se calculan sumando sus alimentos. */
  protein?: number;
  carbs?: number;
  fat?: number;
  /** Ingredientes de un producto listo (informativo). */
  ingredients?: Ingredient[];
  /** Tamaño de racion en g del producto (0/undefined = desconocido). */
  servingG?: number;
};

/** Un plato "listo" (producto preparado escaneado) no tiene ingredientes
 *  enlazados a la despensa: guarda sus propias macros por 100 g y se registra
 *  por gramos como un alimento. Los platos manuales siempre tienen >=1 food. */
export function isReadyPlato(p: Plato): boolean {
  return p.foods.length === 0;
}

export type PlatoMacros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Peso total en g (0 en platos listos, que van por 100 g). */
  weightG: number;
  /** Ingredientes que ya no estan en la despensa. */
  missing: number;
};

/**
 * Macros de un plato calculadas AHORA contra la despensa.
 *
 * En los platos manuales, `p.kcal` es una copia congelada al guardarlo: si
 * luego se editan las macros de un ingrediente, esa copia miente. Al añadirlo
 * al diario siempre se recalculaba, asi que el mismo plato mostraba dos cifras
 * distintas segun la pantalla. Para PINTAR se usa siempre esta funcion.
 *
 * Ojo con la asimetria (viene del modelo): en un plato listo las cifras son
 * POR 100 G; en uno manual son el TOTAL del plato.
 */
export function platoMacros(p: Plato, alimentos: Alimento[]): PlatoMacros {
  if (isReadyPlato(p)) {
    return {
      kcal: p.kcal,
      protein: p.protein ?? 0,
      carbs: p.carbs ?? 0,
      fat: p.fat ?? 0,
      weightG: 0,
      missing: 0,
    };
  }
  const out: PlatoMacros = { kcal: 0, protein: 0, carbs: 0, fat: 0, weightG: 0, missing: 0 };
  for (const f of p.foods) {
    const a = alimentos.find((x) => x.id === f.alimentoId);
    if (!a) {
      out.missing++;
      continue;
    }
    const factor = f.quantityG / 100;
    out.kcal += a.kcal * factor;
    out.protein += a.protein * factor;
    out.carbs += a.carbs * factor;
    out.fat += a.fat * factor;
    out.weightG += f.quantityG;
  }
  return out;
}

type PantryContextType = {
  /** false mientras se lee la despensa del usuario (evita pintar "vacia"). */
  hydrated: boolean;
  /** La lectura fallo: la despensa que se ve NO es la del usuario (esta
   *  vacia). La UI debe decirlo y ofrecer reintentar, nunca fingir. */
  loadError: boolean;
  reload: () => void;
  alimentos: Alimento[];
  platos: Plato[];
  addAlimento: (a: Omit<Alimento, "id" | "isFavorite">) => void;
  updateAlimento: (id: string, data: Partial<Alimento>) => void;
  /** Borra el alimento Y lo quita de los platos que lo usaban (un plato que se
   *  quede sin ingredientes se borra tambien). Sin esto quedaban referencias
   *  colgadas que el diario contaba como 0 kcal en silencio. */
  deleteAlimento: (id: string) => void;
  /** Platos que usan este alimento, para poder avisar antes de borrarlo. */
  platosUsando: (alimentoId: string) => Plato[];
  addPlato: (p: Omit<Plato, "id" | "isFavorite">) => void;
  updatePlato: (id: string, data: Partial<Plato>) => void;
  deletePlato: (id: string) => void;
  toggleFavoriteAlimento: (id: string) => void;
  toggleFavoritePlato: (id: string) => void;
};

// Despensa de partida para usuarios nuevos: se siembra en Supabase UNA sola
// vez (marca `profiles.pantry_seeded`) y nunca se muestra sin persistir, para
// que nadie vea como suya una despensa que no lo es. Los ids demo se remapean
// a uuids al sembrar.
const DEMO_ALIMENTOS: Alimento[] = [
  { id: "1", name: "Pechuga de pollo", kcal: 165, protein: 31, carbs: 0, fat: 3.6, isFavorite: false, healthScore: "green" },
  { id: "2", name: "Arroz blanco", kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, isFavorite: false, healthScore: "yellow" },
  { id: "3", name: "Patata", kcal: 86, protein: 1.7, carbs: 20, fat: 0.1, isFavorite: false, healthScore: "green" },
  { id: "4", name: "Tomate", kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, isFavorite: false, healthScore: "green" },
  { id: "5", name: "Pasta", kcal: 131, protein: 5, carbs: 25, fat: 1, isFavorite: false, healthScore: "yellow" },
  { id: "6", name: "Bacon", kcal: 541, protein: 37, carbs: 1.4, fat: 42, isFavorite: false, healthScore: "red" },
  { id: "7", name: "Chocolate con leche", kcal: 535, protein: 7.6, carbs: 59, fat: 30, isFavorite: false, healthScore: "red" },
  { id: "8", name: "Manzana", kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, isFavorite: false, healthScore: "green" },
  { id: "9", name: "Aceite de Oliva", kcal: 884, protein: 0, carbs: 0, fat: 100, isFavorite: false, healthScore: "orange" },
];

const DEMO_PLATOS: Plato[] = [
  {
    id: "p1", name: "Pollo con arroz y tomate", kcal: 443,
    foods: [{ alimentoId: "1", quantityG: 200 }, { alimentoId: "2", quantityG: 80 }, { alimentoId: "4", quantityG: 50 }],
    isFavorite: false,
    healthScore: "green",
  },
  {
    id: "p2", name: "Macarrones con tomate", kcal: 185,
    foods: [{ alimentoId: "5", quantityG: 100 }, { alimentoId: "4", quantityG: 300 }],
    isFavorite: false,
    healthScore: "yellow",
  },
  {
    id: "p3", name: "Pollo asado con patatas", kcal: 542,
    foods: [{ alimentoId: "1", quantityG: 250 }, { alimentoId: "3", quantityG: 150 }],
    isFavorite: false,
    healthScore: "green",
  },
  {
    id: "p4", name: "Bacon con patatas", kcal: 800,
    foods: [{ alimentoId: "6", quantityG: 100 }, { alimentoId: "3", quantityG: 300 }],
    isFavorite: false,
    healthScore: "red",
  },
];

// --- Mapeo filas de Supabase <-> tipos de la app ---

type SupabaseClient = ReturnType<typeof createClient>;

type FoodRow = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: unknown;
  serving_g: number | null;
  is_favorite: boolean;
  health_score: HealthScore | null;
};

type DishRow = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  foods: PlatoFood[];
  ingredients: unknown;
  serving_g: number | null;
  is_favorite: boolean;
  health_score: HealthScore | null;
};

function rowToAlimento(r: FoodRow): Alimento {
  return {
    id: r.id,
    name: r.name,
    kcal: Number(r.kcal),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    fat: Number(r.fat),
    isFavorite: r.is_favorite,
    healthScore: r.health_score ?? undefined,
    ingredients: normalizeIngredients(r.ingredients),
    servingG: r.serving_g ? Number(r.serving_g) : undefined,
  };
}

function rowToPlato(r: DishRow): Plato {
  return {
    id: r.id,
    name: r.name,
    kcal: Number(r.kcal),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    fat: Number(r.fat),
    foods: r.foods ?? [],
    isFavorite: r.is_favorite,
    healthScore: r.health_score ?? undefined,
    ingredients: normalizeIngredients(r.ingredients),
    servingG: r.serving_g ? Number(r.serving_g) : undefined,
  };
}

function alimentoToRow(userId: string, a: Alimento) {
  return {
    id: a.id,
    user_id: userId,
    name: a.name,
    kcal: a.kcal,
    protein: a.protein,
    carbs: a.carbs,
    fat: a.fat,
    ingredients: a.ingredients ?? [],
    serving_g: a.servingG ?? 0,
    is_favorite: a.isFavorite,
    health_score: a.healthScore ?? null,
  };
}

function platoToRow(userId: string, p: Plato) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    kcal: p.kcal,
    protein: p.protein ?? 0,
    carbs: p.carbs ?? 0,
    fat: p.fat ?? 0,
    foods: p.foods,
    ingredients: p.ingredients ?? [],
    serving_g: p.servingG ?? 0,
    is_favorite: p.isFavorite,
    health_score: p.healthScore ?? null,
  };
}

async function fetchPantry(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ alimentos: Alimento[]; platos: Plato[] }> {
  const [foodRows, dishRows] = await Promise.all([
    fetchAllPages<FoodRow>(async (from, to) => {
      const { data, error } = await supabase
        .from("pantry_foods")
        .select("id, name, kcal, protein, carbs, fat, ingredients, serving_g, is_favorite, health_score")
        .eq("user_id", userId)
        .order("name")
        .order("id")
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as FoodRow[];
    }),
    fetchAllPages<DishRow>(async (from, to) => {
      const { data, error } = await supabase
        .from("pantry_dishes")
        .select("id, name, kcal, protein, carbs, fat, foods, ingredients, serving_g, is_favorite, health_score")
        .eq("user_id", userId)
        .order("name")
        .order("id")
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as DishRow[];
    }),
  ]);
  return { alimentos: foodRows.map(rowToAlimento), platos: dishRows.map(rowToPlato) };
}

/** ¿Ya se le sembro la despensa demo a este usuario? null = la columna aun no
 *  existe (migracion sin aplicar): se cae al criterio antiguo, sembrar cuando
 *  la despensa esta vacia. */
async function fetchSeeded(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("pantry_seeded")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // 42703 = columna inexistente.
    if (error.code === "42703") {
      console.warn(
        "profiles.pantry_seeded no existe todavia: aplica 20260805_nutricion_pilar3.sql.",
      );
      return null;
    }
    throw error;
  }
  return data?.pantry_seeded ?? false;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `pantry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Copia de la despensa demo con uuids nuevos (y las referencias de los
 *  platos remapeadas), lista para sembrar en Supabase. */
function buildSeedPantry(): { alimentos: Alimento[]; platos: Plato[] } {
  const idMap = new Map<string, string>();
  const alimentos = DEMO_ALIMENTOS.map((a) => {
    const id = newId();
    idMap.set(a.id, id);
    return { ...a, id };
  });
  const platos = DEMO_PLATOS.map((p) => ({
    ...p,
    id: newId(),
    foods: p.foods.map((f) => ({ ...f, alimentoId: idMap.get(f.alimentoId) ?? f.alimentoId })),
  }));
  return { alimentos, platos };
}

const PantryContext = createContext<PantryContextType | null>(null);

export function PantryProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  // Se arranca vacia, nunca con la demo: hasta ahora un fallo de lectura
  // dejaba en pantalla los alimentos de ejemplo como si fueran del usuario, y
  // todo lo que editaba encima se perdia sin un solo aviso.
  const [alimentos, setAlimentos] = useState<Alimento[]>([]);
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const userIdRef = useRef<string | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Hidrata la despensa del usuario desde Supabase. Si esta vacia y nunca se
  // le sembro (profiles.pantry_seeded), se siembra la demo como base editable;
  // vaciarla a mano despues ya no la repuebla.
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setHydrated(true);
        return;
      }

      let pantry: { alimentos: Alimento[]; platos: Plato[] };
      let seeded: boolean | null;
      try {
        [pantry, seeded] = await Promise.all([
          fetchPantry(supabase, user.id),
          fetchSeeded(supabase, user.id),
        ]);
      } catch (err) {
        console.error("No se pudo cargar la despensa:", err);
        if (active) {
          setAlimentos([]);
          setPlatos([]);
          setLoadError(true);
          setHydrated(true);
        }
        return;
      }
      if (!active) return;

      const empty = pantry.alimentos.length === 0 && pantry.platos.length === 0;
      if (empty && seeded !== true) {
        pantry = buildSeedPantry();
        const userId = user.id;
        const markSeeded = seeded !== null;
        syncWrite("la despensa", [
          {
            kind: "upsert",
            table: "pantry_foods",
            rows: pantry.alimentos.map((a) => alimentoToRow(userId, a)),
          },
          {
            kind: "upsert",
            table: "pantry_dishes",
            rows: pantry.platos.map((p) => platoToRow(userId, p)),
          },
          ...(markSeeded
            ? ([
                {
                  kind: "update",
                  table: "profiles",
                  values: { pantry_seeded: true },
                  match: { user_id: userId },
                },
              ] as const)
            : []),
        ]);
      }

      userIdRef.current = user.id;
      setAlimentos(pantry.alimentos);
      setPlatos(pantry.platos);
      setLoadError(false);
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, [supabase, reloadKey]);

  const persistAlimento = useCallback(
    (a: Alimento) => {
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el alimento", {
        kind: "upsert",
        table: "pantry_foods",
        rows: alimentoToRow(userId, a),
      });
    },
    [],
  );

  const persistPlato = useCallback(
    (p: Plato) => {
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el plato", {
        kind: "upsert",
        table: "pantry_dishes",
        rows: platoToRow(userId, p),
      });
    },
    [],
  );

  const addAlimento = useCallback(
    (a: Omit<Alimento, "id" | "isFavorite">) => {
      const alimento: Alimento = { ...a, id: newId(), isFavorite: false };
      setAlimentos((prev) => [alimento, ...prev]);
      persistAlimento(alimento);
    },
    [persistAlimento],
  );

  const updateAlimento = useCallback(
    (id: string, data: Partial<Alimento>) => {
      // El siguiente valor se calcula fuera del updater (deben ser puros).
      const base = alimentos.find((a) => a.id === id);
      if (!base) return;
      const next = { ...base, ...data };
      const nextAlimentos = alimentos.map((a) => (a.id === id ? next : a));
      setAlimentos(nextAlimentos);
      persistAlimento(next);

      // Los platos guardan una copia de sus kcal totales. Si cambian las macros
      // del ingrediente hay que rehacerla, o la fila de BD se queda mintiendo.
      const macrosCambian =
        next.kcal !== base.kcal ||
        next.protein !== base.protein ||
        next.carbs !== base.carbs ||
        next.fat !== base.fat;
      if (!macrosCambian) return;

      const afectados = platos.filter((p) => p.foods.some((f) => f.alimentoId === id));
      if (afectados.length === 0) return;
      const rehechos = new Map(
        afectados.map((p) => [
          p.id,
          { ...p, kcal: Math.round(platoMacros(p, nextAlimentos).kcal) },
        ]),
      );
      setPlatos((prev) => prev.map((p) => rehechos.get(p.id) ?? p));
      for (const p of rehechos.values()) persistPlato(p);
    },
    [alimentos, platos, persistAlimento, persistPlato],
  );

  const platosUsando = useCallback(
    (alimentoId: string) =>
      platos.filter((p) => p.foods.some((f) => f.alimentoId === alimentoId)),
    [platos],
  );

  const deleteAlimento = useCallback(
    (id: string) => {
      const nextAlimentos = alimentos.filter((a) => a.id !== id);
      setAlimentos(nextAlimentos);

      // Un plato al que se le quita su unico ingrediente no puede quedarse con
      // foods vacio: isReadyPlato lo tomaria por un producto escaneado y
      // interpretaria sus kcal como "por 100 g". Se borra.
      const afectados = platos.filter((p) => p.foods.some((f) => f.alimentoId === id));
      const vaciados = new Set<string>();
      const recortados = new Map<string, Plato>();
      for (const p of afectados) {
        const foods = p.foods.filter((f) => f.alimentoId !== id);
        if (foods.length === 0) {
          vaciados.add(p.id);
          continue;
        }
        const recortado = { ...p, foods };
        recortados.set(p.id, { ...recortado, kcal: Math.round(platoMacros(recortado, nextAlimentos).kcal) });
      }
      if (vaciados.size > 0 || recortados.size > 0) {
        setPlatos((prev) =>
          prev.filter((p) => !vaciados.has(p.id)).map((p) => recortados.get(p.id) ?? p),
        );
      }

      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el alimento", { kind: "delete", table: "pantry_foods", match: { id } });
      for (const p of recortados.values()) persistPlato(p);
      for (const platoId of vaciados) {
        syncWrite("el plato", {
          kind: "delete",
          table: "pantry_dishes",
          match: { id: platoId },
        });
      }
    },
    [alimentos, platos, persistPlato],
  );

  const addPlato = useCallback(
    (p: Omit<Plato, "id" | "isFavorite">) => {
      const plato: Plato = { ...p, id: newId(), isFavorite: false };
      setPlatos((prev) => [plato, ...prev]);
      persistPlato(plato);
    },
    [persistPlato],
  );

  const updatePlato = useCallback(
    (id: string, data: Partial<Plato>) => {
      const base = platos.find((p) => p.id === id);
      if (!base) return;
      const next = { ...base, ...data };
      setPlatos((prev) => prev.map((p) => (p.id === id ? next : p)));
      persistPlato(next);
    },
    [platos, persistPlato],
  );

  const deletePlato = useCallback(
    (id: string) => {
      setPlatos((prev) => prev.filter((p) => p.id !== id));
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el plato", { kind: "delete", table: "pantry_dishes", match: { id } });
    },
    [],
  );

  const toggleFavoriteAlimento = useCallback(
    (id: string) => {
      const base = alimentos.find((a) => a.id === id);
      if (!base) return;
      const next = { ...base, isFavorite: !base.isFavorite };
      setAlimentos((prev) => prev.map((a) => (a.id === id ? next : a)));
      persistAlimento(next);
    },
    [alimentos, persistAlimento],
  );

  const toggleFavoritePlato = useCallback(
    (id: string) => {
      const base = platos.find((p) => p.id === id);
      if (!base) return;
      const next = { ...base, isFavorite: !base.isFavorite };
      setPlatos((prev) => prev.map((p) => (p.id === id ? next : p)));
      persistPlato(next);
    },
    [platos, persistPlato],
  );

  const value = useMemo<PantryContextType>(
    () => ({
      hydrated, loadError, reload, platosUsando,
      alimentos, platos, addAlimento, updateAlimento, deleteAlimento, addPlato, updatePlato, deletePlato, toggleFavoriteAlimento, toggleFavoritePlato,
    }),
    [
      hydrated, loadError, reload, platosUsando,
      alimentos, platos, addAlimento, updateAlimento, deleteAlimento, addPlato, updatePlato, deletePlato, toggleFavoriteAlimento, toggleFavoritePlato,
    ],
  );

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export function usePantry() {
  const ctx = useContext(PantryContext);
  if (!ctx) throw new Error("usePantry must be used within PantryProvider");
  return ctx;
}
