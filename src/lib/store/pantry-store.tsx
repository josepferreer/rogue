"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { syncWrite } from "@/lib/supabase/sync";

export type HealthScore = "green" | "yellow" | "orange" | "red";

export type Alimento = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  isFavorite: boolean;
  healthScore?: HealthScore;
  /** Nombres de ingredientes de un producto listo escaneado (informativo).
   *  Vacio/undefined para alimentos simples y creados a mano. */
  ingredients?: string[];
};

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
  /** Nombres de ingredientes de un producto listo (informativo). */
  ingredients?: string[];
};

/** Un plato "listo" (producto preparado escaneado) no tiene ingredientes
 *  enlazados a la despensa: guarda sus propias macros por 100 g y se registra
 *  por gramos como un alimento. Los platos manuales siempre tienen >=1 food. */
export function isReadyPlato(p: Plato): boolean {
  return p.foods.length === 0;
}

type PantryContextType = {
  alimentos: Alimento[];
  platos: Plato[];
  addAlimento: (a: Omit<Alimento, "id" | "isFavorite">) => void;
  updateAlimento: (id: string, data: Partial<Alimento>) => void;
  deleteAlimento: (id: string) => void;
  addPlato: (p: Omit<Plato, "id" | "isFavorite">) => void;
  updatePlato: (id: string, data: Partial<Plato>) => void;
  deletePlato: (id: string) => void;
  toggleFavoriteAlimento: (id: string) => void;
  toggleFavoritePlato: (id: string) => void;
};

// Despensa de partida para usuarios nuevos (se siembra en Supabase la primera
// vez) y para el modo sin sesion. Los ids demo se remapean a uuids al sembrar.
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
  ingredients: string[] | null;
  is_favorite: boolean;
  health_score: HealthScore | null;
};

type DishRow = {
  id: string;
  name: string;
  kcal: number;
  foods: PlatoFood[];
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
    ingredients: r.ingredients && r.ingredients.length > 0 ? r.ingredients : undefined,
  };
}

function rowToPlato(r: DishRow): Plato {
  return {
    id: r.id,
    name: r.name,
    kcal: Number(r.kcal),
    foods: r.foods ?? [],
    isFavorite: r.is_favorite,
    healthScore: r.health_score ?? undefined,
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
    foods: p.foods,
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
        .select("id, name, kcal, protein, carbs, fat, ingredients, is_favorite, health_score")
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
        .select("id, name, kcal, foods, is_favorite, health_score")
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
  const [alimentos, setAlimentos] = useState<Alimento[]>(DEMO_ALIMENTOS);
  const [platos, setPlatos] = useState<Plato[]>(DEMO_PLATOS);
  const userIdRef = useRef<string | null>(null);

  // Hidrata la despensa del usuario desde Supabase. Si esta vacia (primera
  // vez), se siembra la demo para que tenga una base editable que persiste.
  // Sin sesion (o si la lectura falla) se queda la demo en memoria.
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user) return;

      let pantry: { alimentos: Alimento[]; platos: Plato[] };
      try {
        pantry = await fetchPantry(supabase, user.id);
      } catch (err) {
        console.error("No se pudo cargar la despensa:", err);
        return;
      }
      if (!active) return;

      if (pantry.alimentos.length === 0 && pantry.platos.length === 0) {
        pantry = buildSeedPantry();
        const userId = user.id;
        syncWrite("la despensa", async () => {
          const { error: foodsError } = await supabase
            .from("pantry_foods")
            .upsert(pantry.alimentos.map((a) => alimentoToRow(userId, a)));
          if (foodsError) throw foodsError;
          const { error: dishesError } = await supabase
            .from("pantry_dishes")
            .upsert(pantry.platos.map((p) => platoToRow(userId, p)));
          if (dishesError) throw dishesError;
        });
      }

      userIdRef.current = user.id;
      setAlimentos(pantry.alimentos);
      setPlatos(pantry.platos);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const persistAlimento = useCallback(
    (a: Alimento) => {
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el alimento", async () => {
        const { error } = await supabase.from("pantry_foods").upsert(alimentoToRow(userId, a));
        if (error) throw error;
      });
    },
    [supabase],
  );

  const persistPlato = useCallback(
    (p: Plato) => {
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el plato", async () => {
        const { error } = await supabase.from("pantry_dishes").upsert(platoToRow(userId, p));
        if (error) throw error;
      });
    },
    [supabase],
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
      setAlimentos((prev) => prev.map((a) => (a.id === id ? next : a)));
      persistAlimento(next);
    },
    [alimentos, persistAlimento],
  );

  const deleteAlimento = useCallback(
    (id: string) => {
      setAlimentos((prev) => prev.filter((a) => a.id !== id));
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el alimento", async () => {
        const { error } = await supabase.from("pantry_foods").delete().eq("id", id);
        if (error) throw error;
      });
    },
    [supabase],
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
      syncWrite("el plato", async () => {
        const { error } = await supabase.from("pantry_dishes").delete().eq("id", id);
        if (error) throw error;
      });
    },
    [supabase],
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

  return (
    <PantryContext.Provider
      value={{
        alimentos, platos, addAlimento, updateAlimento, deleteAlimento, addPlato, updatePlato, deletePlato, toggleFavoriteAlimento, toggleFavoritePlato,
      }}
    >
      {children}
    </PantryContext.Provider>
  );
}

export function usePantry() {
  const ctx = useContext(PantryContext);
  if (!ctx) throw new Error("usePantry must be used within PantryProvider");
  return ctx;
}
