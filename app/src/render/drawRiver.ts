import { ENTRY_BUFFER, N_BINS, RIVER_LENGTH, SUSPENDED } from "../sim/engine";
import type { DrawRiver } from "../hooks/useSimulationLoop";

/**
 * Dibujo puro de la vista lateral del río (contrato `DrawRiver`, ver src/hooks/useSimulationLoop.ts).
 * No muta `engine`, no llama setState de React, no asume cadencia fija.
 *
 * Fidelidad visual:
 * - El perfil del lecho se lee de `engine.hAt(xm)`, que ya incorpora la transición
 *   smootherstep del remanso (50-70 m con rampa de 8 m a cada lado) calculada en el motor:
 *   este archivo NO dibuja ninguna geometría propia del remanso, solo muestrea `hAt` en
 *   suficientes puntos para que la curva se vea suave (200+ muestras / 100 m).
 * - La zona de entrada (0-`ENTRY_BUFFER` m) se marca como una franja sutil porque el motor no
 *   permite depósito contable ahí (ver comentario de ENTRY_BUFFER en sim/engine.ts); es solo
 *   una nota visual, no cambia ninguna proporción ni escala.
 * - Los colores por clase de grano son siempre `engine.classes[c].color` (mismos que la
 *   leyenda y los otros gráficos), nunca un color inventado aquí: si backend-expert cambia
 *   GRAIN_CLASSES[i].color en sim/physics.ts, este archivo lo refleja sin tocar una línea.
 *
 * Jerarquía tipográfica dentro del canvas (Paso 3):
 * - Dato primario (p.ej. "U = 0.60 m/s"): mono, negrita, tamaño mayor, opacidad plena.
 * - Anotación (marcas de eje, "zona de entrada", "salida →", nota de remanso): prosa (system-ui),
 *   más pequeña, peso normal, opacidad reducida.
 * Ambas usan la misma técnica de halo (relleno oscuro + contorno claro) para leerse igual sobre
 * el agua clara de la superficie que sobre el lecho oscuro.
 */

const FONT_MONO = 'ui-monospace, "Cascadia Code", Consolas, monospace';
const FONT_SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Deben mantenerse en sintonía con los tokens de src/styles.css (:root). No se leen de CSS en
// cada frame por costo (getComputedStyle en un canvas a 60fps) — es un duplicado intencional,
// documentado, de los mismos valores.
const PRIMARY_FILL = "#0c1a24";
const PRIMARY_HALO = "rgba(255,255,255,0.92)";
const ANNOTATION_FILL = "rgba(12,26,36,0.86)";
const ANNOTATION_HALO = "rgba(255,255,255,0.75)";

/** Dibuja `text` con relleno + contorno claro (halo) para legibilidad sobre fondos variables. */
function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { font: string; fill: string; halo: string; haloWidth: number; align?: CanvasTextAlign; baseline?: CanvasTextBaseline },
) {
  ctx.font = opts.font;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = opts.baseline ?? "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = opts.haloWidth;
  ctx.strokeStyle = opts.halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = opts.fill;
  ctx.fillText(text, x, y);
}

// --- caché de patrones de textura granulada (5 fijos, uno por clase de grano) ---------------
// Se generan una sola vez por (color, coarseness) y se reutilizan en todos los frames: crear un
// CanvasPattern por frame para hasta 5 clases * 50 bins sería trabajo de dibujo desperdiciado.
const patternCache = new Map<string, CanvasPattern>();

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Textura granulada cacheada: puntitos más grandes y dispersos cuanto más grueso el grano
 * (coarseness en [0,1], 0 = arcilla/fina, 1 = grava/gruesa). */
function getGrainPattern(ctx: CanvasRenderingContext2D, color: string, coarseness: number): CanvasPattern | string {
  if (typeof document === "undefined") return color;
  const key = `${color}|${coarseness.toFixed(2)}`;
  const cached = patternCache.get(key);
  if (cached) return cached;

  const size = 16;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return color;

  tctx.fillStyle = color;
  tctx.fillRect(0, 0, size, size);
  const rand = mulberry32(hashStr(key));
  const dotCount = 6 + Math.round(coarseness * 6);
  for (let i = 0; i < dotCount; i++) {
    const rx = rand() * size;
    const ry = rand() * size;
    const r = 0.5 + coarseness * 1.6 * rand() + 0.3;
    tctx.beginPath();
    tctx.fillStyle = rand() > 0.5 ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.18)";
    tctx.arc(rx, ry, r, 0, Math.PI * 2);
    tctx.fill();
  }
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return color;
  patternCache.set(key, pattern);
  return pattern;
}

/** Traza una polilínea suavizada (curvas cuadráticas por los puntos medios) desde la posición
 * actual del path. Usada para el contorno superior del depósito apilado, en vez del techo
 * rectilíneo bin-a-bin de la versión anterior. */
function smoothPolylineTo(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length === 0) return;
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x, pts[0].y);
    return;
  }
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

export const drawRiver: DrawRiver = (ctx, engine, view) => {
  const { width: W, height: H } = view;
  const p = engine.params;
  const top = 10;
  const bottom = 30;
  const plotH = H - top - bottom;
  const hMax = p.depth * p.poolFactor;
  const pxPerM = plotH / (hMax * 1.25);
  const yBed = (h: number) => top + h * pxPerM;
  const nC = engine.classes.length;

  const baseFont = Math.max(12, Math.min(16, Math.round(H * 0.042)));

  ctx.clearRect(0, 0, W, H);

  // --- muestreo único del lecho (evita llamar hAt dos veces por punto para agua/remanso/lecho) ---
  const steps = 240;
  const xs: number[] = new Array(steps + 1);
  const hVals: number[] = new Array(steps + 1);
  const bedY: number[] = new Array(steps + 1);
  for (let k = 0; k <= steps; k++) {
    const xm = (k / steps) * RIVER_LENGTH * 0.9999;
    const h = engine.hAt(xm);
    xs[k] = (k / steps) * W;
    hVals[k] = h;
    bedY[k] = yBed(h);
  }

  // --- agua: gradiente de 4 paradas ---
  const waterGrad = ctx.createLinearGradient(0, top, 0, top + plotH);
  waterGrad.addColorStop(0, "#dff1f7");
  waterGrad.addColorStop(0.35, "#a8d3e6");
  waterGrad.addColorStop(0.7, "#5a91ad");
  waterGrad.addColorStop(1, "#345a70");
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, top, W, plotH);

  // --- líneas de flujo: se desplazan a una tasa atada a la velocidad real del motor (p.velocity),
  // no a una animación de duración fija. performance.now() se lee aquí mismo (el contrato
  // DrawRiver no pasa el tiempo real como argumento). ---
  const now = performance.now();
  const flowSpacing = 42;
  const flowPxPerSecAtUnitSpeed = 30;
  const flowSpeed = Math.max(0.05, p.velocity);
  const flowPhase = (now / 1000) * flowSpeed * flowPxPerSecAtUnitSpeed;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, W, plotH);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 1;
  const flowRows = 6;
  for (let r = 0; r < flowRows; r++) {
    const y = top + ((r + 0.5) * plotH) / flowRows;
    const rowPhase = (flowPhase + r * 13) % flowSpacing;
    for (let sx = -flowSpacing + rowPhase; sx < W + flowSpacing; sx += flowSpacing) {
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + 22, y - 3);
      ctx.stroke();
    }
  }
  ctx.restore();

  // --- remanso: overlay sutil (10-15% opacidad) de tono de agua profunda sobre la zona ya
  // deprimida por hAt/poolFactor (no redibuja la geometría del remanso, solo la resalta). ---
  if (p.poolFactor > 1.001) {
    const threshold = p.depth * 1.03;
    const alpha = Math.min(0.15, 0.06 + 0.03 * (p.poolFactor - 1));
    const drawRun = (i0: number, i1: number) => {
      if (i0 < 0 || i1 <= i0) return;
      ctx.beginPath();
      ctx.moveTo(xs[i0], top);
      for (let k = i0; k <= i1; k++) ctx.lineTo(xs[k], top);
      for (let k = i1; k >= i0; k--) ctx.lineTo(xs[k], bedY[k]);
      ctx.closePath();
      ctx.fillStyle = `rgba(20,45,60,${alpha.toFixed(3)})`;
      ctx.fill();
    };
    let runStart = -1;
    for (let k = 0; k <= steps; k++) {
      if (hVals[k] > threshold) {
        if (runStart < 0) runStart = k;
      } else {
        if (runStart >= 0) drawRun(runStart, k - 1);
        runStart = -1;
      }
    }
    if (runStart >= 0) drawRun(runStart, steps);
  }

  // --- lecho (sustrato base, suave por el smootherstep del motor) ---
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let k = 0; k <= steps; k++) ctx.lineTo(xs[k], bedY[k]);
  ctx.lineTo(W, H);
  ctx.closePath();
  const bedGrad = ctx.createLinearGradient(0, top, 0, H);
  bedGrad.addColorStop(0, "#4d3a2a");
  bedGrad.addColorStop(1, "#2a1f16");
  ctx.fillStyle = bedGrad;
  ctx.fill();

  // --- franja sutil de la zona de entrada (0..ENTRY_BUFFER m): sin depósito contable ---
  const entryPx = (ENTRY_BUFFER / RIVER_LENGTH) * W;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, entryPx, plotH);
  ctx.clip();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  const hatchGap = 9;
  for (let sx = -plotH; sx < entryPx + plotH; sx += hatchGap) {
    ctx.beginPath();
    ctx.moveTo(sx, top + plotH);
    ctx.lineTo(sx + plotH, top);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(entryPx, top);
  ctx.lineTo(entryPx, H - bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  haloText(ctx, `zona de entrada (${ENTRY_BUFFER} m, sin depósito)`, 4, H - bottom - 6, {
    font: `${baseFont - 2}px ${FONT_SANS}`,
    fill: ANNOTATION_FILL,
    halo: ANNOTATION_HALO,
    haloWidth: 3,
    align: "left",
    baseline: "alphabetic",
  });

  // --- depósitos apilados por clase: contorno superior suavizado + patrón de textura granulada
  // cacheado por clase (en vez del bloque sólido opaco / techo rectilíneo anterior).
  //
  // Tope visual (clamp): el motor (sim/engine.ts) no impone un límite de capacidad por bin —
  // solo un límite global de partículas (`engine.capacity`, banner "saturated"). Con parámetros
  // extremos (p.ej. profundidad=3 m, remanso=3.8x) un bin puntual del remanso puede acumular más
  // partículas de las que caben dibujadas en su propia columna de agua, y sin tope la pila
  // "perfora" la superficie y el borde superior del canvas (reportado tras el cierre de la ronda
  // anterior: se había arreglado el contorno/textura de D2 pero no el clamp de altura). Aquí NO
  // se trunca arbitrariamente la última clase dibujada: si la demanda total de altura (suma de
  // las 5 clases) excede la altura disponible de la columna local, se comprime PROPORCIONALMENTE
  // toda la pila del bin (mismas proporciones entre clases, menor escala) y el bin se marca
  // "colmatado" para dibujar encima una textura de aspas de advertencia, en vez de seguir
  // creciendo sin límite. El dato real (`stats`) no se altera, solo su representación. ---
  const stats = engine.getBinsSnapshot();
  const perBin = engine.capacity / N_BINS;
  const pxPerDep = (plotH * 0.3) / (perBin * 0.5);
  const binCenterX = (b: number) => ((b + 0.5) / N_BINS) * W;
  const bedYAtBin: number[] = new Array(N_BINS);
  for (let b = 0; b < N_BINS; b++) bedYAtBin[b] = yBed(engine.hAt(((b + 0.5) / N_BINS) * RIVER_LENGTH));

  // Margen de agua que debe quedar siempre visible por encima de la pila: al menos 12% de la
  // columna local de agua o 6 px, lo que sea mayor (para que un bin de columna muy corta no
  // pierda el margen por completo).
  const maxDepositPx: number[] = new Array(N_BINS);
  for (let b = 0; b < N_BINS; b++) {
    const colPx = Math.max(0, bedYAtBin[b] - top);
    const waterGapPx = Math.max(6, colPx * 0.12);
    maxDepositPx[b] = Math.max(2, colPx - waterGapPx);
  }

  // Demanda de altura sin comprimir por clase/bin, y su suma por bin.
  const rawH: number[][] = new Array(nC);
  const totalDemandPx: number[] = new Array(N_BINS).fill(0);
  for (let c = 0; c < nC; c++) {
    rawH[c] = new Array(N_BINS);
    for (let b = 0; b < N_BINS; b++) {
      const n = stats[c * N_BINS + b];
      const hh = n > 0 ? Math.max(1, n * pxPerDep) : 0;
      rawH[c][b] = hh;
      totalDemandPx[b] += hh;
    }
  }
  const saturated: boolean[] = new Array(N_BINS);
  const scale: number[] = new Array(N_BINS);
  for (let b = 0; b < N_BINS; b++) {
    if (totalDemandPx[b] > maxDepositPx[b] + 0.5 && totalDemandPx[b] > 0) {
      scale[b] = maxDepositPx[b] / totalDemandPx[b];
      saturated[b] = true;
    } else {
      scale[b] = 1;
      saturated[b] = false;
    }
  }

  const bottomBoundary: number[][] = [];
  const topBoundary: number[][] = [];
  const cum = bedYAtBin.slice();
  for (let c = 0; c < nC; c++) {
    const bottomB = cum.slice();
    const topB: number[] = new Array(N_BINS);
    for (let b = 0; b < N_BINS; b++) {
      const hh = rawH[c][b] * scale[b];
      topB[b] = cum[b] - hh;
      cum[b] = topB[b];
    }
    bottomBoundary.push(bottomB);
    topBoundary.push(topB);
  }

  for (let c = 0; c < nC; c++) {
    let any = false;
    for (let b = 0; b < N_BINS; b++) if (stats[c * N_BINS + b] > 0) any = true;
    if (!any) continue;
    const bottomPts = Array.from({ length: N_BINS }, (_, b) => ({ x: binCenterX(b), y: bottomBoundary[c][b] }));
    const topPts = Array.from({ length: N_BINS }, (_, b) => ({ x: binCenterX(b), y: topBoundary[c][b] })).reverse();

    ctx.beginPath();
    ctx.moveTo(bottomPts[0].x, bottomPts[0].y);
    smoothPolylineTo(ctx, bottomPts);
    smoothPolylineTo(ctx, topPts);
    ctx.closePath();

    const coarseness = nC > 1 ? c / (nC - 1) : 0;
    ctx.fillStyle = getGrainPattern(ctx, engine.classes[c].color, coarseness);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- indicador de "banco colmatado": estos bins llegaron al tope visual (el conteo real de
  // partículas depositadas sigue creciendo por debajo, comprimido, pero ya no cabe dibujado sin
  // tapar el agua). Se marca con una textura de aspas de advertencia — no con más altura — para
  // que se lea como "lleno", no como un error de dibujo. ---
  const binW = W / N_BINS;
  const drawSaturatedRun = (i0: number, i1: number) => {
    const minX = binCenterX(i0) - binW / 2;
    const maxX = binCenterX(i1) + binW / 2;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let b = i0; b <= i1; b++) {
      minY = Math.min(minY, topBoundary[nC - 1][b]);
      maxY = Math.max(maxY, bedYAtBin[b]);
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(binCenterX(i0), bedYAtBin[i0]);
    for (let b = i0; b <= i1; b++) ctx.lineTo(binCenterX(b), bedYAtBin[b]);
    for (let b = i1; b >= i0; b--) ctx.lineTo(binCenterX(b), topBoundary[nC - 1][b]);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,140,40,0.6)";
    ctx.lineWidth = 1.2;
    const hatchGap2 = 6;
    const span = maxY - minY;
    for (let sx = minX - span; sx < maxX + span; sx += hatchGap2) {
      ctx.beginPath();
      ctx.moveTo(sx, maxY);
      ctx.lineTo(sx + span, minY);
      ctx.stroke();
    }
    ctx.restore();

    if (maxX - minX > 46) {
      haloText(ctx, "colmatado", (minX + maxX) / 2, Math.max(top + 12, minY - 4), {
        font: `${baseFont - 3}px ${FONT_SANS}`,
        fill: ANNOTATION_FILL,
        halo: ANNOTATION_HALO,
        haloWidth: 2.5,
        align: "center",
        baseline: "bottom",
      });
    }
  };
  let satRunStart = -1;
  for (let b = 0; b <= N_BINS; b++) {
    if (b < N_BINS && saturated[b]) {
      if (satRunStart < 0) satRunStart = b;
    } else {
      if (satRunStart >= 0) drawSaturatedRun(satRunStart, b - 1);
      satRunStart = -1;
    }
  }

  // --- partículas en suspensión (lotes por clase, hasta 8000 partículas / 60 fps) ---
  const size = 2.6;
  for (let c = 0; c < nC; c++) {
    const isGravel = c === nC - 1;
    const isCoarseSand = c === nC - 2;
    const sz = isGravel ? size + 2.2 : isCoarseSand ? size + 0.4 : size;
    ctx.fillStyle = engine.classes[c].color;
    if (isGravel) {
      ctx.strokeStyle = "rgba(6,12,18,0.6)";
      ctx.lineWidth = 1;
    }
    for (let i = 0; i < engine.capacity; i++) {
      if (engine.state[i] !== SUSPENDED || engine.cls[i] !== c) continue;
      const xm = engine.x[i];
      const h = engine.hAt(xm);
      const px = (xm / RIVER_LENGTH) * W;
      const py = top + (h - engine.s[i] * h) * pxPerM;
      if (isGravel) {
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        ctx.strokeRect(px - sz / 2, py - sz / 2, sz, sz);
      } else {
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
    }
  }

  // --- superficie del agua ---
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(W, top);
  ctx.stroke();

  // --- ejes / marcas de distancia (anotación: mono, pequeño, opacidad reducida) ---
  for (let m = 0; m <= RIVER_LENGTH; m += 20) {
    const px = (m / RIVER_LENGTH) * W;
    ctx.fillStyle = ANNOTATION_FILL;
    ctx.fillRect(Math.min(px, W - 1), H - bottom + 2, 1, 5);
    haloText(ctx, `${m} m`, Math.min(px, W - 1), H - bottom + 9, {
      font: `${baseFont - 1}px ${FONT_MONO}`,
      fill: ANNOTATION_FILL,
      halo: ANNOTATION_HALO,
      haloWidth: 2.5,
      align: m === 0 ? "left" : m === RIVER_LENGTH ? "right" : "center",
      baseline: "top",
    });
  }

  // --- velocidades locales (flechas + dato primario "U = ... m/s") ---
  const arrow = (xm: number, label: string) => {
    const U = engine.uMeanArr[Math.min(399, Math.floor((xm / RIVER_LENGTH) * 400))];
    const len = Math.min(90, 12 + U * 55);
    const px = (xm / RIVER_LENGTH) * W;
    const y = top + 16;
    ctx.strokeStyle = PRIMARY_FILL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + len, y);
    ctx.lineTo(px + len - 6, y - 4);
    ctx.moveTo(px + len, y);
    ctx.lineTo(px + len - 6, y + 4);
    ctx.stroke();
    haloText(ctx, `${label} ${U.toFixed(2)} m/s`, px, y + 8, {
      font: `700 ${baseFont + 1}px ${FONT_MONO}`,
      fill: PRIMARY_FILL,
      halo: PRIMARY_HALO,
      haloWidth: 3.5,
      align: "left",
      baseline: "top",
    });
  };
  arrow(2, "U =");
  if (p.poolFactor > 1) {
    arrow(RIVER_LENGTH * 0.5 + 3, "U =");
    haloText(ctx, "remanso (más profundo, más lento)", 0.6 * W, yBed(hMax) - 6, {
      font: `${baseFont - 2}px ${FONT_SANS}`,
      fill: ANNOTATION_FILL,
      halo: ANNOTATION_HALO,
      haloWidth: 3,
      align: "center",
      baseline: "bottom",
    });
  }

  // --- indicador de flujo de salida (extremo derecho), dentro del propio canvas ---
  const exitU = engine.uMeanArr[399];
  const exitMargin = Math.max(18, Math.min(28, W * 0.02));
  const exitLineX = W - exitMargin;
  const exitTopY = top + 4;
  const exitBotY = H - bottom - 4;
  ctx.strokeStyle = "rgba(238,242,245,0.4)";
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(exitLineX, exitTopY);
  ctx.lineTo(exitLineX, exitBotY);
  ctx.stroke();
  ctx.setLineDash([]);

  const arrowLen = Math.max(6, Math.min(exitMargin - 6, 8 + exitU * 8));
  const arrowBaseX = exitLineX + 3;
  const arrowTipX = Math.min(W - 3, arrowBaseX + arrowLen);
  ctx.fillStyle = ANNOTATION_FILL;
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const y = exitTopY + ((r + 0.5) * (exitBotY - exitTopY)) / rows;
    ctx.beginPath();
    ctx.moveTo(arrowBaseX, y - 5);
    ctx.lineTo(arrowTipX, y);
    ctx.lineTo(arrowBaseX, y + 5);
    ctx.closePath();
    ctx.fill();
  }
  haloText(ctx, "salida →", W - 6, top + 6, {
    font: `${baseFont - 1}px ${FONT_SANS}`,
    fill: ANNOTATION_FILL,
    halo: ANNOTATION_HALO,
    haloWidth: 2.5,
    align: "right",
    baseline: "top",
  });
};
