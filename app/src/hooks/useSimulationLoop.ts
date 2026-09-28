import { useEffect, useRef } from "react";
import type { SedimentEngine } from "../sim/engine";

/**
 * Info de layout del canvas que necesita `drawRiver` para posicionar el dibujo, además del
 * propio `ctx` (que quien lo llama ya deja transformado a coordenadas CSS con
 * devicePixelRatio vía `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`).
 */
export interface SimulationView {
  /** ancho CSS del canvas en px (no el tamaño del buffer, que puede ser mayor por dpr). */
  width: number;
  /** alto CSS del canvas en px. */
  height: number;
  /** devicePixelRatio aplicado al ctx (informativo: el ctx ya viene con ese transform aplicado). */
  dpr: number;
}

/**
 * Contrato de dibujo (frontera con frontend-expert): función de efectos que pinta un frame a
 * partir del estado *actual* del motor. Debe ser lectura pura sobre `engine`/`view` — no debe
 * mutar `engine`, no debe llamar setState de React, y no debe asumir que se ejecuta a una
 * cadencia fija (puede saltarse frames o repetirse sin que cambie el estado del motor, p.ej. en
 * un resize con la simulación pausada).
 *
 * react-expert (yo) define esta firma; frontend-expert la implementa en
 * `src/render/drawRiver.ts` moviendo ahí la lógica de dibujo que hoy vive en el `draw()` interno
 * de `RiverCanvas.tsx`.
 */
export type DrawRiver = (ctx: CanvasRenderingContext2D, engine: SedimentEngine, view: SimulationView) => void;

export interface UseSimulationLoopOptions {
  /** Si es false, el motor no avanza. El bucle de rAF sigue vivo (para poder redibujar, p.ej. tras un resize con la simulación pausada). */
  running: boolean;
  /** Factor de tiempo simulado / tiempo real (ej. 15 = 15 s simulados por cada s real). */
  timeScale: number;
  /**
   * dt real (wall-clock, en segundos) máximo considerado por frame antes de avanzar el motor.
   * Evita saltos grandes de simulación si la pestaña pierde el foco y vuelve (rAF se pausa en
   * pestañas ocultas; el primer frame al recuperar el foco puede traer un dt de varios
   * segundos). Por defecto 0.05 s (mismo clamp que tenía el bucle original en RiverCanvas).
   */
  maxRealDt?: number;
  /** Paso interno máximo (s de simulación) pasado a `engine.advance()` para subdividir el avance. Por defecto 0.05 s. */
  maxSubStep?: number;
  /**
   * Se llama en cada frame de rAF (haya avanzado el motor o no), después de `engine.advance()`.
   * Uso previsto: quien use el hook (p.ej. RiverCanvas) cierra sobre su `ctx`/`view` y llama
   * aquí a `drawRiver(ctx, engine, view)`. No debe usarse para setState con datos de partículas
   * (regla de oro del proyecto: las posiciones nunca pasan por useState/useReducer/contexto).
   */
  onFrame?: (now: number) => void;
}

/**
 * Detecta `prefers-reduced-motion` (hallazgo UX-06 de la ronda 1 de uiux-reviewer).
 *
 * El hook en sí NO fuerza la pausa (así el usuario puede reanudar manualmente en cualquier
 * momento); en su lugar, App.tsx usa esta función para decidir el valor *inicial* del estado
 * `running` que le pasa a `useSimulationLoop`, de modo que la animación no arranque sola en
 * dispositivos configurados para reducir el movimiento.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Bucle de animación de la simulación (requestAnimationFrame), separado del dibujo.
 *
 * Garantías:
 * - Las posiciones de partículas NUNCA pasan por aquí como estado de React: este hook muta el
 *   motor directamente vía `engine.advance()` (arrays tipados fuera de React). `running` y
 *   `timeScale` sí son estado de UI normal (pueden venir de useState en el llamador).
 * - dt acotado: el dt real por frame se clampa a `maxRealDt` antes de escalarlo por
 *   `timeScale` y pasarlo a `engine.advance()`, así una pestaña que pierde el foco no produce
 *   un salto enorme de simulación al volver.
 * - Limpieza correcta: `cancelAnimationFrame` en el cleanup del efecto.
 * - Seguro con StrictMode: cada invocación del efecto crea su propio `rafId`/`last`/`cancelled`
 *   en el cierre (closure) del efecto y los cancela en su propio cleanup. El doble
 *   mount→cleanup→mount que hace React 18 en desarrollo no deja dos bucles corriendo a la vez
 *   ni reutiliza un `last` "viejo" que metería un dt artificial.
 * - `running`/`timeScale`/`onFrame` se leen desde refs dentro del callback de rAF en vez de ir
 *   en el array de dependencias del efecto: así cambiarlos (mover un slider, pausar) no
 *   reinicia el bucle ni el reloj `last`, que es justamente lo que produciría el salto de dt
 *   que este hook busca evitar. El efecto solo se reinicia si cambia `engine`.
 */
export function useSimulationLoop(engine: SedimentEngine, options: UseSimulationLoopOptions): void {
  const { running, timeScale, maxRealDt = 0.05, maxSubStep = 0.05, onFrame } = options;

  const runningRef = useRef(running);
  const scaleRef = useRef(timeScale);
  const maxRealDtRef = useRef(maxRealDt);
  const maxSubStepRef = useRef(maxSubStep);
  const onFrameRef = useRef(onFrame);
  runningRef.current = running;
  scaleRef.current = timeScale;
  maxRealDtRef.current = maxRealDt;
  maxSubStepRef.current = maxSubStep;
  onFrameRef.current = onFrame;

  useEffect(() => {
    let rafId = 0;
    let cancelled = false;
    let last = performance.now();

    const loop = (now: number) => {
      if (cancelled) return;
      const dtReal = Math.min(maxRealDtRef.current, Math.max(0, (now - last) / 1000));
      last = now;
      if (runningRef.current && dtReal > 0) {
        engine.advance(dtReal * scaleRef.current, maxSubStepRef.current);
      }
      onFrameRef.current?.(now);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
    // running/timeScale/onFrame se leen vía refs (ver comentario arriba): el efecto solo debe
    // reiniciarse si cambia el motor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);
}
