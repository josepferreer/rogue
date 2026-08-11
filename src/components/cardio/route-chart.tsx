"use client";

import { useMemo } from "react";
import type { Coordinate } from "@/lib/store/cardio-store";

interface RouteChartProps {
  coordinates: Coordinate[];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Chart configuration
const STEPS = 60;
const CHART_WIDTH = 300;
const CHART_HEIGHT = 80;
const MIN_PACE = 3; // 3 min/km (very fast)
const MAX_PACE = 10; // 10 min/km (slow/walking)

export function RouteChart({ coordinates }: RouteChartProps) {
  const data = useMemo(() => {
    if (coordinates.length < 5) return null;

    // 1. Calculate cumulative distance
    let totalDist = 0;
    const withDist = coordinates.map((c, i) => {
      if (i > 0) {
        const prev = coordinates[i - 1];
        totalDist += haversineKm(prev.lat, prev.lng, c.lat, c.lng);
      }
      return { ...c, dist: totalDist };
    });

    if (totalDist === 0) return null;

    // 2. Bin into STEPS segments
    const stepDist = totalDist / STEPS;
    const bins: { pace: number; alt: number | null }[] = [];
    
    let currentBin = 0;
    let binStartTs = withDist[0].timestamp;
    let binStartDist = 0;
    let binAltSum = 0;
    let binAltCount = 0;

    for (let i = 1; i < withDist.length; i++) {
      const p = withDist[i];
      if (p.alt != null) {
        binAltSum += p.alt;
        binAltCount++;
      }

      if (p.dist >= (currentBin + 1) * stepDist || i === withDist.length - 1) {
        // Close bin
        const distDelta = p.dist - binStartDist;
        const timeDeltaMins = (p.timestamp - binStartTs) / 1000 / 60;
        let pace = distDelta > 0 ? timeDeltaMins / distDelta : MAX_PACE;
        
        // Clamp pace
        pace = Math.max(MIN_PACE, Math.min(MAX_PACE, pace));
        
        bins.push({
          pace,
          alt: binAltCount > 0 ? binAltSum / binAltCount : null,
        });

        // Reset for next bin
        currentBin++;
        binStartTs = p.timestamp;
        binStartDist = p.dist;
        binAltSum = 0;
        binAltCount = 0;
      }
    }

    return bins;
  }, [coordinates]);

  if (!data || data.length === 0) return null;

  // 3. Prepare SVG paths
  const hasAlt = data.some((d) => d.alt !== null);
  
  // Calculate pace path (inverted: faster (lower value) is higher up)
  const pacePoints = data.map((d, i) => {
    const x = (i / (data.length - 1)) * CHART_WIDTH;
    const y = ((d.pace - MIN_PACE) / (MAX_PACE - MIN_PACE)) * CHART_HEIGHT;
    return `${x},${y}`;
  });
  const pacePath = `M ${pacePoints.join(" L ")}`;

  // Calculate alt path
  let altPath = "";
  let altArea = "";
  if (hasAlt) {
    const validAlts = data.map((d) => d.alt).filter((a): a is number => a !== null);
    const minAlt = Math.min(...validAlts);
    const maxAlt = Math.max(...validAlts);
    const altRange = maxAlt - minAlt || 1;

    const altPoints = data.map((d, i) => {
      const x = (i / (data.length - 1)) * CHART_WIDTH;
      // Alt is normal: higher value is higher up (lower Y)
      const a = d.alt !== null ? d.alt : minAlt; 
      const y = CHART_HEIGHT - ((a - minAlt) / altRange) * CHART_HEIGHT;
      return `${x},${y}`;
    });
    
    altPath = `M ${altPoints.join(" L ")}`;
    altArea = `M 0,${CHART_HEIGHT} L ${altPoints.join(" L ")} L ${CHART_WIDTH},${CHART_HEIGHT} Z`;
  }

  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>RITMO Y DESNIVEL</span>
        {hasAlt ? <span>Altitud incluida</span> : <span>Sin datos de altitud</span>}
      </div>
      
      <div className="relative mt-2 h-[80px] w-full">
        <svg 
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} 
          className="h-full w-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Elevation Area */}
          {hasAlt && (
            <>
              <path d={altArea} className="fill-muted stroke-none" />
              <path d={altPath} className="fill-none stroke-muted-foreground stroke-[1.5] opacity-50" />
            </>
          )}
          
          {/* Pace Line */}
          <path d={pacePath} className="fill-none stroke-blue-500 stroke-2 [stroke-linejoin:round]" />
        </svg>

        {/* Labels for Pace (fastest at top, slowest at bottom) */}
        <div className="absolute inset-y-0 left-0 flex flex-col justify-between text-[9px] font-mono text-muted-foreground">
          <span>{MIN_PACE}'/km</span>
          <span>{MAX_PACE}'/km</span>
        </div>
      </div>
    </div>
  );
}
