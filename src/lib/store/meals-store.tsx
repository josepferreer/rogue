"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

export type MealType = "desayuno" | "comida" | "cena" | "snack";

export const MEAL_TYPES: { type: MealType; label: string }[] = [
  { type: "desayuno", label: "Desayuno" },
  { type: "comida", label: "Comida" },
  { type: "cena", label: "Cena" },
  { type: "snack", label: "Snacks" },
];

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

export type NewMealEntry = Omit<MealEntry, "id">;

type MealsContextValue = {
  hydrated: boolean;
  entries: MealEntry[];
  goals: NutritionGoals;
  entriesForDay: (date: string) => MealEntry[];
  addEntry: (input: NewMealEntry) => void;
  updateEntryQuantity: (id: string, quantityG: number) => void;
  removeEntry: (id: string) => void;
  setGoals: (goals: NutritionGoals) => void;
};

const MealsContext = createContext<MealsContextValue | null>(null);

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
};

function rowToEntry(r: MealRow): MealEntry {
  const num = (v: number | null) => (v === null ? null : Number(v));
  return {
    id: r.id,
    date: r.date,
    mealType: r.meal_type,
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    quantityG: Number(r.quantity_g),
    kcal100: num(r.kcal_100),
    protein100: num(r.protein_100),
    fat100: num(r.fat_100),
    carbs100: num(r.carbs_100),
  };
}

async function fetchEntries(
  supabase: SupabaseClient,
  userId: string,
): Promise<MealEntry[]> {
  const { data } = await supabase
    .from("meal_entries")
    .select(
      "id, date, meal_type, name, brand, barcode, quantity_g, kcal_100, protein_100, fat_100, carbs_100",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => rowToEntry(r as MealRow));
}

async function fetchGoals(
  supabase: SupabaseClient,
  userId: string,
): Promise<NutritionGoals> {
  const { data } = await supabase
    .from("nutrition_goals")
    .select("kcal_target, protein_target, fat_target, carbs_target")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_GOALS;
  return {
    kcal: data.kcal_target,
    protein: data.protein_target,
    fat: data.fat_target,
    carbs: data.carbs_target,
  };
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
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [goals, setGoalsState] = useState<NutritionGoals>(DEFAULT_GOALS);
  const userIdRef = useRef<string | null>(null);

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
      const [loadedEntries, loadedGoals] = await Promise.all([
        fetchEntries(supabase, user.id),
        fetchGoals(supabase, user.id),
      ]);
      if (!active) return;
      userIdRef.current = user.id;
      setEntries(loadedEntries);
      setGoalsState(loadedGoals);
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, [pathname, supabase]);

  const entriesForDay = useCallback(
    (date: string) => entries.filter((e) => e.date === date),
    [entries],
  );

  const addEntry = useCallback(
    (input: NewMealEntry) => {
      const entry: MealEntry = { ...input, id: newId() };
      setEntries((prev) => [...prev, entry]);

      const userId = userIdRef.current;
      if (userId) {
        supabase
          .from("meal_entries")
          .insert({
            id: entry.id,
            user_id: userId,
            date: entry.date,
            meal_type: entry.mealType,
            name: entry.name,
            brand: entry.brand,
            barcode: entry.barcode,
            quantity_g: entry.quantityG,
            kcal_100: entry.kcal100,
            protein_100: entry.protein100,
            fat_100: entry.fat100,
            carbs_100: entry.carbs100,
          })
          .then(() => {});
      }
    },
    [supabase],
  );

  const updateEntryQuantity = useCallback(
    (id: string, quantityG: number) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, quantityG } : e)),
      );
      const userId = userIdRef.current;
      if (userId) {
        supabase
          .from("meal_entries")
          .update({ quantity_g: quantityG })
          .eq("id", id)
          .then(() => {});
      }
    },
    [supabase],
  );

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      const userId = userIdRef.current;
      if (userId) {
        supabase.from("meal_entries").delete().eq("id", id).then(() => {});
      }
    },
    [supabase],
  );

  const setGoals = useCallback(
    (next: NutritionGoals) => {
      setGoalsState(next);
      const userId = userIdRef.current;
      if (userId) {
        supabase
          .from("nutrition_goals")
          .upsert({
            user_id: userId,
            kcal_target: Math.round(next.kcal),
            protein_target: Math.round(next.protein),
            fat_target: Math.round(next.fat),
            carbs_target: Math.round(next.carbs),
            updated_at: new Date().toISOString(),
          })
          .then(() => {});
      }
    },
    [supabase],
  );

  const value: MealsContextValue = {
    hydrated,
    entries,
    goals,
    entriesForDay,
    addEntry,
    updateEntryQuantity,
    removeEntry,
    setGoals,
  };

  return <MealsContext.Provider value={value}>{children}</MealsContext.Provider>;
}

export function useMeals(): MealsContextValue {
  const ctx = useContext(MealsContext);
  if (!ctx) throw new Error("useMeals debe usarse dentro de MealsProvider");
  return ctx;
}
