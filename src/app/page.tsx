import Link from "next/link";
import Image from "next/image";
import {
  Barcode,
  Check,
  Dumbbell,
  Flame,
  Footprints,
  Plus,
} from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { InstallPwaButton } from "@/components/install-pwa-button";

const FEATURES = [
  {
    variant: "lilac" as const,
    icon: Dumbbell,
    title: "Entrenamientos",
    text: "Crea rutinas, ordena tu semana y registra series, peso y repeticiones sobre una biblioteca de ejercicios con imagenes.",
  },
  {
    variant: "blue" as const,
    icon: Barcode,
    title: "Escaner de alimentos",
    text: "Escanea el codigo de barras y obten al instante calorias y macros. Guardalo en tu despensa y planifica la semana.",
  },
  {
    variant: "mint" as const,
    icon: Flame,
    title: "Nutricion y macros",
    text: "Suma el valor nutricional de cada comida y sigue tus objetivos diarios de calorias y proteina.",
  },
  {
    variant: "neutral" as const,
    icon: Footprints,
    title: "Cardio con GPS",
    text: "Registra tus rutas con distancia, tiempo y ritmo, y revisa cada actividad sobre el mapa.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Crea tu cuenta",
    text: "Registrate en segundos y cuentanos tus datos basicos para ajustar tus objetivos.",
  },
  {
    n: "02",
    title: "Entrena y registra",
    text: "Monta tu rutina, apunta cada serie y anota tus comidas escaneando el codigo de barras.",
  },
  {
    n: "03",
    title: "Sigue tu progreso",
    text: "Revisa tu volumen, tus macros y tus rutas. La app instalada te acompana cada dia.",
  },
];

const FAQ = [
  {
    q: "¿Necesito conexion para usarla?",
    a: "Rogue funciona como app instalable (PWA). Puedes consultar tus rutinas y tu historial sin conexion; los cambios se sincronizan cuando vuelves a tener red.",
  },
  {
    q: "¿De donde salen los datos nutricionales?",
    a: "Al escanear el codigo de barras buscamos el producto en Open Food Facts y traemos sus calorias y macros para que solo tengas que confirmar la cantidad.",
  },
  {
    q: "¿Como registro una ruta de cardio?",
    a: "Inicia una actividad y la app registra tu recorrido con GPS: distancia, tiempo y ritmo, con el mapa de cada sesion guardado.",
  },
  {
    q: "¿Es gratis?",
    a: "Puedes crear tu cuenta y empezar a entrenar y registrar comidas gratis.",
  },
];

/** Las maquetas invierten sus superficies segun el color de la banda en la que
 *  se pintan, para que siempre contrasten (tarjeta vs. filas internas). */
function panelTones(onSurface: boolean) {
  return {
    card: onSurface ? "bg-background" : "bg-surface",
    row: onSurface ? "bg-surface" : "bg-background",
  };
}

function MacrosPanel({ onSurface = false }: { onSurface?: boolean }) {
  const t = panelTones(onSurface);
  return (
    <div className={`w-full max-w-xs rounded-3xl border border-border p-5 ${t.card}`}>
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-xs tracking-wider text-muted-foreground">
          HOY · COMIDAS
        </span>
        <Barcode className="size-4" />
      </div>
      <div className="flex items-center gap-4">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r="34" fill="none" stroke="var(--muted)" strokeWidth="8" />
          <circle
            cx="42"
            cy="42"
            r="34"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="213.6"
            strokeDashoffset="66"
            transform="rotate(-90 42 42)"
          />
          <text x="42" y="40" textAnchor="middle" className="fill-foreground font-mono" fontSize="16" fontWeight="500">
            1680
          </text>
          <text x="42" y="53" textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="9">
            kcal
          </text>
        </svg>
        <div className="flex-1 space-y-2.5">
          {[
            { l: "Proteina", v: "120g", w: "78%" },
            { l: "Carbos", v: "160g", w: "60%" },
            { l: "Grasas", v: "48g", w: "44%" },
          ].map((m) => (
            <div key={m.l}>
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{m.l}</span>
                <span>{m.v}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: m.w }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={`mt-4 flex items-center gap-3 rounded-2xl p-3 ${t.row}`}>
        <span className="flex size-9 items-center justify-center rounded-xl bg-muted">
          <Barcode className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">Yogur skyr natural</p>
          <p className="text-[11px] text-muted-foreground">escaneado · 96 kcal · 17g prot</p>
        </div>
        <Plus className="size-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function WorkoutPanel({ onSurface = false }: { onSurface?: boolean }) {
  const t = panelTones(onSurface);
  const rows = [
    { name: "Press banca", sets: "4 × 8", done: true },
    { name: "Press inclinado mancuerna", sets: "3 × 10", done: true },
    { name: "Aperturas en polea", sets: "3 × 12", done: false },
    { name: "Fondos en paralelas", sets: "3 × máx", done: false },
  ];
  return (
    <div className={`w-full max-w-xs rounded-3xl border border-border p-5 ${t.card}`}>
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-xs tracking-wider text-muted-foreground">
          HOY · EMPUJE
        </span>
        <Dumbbell className="size-4" />
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.name} className={`flex items-center gap-3 rounded-2xl p-3 ${t.row}`}>
            <span
              className={
                r.done
                  ? "flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground"
                  : "flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground"
              }
            >
              {r.done ? <Check className="size-4" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{r.sets}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardioPanel({ onSurface = false }: { onSurface?: boolean }) {
  const t = panelTones(onSurface);
  return (
    <div className={`w-full max-w-xs rounded-3xl border border-border p-5 ${t.card}`}>
      <span className="font-mono text-xs tracking-wider text-muted-foreground">
        CARDIO · CARRERA
      </span>
      <div className={`mt-3 h-40 overflow-hidden rounded-2xl ${t.row}`}>
        <svg width="100%" height="100%" viewBox="0 0 240 160" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M24 132 C 60 70, 84 150, 120 92 S 190 44, 216 78"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="24" cy="132" r="6" fill="var(--accent)" />
          <circle cx="216" cy="78" r="6" fill="var(--surface)" stroke="var(--accent)" strokeWidth="3" />
        </svg>
      </div>
      <div className="mt-4 flex justify-between">
        {[
          { l: "DIST", v: "5,2" },
          { l: "TIEMPO", v: "27:14" },
          { l: "RITMO", v: "5:14" },
        ].map((s) => (
          <div key={s.l}>
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground">{s.l}</p>
            <p className="font-mono text-lg font-medium">{s.v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEEP_DIVES = [
  {
    eyebrow: "Entreno",
    variant: "lilac" as const,
    title: "Tu rutina y tu biblioteca de ejercicios",
    text: "Organiza tu semana por dias, arrastra para reordenar y registra cada serie con su peso y repeticiones. Cada ejercicio incluye imagenes del movimiento y su grupo muscular.",
    Panel: WorkoutPanel,
  },
  {
    eyebrow: "Comidas",
    variant: "blue" as const,
    title: "Escanea, suma macros y no te compliques",
    text: "Apunta lo que comes escaneando el codigo de barras: calorias y macros al instante. Guarda tus alimentos y platos en la despensa y planifica la semana con objetivos diarios.",
    Panel: MacrosPanel,
  },
  {
    eyebrow: "Cardio",
    variant: "mint" as const,
    title: "Registra cada ruta con GPS",
    text: "Sal a correr o a andar y deja que la app registre tu recorrido: distancia, tiempo y ritmo, con el mapa de cada actividad guardado en tu historial.",
    Panel: CardioPanel,
  },
];

const EYEBROW_PILL: Record<string, string> = {
  lilac: "bg-card-lilac text-card-lilac-foreground",
  blue: "bg-card-blue text-card-blue-foreground",
  mint: "bg-card-mint text-card-mint-foreground",
};

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-5 md:px-8">{children}</div>;
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Container>
        <header className="flex items-center justify-between py-5">
          <span className="flex items-center gap-2">
            <Image src="/brand/logo-mark-black.png" alt="" width={26} height={26} className="dark:hidden" />
            <Image src="/brand/logo-mark-white.png" alt="" width={26} height={26} className="hidden dark:block" />
            <span className="font-mono text-sm font-medium tracking-[0.2em]">ROGUE</span>
          </span>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              Iniciar sesion
            </Link>
            <Link href="/login" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]">
              Crear cuenta
            </Link>
          </nav>
        </header>
      </Container>

      <Container>
        <section className="py-14 text-center md:py-24">
          <p className="mb-4 font-mono text-xs tracking-[0.18em] text-muted-foreground">
            ENTRENA · COME · REGISTRA
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Tu gimnasio y tu cocina, en el bolsillo.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Controla tus rutinas y tu biblioteca de ejercicios, escanea alimentos
            por codigo de barras con sus macros y registra tus rutas de cardio.
            Todo en una app que instalas en el movil.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className="w-full rounded-full bg-accent px-7 py-3.5 text-center text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] sm:w-auto">
              Empezar gratis
            </Link>
            <Link href="/login" className="w-full rounded-full border border-border bg-surface px-7 py-3.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-auto">
              Ya tengo cuenta
            </Link>
          </div>
        </section>
      </Container>

      <Container>
        <section className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2">
          {FEATURES.map(({ variant, icon: Icon, title, text }) => (
            <PastelCard
              key={title}
              variant={variant}
              className="flex items-start gap-4 p-5"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface/60 text-current">
                <Icon className="size-5" strokeWidth={1.9} />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed opacity-80">{text}</p>
              </div>
            </PastelCard>
          ))}
        </section>
      </Container>

      {DEEP_DIVES.map((d, i) => {
        const onSurface = i % 2 === 1;
        return (
          <section key={d.eyebrow} className={onSurface ? "bg-surface" : "bg-background"}>
            <Container>
              <div className="flex flex-col items-center gap-8 py-14 md:flex-row md:gap-14 md:py-20">
                <div className={`flex-1 text-left ${i % 2 === 1 ? "md:order-2" : ""}`}>
                  <span className={`inline-block rounded-full px-3 py-1 font-mono text-[11px] tracking-wider ${EYEBROW_PILL[d.variant]}`}>
                    {d.eyebrow}
                  </span>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
                    {d.title}
                  </h2>
                  <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
                    {d.text}
                  </p>
                </div>
                <div
                  className={`flex w-full flex-1 justify-center ${
                    i % 2 === 1
                      ? "md:order-1 md:justify-start"
                      : "md:justify-end"
                  }`}
                >
                  <d.Panel onSurface={onSurface} />
                </div>
              </div>
            </Container>
          </section>
        );
      })}

      <Container>
        <section className="py-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Empieza en tres pasos
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-3xl border border-border bg-surface p-6">
                <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>
      </Container>

      <section className="bg-surface">
        <Container>
          <div className="py-16">
            <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
              Preguntas frecuentes
            </h2>
            <div className="mx-auto mt-8 max-w-2xl divide-y divide-border overflow-hidden rounded-3xl border border-border bg-background">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                    {f.q}
                    <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <section className="my-14 rounded-3xl border border-border bg-surface px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Instala Rogue y empieza hoy
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Crea tu cuenta gratis y llevalo todo contigo: entrenos, comida y cardio
            en una sola app.
          </p>
          <div className="mx-auto mt-7 flex max-w-xs flex-col gap-3">
            <Link href="/login" className="rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]">
              Empezar gratis
            </Link>
            <InstallPwaButton />
          </div>
        </section>
      </Container>

      <Container>
        <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
          Rogue · Entrena con rango
        </footer>
      </Container>
    </div>
  );
}
