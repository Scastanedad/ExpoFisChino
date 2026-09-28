import { useEffect, useRef } from "react";
import type { SedimentEngine } from "../sim/engine";
import { useSimulationLoop, type SimulationView } from "../hooks/useSimulationLoop";
import { drawRiver } from "../render/drawRiver";

interface Props {
  engine: SedimentEngine;
  running: boolean;
  timeScale: number;
}

/**
 * Canvas 2D de la vista lateral del río. El bucle de simulación vive en `useSimulationLoop`
 * (src/hooks/useSimulationLoop.ts, propiedad de react-expert); este componente solo se ocupa
 * del tamaño/DPR del canvas y de invocar `drawRiver` (src/render/drawRiver.ts) en cada frame.
 * Las posiciones de las partículas nunca pasan por setState: `onFrame` lee `engine` directamente
 * y pinta, sin re-renderizar React por frame.
 */
export default function RiverCanvas({ engine, running, timeScale }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const viewRef = useRef<SimulationView>({ width: 800, height: 340, dpr: 1 });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = wrap.clientWidth;
      const cssH = Math.max(260, Math.round(cssW * 0.4));
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewRef.current = { width: cssW, height: cssH, dpr };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    return () => {
      ro.disconnect();
      ctxRef.current = null;
    };
  }, []);

  useSimulationLoop(engine, {
    running,
    timeScale,
    onFrame: () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      drawRiver(ctx, engine, viewRef.current);
    },
  });

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Vista lateral del río: partículas de sedimento de distintos tamaños transportadas por el agua y depositadas en el lecho."
      />
    </div>
  );
}
