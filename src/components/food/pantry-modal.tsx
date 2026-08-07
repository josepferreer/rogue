"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Heart, Pencil, Trash2, Plus, Check, Barcode } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { Button } from "@/components/ui/button";
import { usePantry, platoMacros, Alimento, Plato, PlatoFood, isReadyPlato } from "@/lib/store/pantry-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BarcodeScanner } from "@/components/food/barcode-scanner";
import { useToast } from "@/components/ui/toast";
import { lookupBarcode, lookupErrorMessage } from "@/lib/food/lookup";
import { HEALTH_LABEL, type HealthScore } from "@/lib/food/health-score";

type Props = {
  open: boolean;
  onClose: () => void;
};

// --- Formulario de Alimento ---
function AlimentoForm({ 
  initialData, 
  onSave, 
  onCancel 
}: { 
  initialData?: Alimento, 
  onSave: (a: Omit<Alimento, "id" | "isFavorite">) => void,
  onCancel: () => void 
}) {
  const [name, setName] = useState(initialData?.name || "");
  const [kcal, setKcal] = useState(initialData?.kcal.toString() || "");
  const [protein, setProtein] = useState(initialData?.protein.toString() || "");
  const [carbs, setCarbs] = useState(initialData?.carbs.toString() || "");
  const [fat, setFat] = useState(initialData?.fat.toString() || "");
  // El color ya no se deduce de las macros: o viene del Nutri-Score del
  // escaneo, o lo pone el usuario, o se queda en blanco.
  const [healthScore, setHealthScore] = useState<HealthScore | undefined>(initialData?.healthScore);
  const [scanning, setScanning] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const { notify } = useToast();

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      kcal: Number(kcal) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      healthScore
    });
  };

  // Via `/api/food/[barcode]`: el cliente nunca habla con Open Food Facts.
  const handleBarcodeDetect = async (barcode: string) => {
    setScanning(false);
    setLoadingCode(true);
    const result = await lookupBarcode(barcode);
    setLoadingCode(false);
    if (!result.ok) {
      notify(lookupErrorMessage(result.reason), "error");
      return;
    }
    const p = result.product;
    setName(p.name);
    if (p.kcal100 != null) setKcal(p.kcal100.toString());
    if (p.protein100 != null) setProtein(p.protein100.toString());
    if (p.carbs100 != null) setCarbs(p.carbs100.toString());
    if (p.fat100 != null) setFat(p.fat100.toString());
    if (p.healthScore) setHealthScore(p.healthScore);
    if (p.kcal100 == null) {
      notify("Open Food Facts no da las calorías de este producto: complétalas.", "info");
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-3 pt-3 border-t border-border">
      {scanning && (
        <BarcodeScanner onDetect={handleBarcodeDetect} onClose={() => setScanning(false)} />
      )}
      {/* Un solo campo de nombre: antes habia dos inputs identicos atados al
          mismo estado, uno con el boton de escaner y otro con su label. */}
      <label className="flex flex-col">
        <span className="text-sm font-medium">Nombre</span>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre del alimento"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
            disabled={loadingCode}
            autoFocus
          />
          {!initialData && (
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-surface px-3 text-muted-foreground hover:text-foreground transition-colors"
              title="Escanear código de barras"
              disabled={loadingCode}
            >
              <Barcode className={cn("size-5", loadingCode && "animate-pulse")} />
            </button>
          )}
        </div>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col">
          <span className="text-sm font-medium">Calorías / 100g</span>
          <input type="number" value={kcal} onChange={e => setKcal(e.target.value)} className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none" />
        </label>
        <label className="flex flex-col">
          <span className="text-sm font-medium">Proteína (g)</span>
          <input type="number" value={protein} onChange={e => setProtein(e.target.value)} className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none" />
        </label>
        <label className="flex flex-col">
          <span className="text-sm font-medium">Carbohidratos (g)</span>
          <input type="number" value={carbs} onChange={e => setCarbs(e.target.value)} className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none" />
        </label>
        <label className="flex flex-col">
          <span className="text-sm font-medium">Grasas (g)</span>
          <input type="number" value={fat} onChange={e => setFat(e.target.value)} className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none" />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">
          Nutri-Score (lo rellena el escáner; a mano es opcional)
        </span>
        <div className="flex items-center gap-2">
          {(["green", "yellow", "orange", "red"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={HEALTH_LABEL[c]}
              title={HEALTH_LABEL[c]}
              aria-pressed={healthScore === c}
              onClick={() => setHealthScore(c)}
              className={cn(
                "size-8 rounded-full",
                { green: "bg-green-500", yellow: "bg-yellow-400", orange: "bg-orange-500", red: "bg-red-500" }[c],
                healthScore === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : "opacity-30",
              )}
            />
          ))}
          {healthScore && (
            <button type="button" onClick={() => setHealthScore(undefined)} className="ml-2 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
              Quitar
            </button>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={loadingCode}>Cancelar</Button>
        <Button onClick={handleSave} disabled={loadingCode}>Guardar</Button>
      </div>
    </div>
  );
}

// --- Formulario de Plato ---
function PlatoForm({
  initialData,
  onSave,
  onCancel,
  alimentos
}: {
  initialData?: Plato,
  onSave: (p: Omit<Plato, "id" | "isFavorite">) => void,
  onCancel: () => void,
  alimentos: Alimento[]
}) {
  const { addAlimento } = usePantry();
  const [name, setName] = useState(initialData?.name || "");
  const [selectedFoods, setSelectedFoods] = useState<PlatoFood[]>(initialData?.foods || []);
  const [searchIng, setSearchIng] = useState("");
  const [isCreatingFood, setIsCreatingFood] = useState(false);
  const [healthScore, setHealthScore] = useState<HealthScore | undefined>(initialData?.healthScore);

  const availableFoods = useMemo(() => {
    return alimentos.filter(a => a.name.toLowerCase().includes(searchIng.toLowerCase()));
  }, [alimentos, searchIng]);

  // Solo las kcal: el resto de macros de un plato manual se recalculan siempre
  // desde sus ingredientes (platoMacros), no se guardan aparte.
  const totalKcal = useMemo(
    () =>
      selectedFoods.reduce((acc, f) => {
        const a = alimentos.find(x => x.id === f.alimentoId);
        return acc + (a?.kcal ?? 0) * (f.quantityG / 100);
      }, 0),
    [selectedFoods, alimentos],
  );

  const handleSave = () => {
    if (!name.trim() || selectedFoods.length === 0) return;
    onSave({
      name: name.trim(),
      kcal: Math.round(totalKcal),
      foods: selectedFoods,
      healthScore
    });
  };

  const toggleFood = (alimentoId: string) => {
    setSelectedFoods(prev => 
      prev.some(f => f.alimentoId === alimentoId) 
        ? prev.filter(f => f.alimentoId !== alimentoId) 
        : [...prev, { alimentoId, quantityG: 100 }]
    );
  };

  const updateQuantity = (alimentoId: string, quantityStr: string) => {
    const quantityG = Number(quantityStr) || 0;
    setSelectedFoods(prev => 
      prev.map(f => f.alimentoId === alimentoId ? { ...f, quantityG } : f)
    );
  };

  return (
    <div className="flex flex-col gap-3 mt-3 pt-3 border-t border-border">
      <input 
        type="text" 
        value={name} 
        onChange={e => setName(e.target.value)} 
        placeholder="Nombre del plato" 
        className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
      />
      
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
        <p className="text-xs font-medium">Ingredientes ({selectedFoods.length}) - {Math.round(totalKcal)} kcal totales</p>
        <div className="flex flex-col gap-2 mb-2">
          {selectedFoods.map(f => {
            const a = alimentos.find(x => x.id === f.alimentoId);
            return (
              <div key={f.alimentoId} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5">
                <span className="flex-1 text-xs font-medium">{a?.name || "Desconocido"}</span>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" 
                    value={f.quantityG || ""} 
                    onChange={e => updateQuantity(f.alimentoId, e.target.value)}
                    className="w-16 rounded-xl border border-border bg-background px-2 py-1.5 text-sm text-right outline-none"
                  />
                  <span className="text-[10px] text-muted-foreground mr-1">g</span>
                  <X className="size-3.5 cursor-pointer text-muted-foreground hover:text-red-500" onClick={() => toggleFood(f.alimentoId)} />
                </div>
              </div>
            );
          })}
        </div>
        
        {isCreatingFood ? (
          <div className="border border-border rounded-xl p-2 bg-surface">
            <p className="text-xs font-medium mb-2">Crear nuevo ingrediente</p>
            <AlimentoForm 
              onSave={(a) => {
                addAlimento(a);
                setIsCreatingFood(false);
                setSearchIng("");
              }}
              onCancel={() => setIsCreatingFood(false)}
            />
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <input 
                type="text"
                placeholder="Buscar alimento por nombre..."
                value={searchIng}
                onChange={e => setSearchIng(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-sm outline-none"
              />
            </div>
            <div className="max-h-32 overflow-y-auto flex flex-col gap-1 mt-1">
              {availableFoods.map(a => {
                const elegido = selectedFoods.some(f => f.alimentoId === a.id);
                return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleFood(a.id)}
                  aria-pressed={elegido}
                  className="flex w-full items-center justify-between p-2 rounded-lg hover:bg-muted text-xs text-left"
                >
                  <span>{a.name}</span>
                  {elegido && <Check className="size-3 text-primary" />}
                </button>
                );
              })}
              {searchIng && availableFoods.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <p>No se encontró el ingrediente.</p>
                  <button 
                    onClick={() => setIsCreatingFood(true)}
                    className="mt-2 rounded-full bg-accent px-3 py-1 font-medium text-accent-foreground"
                  >
                    Crearlo ahora
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-muted-foreground mr-1">Nutri-Score:</span>
        {(["green", "yellow", "orange", "red"] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={HEALTH_LABEL[c]}
            title={HEALTH_LABEL[c]}
            aria-pressed={healthScore === c}
            onClick={() => setHealthScore(c)}
            className={cn(
              "size-5 rounded-full",
              { green: "bg-green-500", yellow: "bg-yellow-400", orange: "bg-orange-500", red: "bg-red-500" }[c],
              healthScore === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : "opacity-30",
            )}
          />
        ))}
        {healthScore && <button type="button" onClick={() => setHealthScore(undefined)} className="ml-1 text-[10px] text-muted-foreground underline">Quitar</button>}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave}>Guardar Plato</Button>
      </div>
    </div>
  );
}


// --- Modal Principal ---
export function PantryModal({ open, onClose }: Props) {
  const {
    alimentos, platos, hydrated, loadError, reload, platosUsando,
    addAlimento, updateAlimento, deleteAlimento, toggleFavoriteAlimento,
    addPlato, updatePlato, deletePlato, toggleFavoritePlato
  } = usePantry();

  const [tab, setTab] = useState<"alimentos" | "platos">("alimentos");
  const [query, setQuery] = useState("");

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Borrar un alimento arrastra los platos que lo usan: hay que decirlo antes.
  const [borrando, setBorrando] = useState<Alimento | null>(null);

  const afectados = borrando ? platosUsando(borrando.id) : [];
  const seVacian = afectados.filter((p) => p.foods.length === 1).length;

  const pedirBorrado = (alimento: Alimento) => {
    if (platosUsando(alimento.id).length === 0) {
      deleteAlimento(alimento.id);
      return;
    }
    setBorrando(alimento);
  };

  const portalTarget = useAppShellPortal();
  useEscapeToClose(open, onClose);

  // Sort: favorites first, then by name
  const filteredAlimentos = useMemo(() => {
    return alimentos
      .filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return a.name.localeCompare(b.name);
        return a.isFavorite ? -1 : 1;
      });
  }, [alimentos, query]);

  const filteredPlatos = useMemo(() => {
    return platos
      .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return a.name.localeCompare(b.name);
        return a.isFavorite ? -1 : 1;
      });
  }, [platos, query]);

  if (!open) return null;

  const content = (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div className="w-full md:max-w-lg">
        <div
          className="flex max-h-[90dvh] flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:max-h-[80dvh] md:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <p className="font-semibold">Despensa</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal"
              className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 px-5 pb-3">
            <div className="flex w-full rounded-2xl bg-surface p-1">
              <button
                className={cn(
                  "flex-1 rounded-xl py-2 text-sm font-medium transition-colors",
                  tab === "alimentos" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => { setTab("alimentos"); setCreating(false); setEditingId(null); }}
              >
                Alimentos
              </button>
              <button
                className={cn(
                  "flex-1 rounded-xl py-2 text-sm font-medium transition-colors",
                  tab === "platos" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => { setTab("platos"); setCreating(false); setEditingId(null); }}
              >
                Platos
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tab === "alimentos" ? "Buscar alimento..." : "Buscar plato..."}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
              <button 
                onClick={() => { setCreating(true); setEditingId(null); }}
                className="flex size-11 items-center justify-center shrink-0 rounded-2xl bg-foreground text-background"
              >
                <Plus className="size-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-2.5">

              {/* La despensa que se ve tiene que ser la del usuario o ninguna:
                  nunca datos de ejemplo haciendose pasar por los suyos. */}
              {loadError && (
                <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">No se pudo cargar tu despensa</p>
                    <p className="text-xs text-muted-foreground">
                      Lo que guardes ahora podría no conservarse.
                    </p>
                  </div>
                  <Button onClick={reload}>Reintentar</Button>
                </div>
              )}
              {!hydrated && !loadError && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Cargando tu despensa…
                </p>
              )}
              {hydrated && !loadError && !creating && alimentos.length === 0 && platos.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Tu despensa está vacía. Usa el botón + para añadir tu primer alimento.
                </p>
              )}

              {/* Formulario de creación al principio de la lista */}
              {creating && tab === "alimentos" && (
                <div className="rounded-3xl border border-border bg-surface p-4">
                  <p className="font-semibold text-sm">Nuevo Alimento</p>
                  <AlimentoForm 
                    onSave={(a) => { addAlimento(a); setCreating(false); }}
                    onCancel={() => setCreating(false)}
                  />
                </div>
              )}
              {creating && tab === "platos" && (
                <div className="rounded-3xl border border-border bg-surface p-4">
                  <p className="font-semibold text-sm">Nuevo Plato</p>
                  <PlatoForm 
                    alimentos={alimentos}
                    onSave={(p) => { addPlato(p); setCreating(false); }}
                    onCancel={() => setCreating(false)}
                  />
                </div>
              )}

              {/* Listas */}
              {tab === "alimentos" && filteredAlimentos.map((alimento) => (
                <div key={alimento.id} className="rounded-3xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold flex items-center gap-2">
                        {alimento.name}
                        {alimento.healthScore === "green" && <span className="size-2.5 rounded-full bg-green-500" title="Muy sano" />}
                        {alimento.healthScore === "yellow" && <span className="size-2.5 rounded-full bg-yellow-400" title="Moderado" />}
                        {alimento.healthScore === "orange" && <span className="size-2.5 rounded-full bg-orange-500" title="Poco sano" />}
                        {alimento.healthScore === "red" && <span className="size-2.5 rounded-full bg-red-500" title="Ultraprocesado" />}
                      </p>
                      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                        <span>{alimento.kcal} kcal (100g)</span>
                        <span>P: {alimento.protein}g</span>
                        <span>C: {alimento.carbs}g</span>
                        <span>G: {alimento.fat}g</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => toggleFavoriteAlimento(alimento.id)} className="flex size-10 items-center justify-center text-muted-foreground hover:text-red-500 transition-colors">
                        <Heart className={cn("size-4", alimento.isFavorite && "fill-red-500 text-red-500")} />
                      </button>
                      <button type="button" onClick={() => setEditingId(editingId === alimento.id ? null : alimento.id)} className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground">
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" onClick={() => pedirBorrado(alimento)} className="flex size-10 items-center justify-center text-muted-foreground hover:text-red-500">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  {/* Ingredientes a ancho completo (fuera de la fila de botones). */}
                  {alimento.ingredients && alimento.ingredients.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {alimento.ingredients.map((ing, i) => (
                        <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {ing.grams != null && <span className="text-foreground">{ing.grams}g </span>}
                          {ing.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {editingId === alimento.id && (
                    <AlimentoForm 
                      initialData={alimento}
                      onSave={(data) => { updateAlimento(alimento.id, data); setEditingId(null); }}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </div>
              ))}
              
              {tab === "platos" && filteredPlatos.map((plato) => {
                const ready = isReadyPlato(plato);
                // Calculadas contra la despensa actual, no la copia guardada.
                const macros = platoMacros(plato, alimentos);
                return (
                <div key={plato.id} className="rounded-3xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold flex items-center gap-2">
                        {plato.name}
                        {plato.healthScore === "green" && <span className="size-2.5 rounded-full bg-green-500" title="Muy sano" />}
                        {plato.healthScore === "yellow" && <span className="size-2.5 rounded-full bg-yellow-400" title="Moderado" />}
                        {plato.healthScore === "orange" && <span className="size-2.5 rounded-full bg-orange-500" title="Poco sano" />}
                        {plato.healthScore === "red" && <span className="size-2.5 rounded-full bg-red-500" title="Ultraprocesado" />}
                        {ready && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold text-accent-foreground">Listo</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ready
                          ? `${Math.round(macros.kcal)} kcal (100g)`
                          : `${Math.round(macros.kcal)} kcal totales · ${macros.weightG}g`}
                        {macros.missing > 0 && (
                          <span className="text-red-500">
                            {" "}· {macros.missing} ingrediente{macros.missing > 1 ? "s" : ""} sin despensa
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => toggleFavoritePlato(plato.id)} className="flex size-10 items-center justify-center text-muted-foreground hover:text-red-500 transition-colors">
                        <Heart className={cn("size-4", plato.isFavorite && "fill-red-500 text-red-500")} />
                      </button>
                      {/* Los platos "listos" no se editan por ingredientes (no los
                          tienen enlazados); se borran y se reescanean si hace falta. */}
                      {!ready && (
                        <button type="button" onClick={() => setEditingId(editingId === plato.id ? null : plato.id)} className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground">
                          <Pencil className="size-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => deletePlato(plato.id)} className="flex size-10 items-center justify-center text-muted-foreground hover:text-red-500">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  {/* Ingredientes a ancho completo (fuera de la fila de botones). */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ready
                      ? (plato.ingredients ?? []).map((ing, i) => (
                          <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {ing.grams != null && <span className="text-foreground">{ing.grams}g </span>}
                            {ing.name}
                          </span>
                        ))
                      : plato.foods.map((food, i) => {
                          const a = alimentos.find(x => x.id === food.alimentoId);
                          return (
                            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                              {food.quantityG}g {a?.name || "Desconocido"}
                              {a?.healthScore === "green" && <span className="size-1.5 rounded-full bg-green-500" />}
                              {a?.healthScore === "yellow" && <span className="size-1.5 rounded-full bg-yellow-400" />}
                              {a?.healthScore === "orange" && <span className="size-1.5 rounded-full bg-orange-500" />}
                              {a?.healthScore === "red" && <span className="size-1.5 rounded-full bg-red-500" />}
                            </span>
                          );
                        })}
                  </div>
                  {!ready && editingId === plato.id && (
                    <PlatoForm
                      initialData={plato}
                      alimentos={alimentos}
                      onSave={(data) => { updatePlato(plato.id, data); setEditingId(null); }}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!portalTarget) return null;

  return (
    <>
      {createPortal(content, portalTarget)}
      <ConfirmDialog
        open={!!borrando}
        title={`¿Borrar "${borrando?.name}"?`}
        description={
          `Se usa en ${afectados.length} plato${afectados.length > 1 ? "s" : ""} y se quitará de ${afectados.length > 1 ? "ellos" : "él"}.` +
          (seVacian > 0
            ? ` ${seVacian} se ${seVacian > 1 ? "quedarían" : "quedaría"} sin ingredientes y se ${seVacian > 1 ? "borrarán" : "borrará"} también.`
            : "")
        }
        confirmLabel="Borrar"
        onConfirm={() => {
          if (borrando) deleteAlimento(borrando.id);
          setBorrando(null);
        }}
        onCancel={() => setBorrando(null)}
      />
    </>
  );
}
