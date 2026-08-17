"use client";

import { useRef, useState } from "react";
import { Droplet, Plus, RotateCcw } from "lucide-react";
import { useMeals } from "@/lib/store/meals-store";
import { useHydrated } from "@/lib/use-hydrated";

const CAPACITY_KEY = "rogue:bottle_capacity";
const GOAL_KEY = "rogue:water_goal";
const LEVEL_KEY = "rogue:bottle_level";

/** Lee un ajuste de localStorage. En servidor (y si el valor es basura)
 *  devuelve el de por defecto. */
function readSetting(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function WaterTracker({ date }: { date: string }) {
  const { waterForDay, updateWaterLog } = useMeals();
  const todayMl = waterForDay(date);

  // Configuracion guardada en localStorage. Se lee en el inicializador, no en
  // un efecto: el componente no se pinta hasta hidratar (ver isClient), así que
  // aquí ya hay `window` y nos ahorramos el render en cascada de leer después.
  // Sin setter: hoy no hay UI para cambiarlos, solo se leen al montar y
  // `saveState` los reescribe tal cual para no perderlos.
  const [capacity] = useState(() => readSetting(CAPACITY_KEY, 750));
  const [goal] = useState(() => readSetting(GOAL_KEY, 2500));
  // Sin nivel guardado se arranca con la botella llena.
  const [currentLevel, setCurrentLevel] = useState(() =>
    readSetting(LEVEL_KEY, readSetting(CAPACITY_KEY, 750)),
  );
  // La botella se dibuja con lo guardado en localStorage: en SSR no existe, así
  // que no se pinta hasta hidratar (si no, el HTML del servidor no cuadraría).
  const isClient = useHydrated();

  // Drag state
  const bottleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startLevelRef = useRef(0);

  const saveState = (newCap: number, newGoal: number, newLevel: number) => {
    localStorage.setItem(CAPACITY_KEY, String(newCap));
    localStorage.setItem(GOAL_KEY, String(newGoal));
    localStorage.setItem(LEVEL_KEY, String(newLevel));
  };

  const updateLevel = (newLevel: number) => {
    const clamped = Math.max(0, Math.min(newLevel, capacity));
    if (clamped < currentLevel) {
      // Hemos bebido
      const diff = currentLevel - clamped;
      updateWaterLog(date, todayMl + diff);
    }
    setCurrentLevel(clamped);
    saveState(capacity, goal, clamped);
  };

  const refill = () => {
    setCurrentLevel(capacity);
    saveState(capacity, goal, capacity);
  };
  
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startLevelRef.current = currentLevel;
    // Capturamos eventos del raton/dedo aunque salga del div
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !bottleRef.current) return;
    
    const dy = e.clientY - startYRef.current; // positivo = hacia abajo (menos agua)
    const bottleHeight = bottleRef.current.clientHeight;
    
    // Pixel a ml (dy / height = % de capacidad)
    const mlDiff = (dy / bottleHeight) * capacity;
    const newLevel = startLevelRef.current - mlDiff;
    
    // Solo permitimos beber arrastrando (bajar nivel), o un poco hacia arriba si te equivocas, 
    // pero no subir mas del startLevel para no complicar el log de agua al arrastrar.
    const clamped = Math.max(0, Math.min(Math.round(newLevel), capacity));
    setCurrentLevel(clamped);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    // Confirmamos el trago
    if (currentLevel < startLevelRef.current) {
      const diff = startLevelRef.current - currentLevel;
      updateWaterLog(date, todayMl + diff);
    }
    saveState(capacity, goal, currentLevel);
  };

  if (!isClient) return null;

  const pct = Math.min(100, Math.max(0, (currentLevel / capacity) * 100));
  const goalPct = Math.min(100, Math.max(0, (todayMl / goal) * 100));

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplet className="size-5 text-blue-500 fill-blue-500/20" />
          <h2 className="font-semibold tracking-tight">Hidratación</h2>
        </div>
        <span className="font-mono text-sm text-muted-foreground">
          {todayMl} / {goal} ml
        </span>
      </div>

      <div className="flex gap-6 items-center">
        {/* Botella Interactiva */}
        <div className="flex flex-col items-center gap-2">
          {/* Tapon */}
          <div className="h-3 w-8 rounded-t-md bg-muted-foreground/30" />
          {/* Cuerpo Botella */}
          <div 
            ref={bottleRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative h-32 w-16 cursor-ns-resize overflow-hidden rounded-b-2xl rounded-t-xl border-2 border-muted-foreground/20 bg-background touch-none"
          >
            {/* Agua */}
            <div 
              className="absolute bottom-0 w-full bg-blue-500/80 transition-[height] duration-75"
              style={{ height: `${pct}%` }}
            />
            {/* Brillo/Reflejo botella */}
            <div className="absolute inset-y-2 left-1 w-2 rounded-full bg-white/20" />
          </div>
          <button 
            onClick={refill}
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-foreground hover:text-background"
          >
            <RotateCcw className="size-3" />
            Rellenar
          </button>
        </div>

        {/* Resumen y atajos */}
        <div className="flex flex-1 flex-col justify-center gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
              <span>Progreso diario</span>
              <span>{Math.round(goalPct)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width]"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const trago = 250; // vaso estandar
                const newL = currentLevel - trago;
                updateLevel(newL);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background py-2 text-xs font-semibold transition-colors hover:bg-muted"
            >
              <Droplet className="size-3.5 text-blue-500" />
              -250ml
            </button>
            <button
              onClick={() => {
                const trago = 250;
                // Si agregamos directamente al log (un vaso extra que no estaba en la botella)
                updateWaterLog(date, todayMl + trago);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-500/10 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-500 hover:text-white"
            >
              <Plus className="size-3.5" />
              Vaso extra
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
