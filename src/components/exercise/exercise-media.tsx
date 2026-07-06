"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Dumbbell, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type ExerciseMediaProps = {
  /** Los 2 frames del movimiento (inicio / fin). */
  images: [string, string];
  alt: string;
  className?: string;
  /** Milisegundos entre frames. */
  interval?: number;
};

/**
 * "Animacion" de ejecucion: alterna los dos frames del ejercicio con un
 * crossfade suave, estilo Liftoff. Lazy por defecto (next/image) y con
 * fallback a icono si las imagenes remotas fallan.
 */
export function ExerciseMedia({
  images,
  alt,
  className,
  interval = 1100,
}: ExerciseMediaProps) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!playing || failed) return;
    const timer = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), interval);
    return () => clearInterval(timer);
  }, [playing, failed, interval]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex aspect-[4/3] items-center justify-center rounded-3xl bg-muted",
          className,
        )}
      >
        <Dumbbell className="size-10 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-3xl bg-white",
        className,
      )}
    >
      {images.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt={index === 0 ? alt : ""}
          fill
          sizes="(max-width: 480px) 100vw, 440px"
          className={cn(
            "object-contain transition-opacity duration-300",
            frame === index ? "opacity-100" : "opacity-0",
          )}
          onError={() => setFailed(true)}
        />
      ))}
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pausar animacion" : "Reproducir animacion"}
        className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] tracking-wider text-white backdrop-blur-sm">
        {frame === 0 ? "INICIO" : "FIN"}
      </span>
    </div>
  );
}

type ExerciseThumbProps = {
  src: string;
  alt: string;
  className?: string;
};

/** Miniatura estatica (primer frame) para el listado, con lazy + fallback. */
export function ExerciseThumb({ src, alt, className }: ExerciseThumbProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn(
        "relative size-16 shrink-0 overflow-hidden rounded-2xl bg-white",
        failed && "flex items-center justify-center bg-muted",
        className,
      )}
    >
      {failed ? (
        <Dumbbell className="size-5 text-muted-foreground" />
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="64px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
