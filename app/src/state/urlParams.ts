import { GRAIN_CLASSES } from "../sim/physics";
import type { SimParams } from "../sim/engine";

/**
 * Estado de escenario que se puede reflejar en la URL y compartir con un enlace.
 * Deliberadamente NO incluye `running` (arrancar en pausa/reproducción no es parte del
 * "experimento" en sí) ni el estado de partículas (eso vive en el motor, nunca en la URL).
 */
export interface ShareableState {
  params: Partial<SimParams>;
  timeScale?: number;
}

/** Nombres de query params (cortos, en español, pensados para pegarse en un enlace). */
const KEYS = {
  velocity: "U",
  depth: "h",
  poolFactor: "remanso",
  feedRate: "aporte",
  mix: "mezcla",
  timeScale: "t",
} as const;

/**
 * Rangos válidos de cada parámetro. Deben reflejar los límites de los sliders en
 * `Controls.tsx`; un valor fuera de rango en la URL se recorta en vez de rechazarse, para que
 * un enlace con un valor ligeramente desactualizado (p.ej. si algún día cambian los límites)
 * siga siendo usable en vez de ignorarse por completo.
 */
const RANGES: Record<string, readonly [number, number]> = {
  velocity: [0.05, 2],
  depth: [0.5, 3],
  poolFactor: [1, 4],
  feedRate: [5, 60],
  timeScale: [1, 40],
};

function clamp(v: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, v));
}

function readNumber(q: URLSearchParams, key: string, range: readonly [number, number]): number | undefined {
  const raw = q.get(key);
  if (raw === null) return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? clamp(v, range) : undefined;
}

/**
 * Lee U/h/remanso/aporte/mezcla/t desde un query string (p.ej. `location.search`). Cualquier
 * clave ausente o inválida se omite del resultado (el llamador conserva su propio default), en
 * vez de lanzar o forzar un objeto SimParams completo: un enlace puede compartir solo algunos
 * parámetros.
 */
export function readStateFromSearch(search: string): ShareableState {
  const q = new URLSearchParams(search);
  const params: Partial<SimParams> = {};

  const velocity = readNumber(q, KEYS.velocity, RANGES.velocity);
  if (velocity !== undefined) params.velocity = velocity;
  const depth = readNumber(q, KEYS.depth, RANGES.depth);
  if (depth !== undefined) params.depth = depth;
  const poolFactor = readNumber(q, KEYS.poolFactor, RANGES.poolFactor);
  if (poolFactor !== undefined) params.poolFactor = poolFactor;
  const feedRate = readNumber(q, KEYS.feedRate, RANGES.feedRate);
  if (feedRate !== undefined) params.feedRate = feedRate;

  const mixRaw = q.get(KEYS.mix);
  if (mixRaw) {
    const parts = mixRaw.split(",").map(Number);
    if (parts.length === GRAIN_CLASSES.length && parts.every((n) => Number.isFinite(n) && n >= 0)) {
      params.mix = parts;
    }
  }

  const timeScale = readNumber(q, KEYS.timeScale, RANGES.timeScale);

  return { params, timeScale };
}

/** Construye el query string (sin "?") que representa el escenario actual. */
export function buildShareSearch(params: SimParams, timeScale: number): string {
  const q = new URLSearchParams();
  q.set(KEYS.velocity, params.velocity.toFixed(2));
  q.set(KEYS.depth, params.depth.toFixed(2));
  q.set(KEYS.poolFactor, params.poolFactor.toFixed(2));
  q.set(KEYS.feedRate, String(Math.round(params.feedRate)));
  q.set(KEYS.mix, params.mix.map((m) => Math.round(m)).join(","));
  q.set(KEYS.timeScale, String(Math.round(timeScale)));
  return q.toString();
}

/**
 * Reemplaza la URL actual (sin agregar entradas al historial: usa `history.replaceState`) para
 * reflejar el escenario. Pensada para llamarse con debounce desde un efecto de React, así un
 * arrastre continuo de slider no dispara una escritura por cada evento `input`.
 */
export function replaceUrlWithState(params: SimParams, timeScale: number): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const search = buildShareSearch(params, timeScale);
  const url = `${window.location.pathname}?${search}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

/**
 * Copia al portapapeles la URL completa y compartible del escenario actual (origin + path +
 * query de `buildShareSearch`). Devuelve `true` si la copia tuvo éxito. Expuesta para que el
 * botón visual "Copiar enlace" (a implementar por frontend-expert donde corresponda en la UI)
 * solo tenga que llamarla.
 */
export async function copyShareLink(params: SimParams, timeScale: number): Promise<boolean> {
  const search = buildShareSearch(params, timeScale);
  const url = `${window.location.origin}${window.location.pathname}?${search}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // sigue al fallback de abajo
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
