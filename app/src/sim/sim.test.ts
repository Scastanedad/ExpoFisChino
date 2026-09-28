import { describe, expect, it } from "vitest";
import {
  GRAIN_CLASSES,
  criticalDepositionVelocity,
  criticalErosionVelocity,
  dStar,
  rouseNumber,
  settlingVelocity,
  shearVelocity,
  shieldsCritical,
  tauCritErosion,
  transportMode,
} from "./physics";
import {
  BED_DZ_PER_PARTICLE,
  ENTRY_BUFFER,
  MIN_WATER_FRACTION,
  N_BINS,
  REPOSE_TAN,
  RIVER_LENGTH,
  SedimentEngine,
  SUSPENDED,
  type SimParams,
} from "./engine";

describe("physics (Soulsby 1997)", () => {
  it("velocidad de caída de arena de 0.25 mm ≈ 36 mm/s", () => {
    expect(settlingVelocity(2.5e-4)).toBeGreaterThan(0.033);
    expect(settlingVelocity(2.5e-4)).toBeLessThan(0.039);
  });
  it("ws crece con el tamaño de grano", () => {
    const ws = GRAIN_CLASSES.map((c) => settlingVelocity(c.d));
    for (let i = 1; i < ws.length; i++) expect(ws[i]).toBeGreaterThan(ws[i - 1]);
  });
  it("D* y θcr tienen valores razonables", () => {
    expect(dStar(2.5e-4)).toBeCloseTo(6.32, 1);
    expect(shieldsCritical(2.5e-4)).toBeCloseTo(0.041, 2);
  });
  it("u* y umbrales: mayor grano no cohesivo requiere más velocidad", () => {
    const sand = GRAIN_CLASSES.find((c) => c.id === "arena")!;
    const gravel = GRAIN_CLASSES.find((c) => c.id === "grava")!;
    expect(criticalErosionVelocity(gravel, 1)).toBeGreaterThan(criticalErosionVelocity(sand, 1));
  });
  it("Hjulström: la arcilla (cohesiva) exige más velocidad de erosión que la arena fina", () => {
    const clay = GRAIN_CLASSES.find((c) => c.id === "arcilla")!;
    const fine = GRAIN_CLASSES.find((c) => c.id === "arena-fina")!;
    expect(criticalErosionVelocity(clay, 1)).toBeGreaterThan(criticalErosionVelocity(fine, 1));
    expect(criticalDepositionVelocity(clay, 1)).toBeLessThan(criticalErosionVelocity(clay, 1));
  });
  it("Rouse y modo de transporte", () => {
    const us = shearVelocity(0.6, 1);
    expect(transportMode(rouseNumber(settlingVelocity(2e-6), us))).toBe("carga de lavado");
    expect(transportMode(rouseNumber(settlingVelocity(4e-3), us))).toBe("carga de fondo");
  });
});

function run(velocity: number, poolFactor = 1, seconds = 1500) {
  const e = new SedimentEngine({ capacity: 6000, seed: 7 });
  const p: SimParams = { ...e.params, velocity, depth: 1, poolFactor, feedRate: 3 };
  e.setParams(p);
  e.advance(seconds, 0.1);
  return e.getStats();
}

describe("motor de partículas", () => {
  it("conserva la masa: inyectadas = salieron + depositadas + en suspensión", () => {
    const st = run(0.4);
    for (let c = 0; c < GRAIN_CLASSES.length; c++) {
      expect(st.injected[c]).toBe(st.exited[c] + st.deposited[c] + st.suspended[c]);
    }
  });
  it("más velocidad ⇒ más sedimento transportado y menos depositado", () => {
    const frac = (st: ReturnType<typeof run>) => {
      const inj = st.injected.reduce((a, b) => a + b, 0);
      return {
        exit: st.exited.reduce((a, b) => a + b, 0) / inj,
        dep: st.deposited.reduce((a, b) => a + b, 0) / inj,
      };
    };
    const slow = frac(run(0.15));
    const fast = frac(run(1.2));
    expect(fast.exit).toBeGreaterThan(slow.exit);
    expect(fast.dep).toBeLessThan(slow.dep);
  });
  it("los granos gruesos se depositan antes que los finos a velocidad moderada", () => {
    const st = run(0.35);
    const depFrac = (c: number) => st.deposited[c] / Math.max(1, st.injected[c]);
    const iClay = 0;
    const iGravel = GRAIN_CLASSES.length - 1;
    expect(depFrac(iGravel)).toBeGreaterThan(depFrac(iClay));
  });
  it("un remanso aumenta el depósito respecto a un tramo uniforme", () => {
    const flat = run(0.5, 1);
    const pool = run(0.5, 4);
    const dep = (s: ReturnType<typeof run>) => s.deposited.reduce((a, b) => a + b, 0);
    expect(dep(pool)).toBeGreaterThan(dep(flat));
  });
});

describe("perfil vertical de Rouse (B2)", () => {
  it("la concentración en suspensión sigue la forma de la distribución de Rouse", () => {
    // Flujo uniforme (sin remanso), solo arena fina: con U=0.4 m/s, h=1 m, P≈1.05
    // (suspensión parcial) y τ >> τce en todo el tramo, así que casi no se deposita y
    // podemos medir el perfil vertical de una población grande de partículas suspendidas.
    const fineIdx = GRAIN_CLASSES.findIndex((c) => c.id === "arena-fina");
    const fine = GRAIN_CLASSES[fineIdx];
    const mix = GRAIN_CLASSES.map((_, i) => (i === fineIdx ? 100 : 0));
    const e = new SedimentEngine({ capacity: 5000, seed: 42 });
    const params: SimParams = { ...e.params, velocity: 0.4, depth: 1, poolFactor: 1, feedRate: 15, mix };
    e.setParams(params);
    e.advance(2200, 0.1);

    const h = 1;
    const a = 0.02; // zb/h de referencia, igual al del motor (engine.ts: zb = 0.02*h)
    const us = shearVelocity(0.4, h);
    const ws = settlingVelocity(fine.d);
    const P = rouseNumber(ws, us);

    // Perfil analítico de Rouse (forma, sin normalizar a una concentración de referencia):
    // C(z)/Ca = [(1-s)/s · a/(1-a)]^P con s = z/h. Referencia: Rouse (1937).
    function rouseShape(s: number): number {
      const sc = Math.min(Math.max(s, a), 1 - a);
      return Math.pow(((1 - sc) / sc) * (a / (1 - a)), P);
    }

    // Histograma de posición vertical de partículas suspendidas, lejos de la inyección (x=0)
    // y de la salida (x=100), para medir el perfil ya desarrollado verticalmente.
    const NBINS = 7;
    const counts = new Array(NBINS).fill(0);
    for (let i = 0; i < e.capacity; i++) {
      if (e.state[i] !== SUSPENDED) continue;
      if (e.x[i] < 35 || e.x[i] > 90) continue;
      let b = Math.floor(e.s[i] * NBINS);
      if (b < 0) b = 0;
      if (b >= NBINS) b = NBINS - 1;
      counts[b]++;
    }

    const centers = counts.map((_, b) => (b + 0.5) / NBINS);
    const shapeVals = centers.map(rouseShape);

    // Regresión lineal de ln(counts) vs ln(forma de Rouse): si el perfil simulado tiene la
    // forma correcta, la pendiente debe ser ≈1 (mismo exponente P) y la correlación alta.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let b = 0; b < NBINS; b++) {
      if (counts[b] < 5) continue; // evita bins con poca estadística (cola alta, poca masa)
      xs.push(Math.log(shapeVals[b]));
      ys.push(Math.log(counts[b]));
    }
    expect(xs.length).toBeGreaterThanOrEqual(5);
    const nPts = xs.length;
    const mx = xs.reduce((s, v) => s + v, 0) / nPts;
    const my = ys.reduce((s, v) => s + v, 0) / nPts;
    let num = 0,
      den = 0,
      sy = 0;
    for (let i = 0; i < nPts; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
      sy += (ys[i] - my) ** 2;
    }
    const slope = num / den;
    const r2 = (num * num) / (den * sy);

    // Tolerancia amplia: es una caminata aleatoria con ruido estadístico finito, no un
    // esquema determinista; el objetivo es verificar la forma (ley de potencia con el P
    // correcto), no reproducir el perfil exacto punto a punto.
    expect(r2).toBeGreaterThan(0.85);
    expect(slope).toBeGreaterThan(0.5);
    expect(slope).toBeLessThan(1.6);
    // El perfil debe ser monótono decreciente con la altura (más concentración cerca del lecho).
    for (let b = 1; b < NBINS; b++) if (counts[b] > 0 || counts[b - 1] > 0) expect(counts[b]).toBeLessThanOrEqual(counts[b - 1]);
  });
});

describe("getWindowStats (B3)", () => {
  it("en régimen estacionario, salida ≈ aporte y capacidad de transporte ≈ 1", () => {
    // Solo arena media (no cohesiva) a velocidad alta: casi todo lo que entra sale, sin
    // depósito neto significativo, así que en la ventana final debe verse un régimen
    // estacionario con outflowRate ≈ inflowRate y transportCapacity ≈ 1.
    const sandIdx = GRAIN_CLASSES.findIndex((c) => c.id === "arena");
    const mix = GRAIN_CLASSES.map((_, i) => (i === sandIdx ? 100 : 0));
    const e = new SedimentEngine({ capacity: 4000, seed: 3 });
    const params: SimParams = { ...e.params, velocity: 1.2, depth: 1, poolFactor: 1, feedRate: 10, mix };
    e.setParams(params);
    e.advance(600, 0.1); // deja pasar suficiente tiempo para que el sistema se estabilice

    const w = e.getWindowStats(60);
    expect(w.actualWindowSeconds).toBeGreaterThan(50);
    expect(w.actualWindowSeconds).toBeLessThanOrEqual(60 + 1);
    expect(w.totalInflowRate).toBeGreaterThan(0);
    const ratio = w.totalOutflowRate / w.totalInflowRate;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.4);
    expect(w.totalTransportCapacity).toBeCloseTo(ratio, 5);
  });

  it("actualWindowSeconds se acota a lo que realmente lleva corriendo la simulación", () => {
    const e = new SedimentEngine({ capacity: 500, seed: 1 });
    e.advance(5, 0.1);
    const w = e.getWindowStats(9999);
    expect(w.requestedWindowSeconds).toBe(9999);
    expect(w.actualWindowSeconds).toBeLessThanOrEqual(5 + 0.5);
  });

  it("un reset() vacía el historial y las tasas de la ventana vuelven a 0", () => {
    const e = new SedimentEngine({ capacity: 2000, seed: 5 });
    const params: SimParams = { ...e.params, feedRate: 10 };
    e.setParams(params);
    e.advance(50, 0.1);
    expect(e.getWindowStats(10).totalInflowRate).toBeGreaterThan(0);
    e.reset();
    const w = e.getWindowStats(10);
    expect(w.totalInflowRate).toBe(0);
    expect(w.totalOutflowRate).toBe(0);
  });
});

describe("zona de entrada / resetOnChange (B4)", () => {
  it("no se deposita nada dentro de la zona de entrada (0..ENTRY_BUFFER)", () => {
    // Grava a velocidad baja: es la clase que más rápido tiende a depositarse cerca de x=0.
    const gravelIdx = GRAIN_CLASSES.length - 1;
    const mix = GRAIN_CLASSES.map((_, i) => (i === gravelIdx ? 100 : 0));
    const e = new SedimentEngine({ capacity: 3000, seed: 9 });
    const params: SimParams = { ...e.params, velocity: 0.2, depth: 1, poolFactor: 1, feedRate: 20, mix };
    e.setParams(params);
    e.advance(300, 0.1);

    const bufferBins = Math.ceil((ENTRY_BUFFER / RIVER_LENGTH) * N_BINS);
    const bins = e.getBinsSnapshot();
    let depositedInBuffer = 0;
    for (let c = 0; c < GRAIN_CLASSES.length; c++) {
      for (let b = 0; b < bufferBins; b++) depositedInBuffer += bins[c * N_BINS + b];
    }
    expect(depositedInBuffer).toBe(0);
    // pero sí hay depósito total (la grava se sigue depositando, solo que después del buffer)
    const totalDeposited = e.getStats().deposited.reduce((a, b) => a + b, 0);
    expect(totalDeposited).toBeGreaterThan(0);
  });

  it("resetOnChange reinicia contadores y partículas cuando cambia un parámetro clave", () => {
    const e = new SedimentEngine({ capacity: 2000, seed: 11 });
    const p1: SimParams = { ...e.params, velocity: 0.6, resetOnChange: true };
    e.setParams(p1);
    e.advance(50, 0.1);
    const before = e.getStats();
    expect(before.injected.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    // cambia un parámetro clave (velocity) con resetOnChange activo: debe resetear
    const p2: SimParams = { ...p1, velocity: 0.9 };
    e.setParams(p2);
    const afterKeyChange = e.getStats();
    expect(afterKeyChange.injected.reduce((a, b) => a + b, 0)).toBe(0);
    expect(afterKeyChange.time).toBe(0);

    e.advance(50, 0.1);
    const before2 = e.getStats();
    expect(before2.injected.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    // volver a llamar setParams sin cambiar nada clave no debe resetear
    const p3: SimParams = { ...p2 };
    e.setParams(p3);
    const afterNoChange = e.getStats();
    expect(afterNoChange.injected.reduce((a, b) => a + b, 0)).toBe(
      before2.injected.reduce((a, b) => a + b, 0),
    );
  });
});

describe("realimentación lecho → flujo (Exner): sin acumulación infinita en un punto", () => {
  // Reporte de usuario (sept. 2026): con velocity=2, depth=3, poolFactor=3.8 la grava se
  // acumulaba "de forma infinita y no natural" en 1-2 bins en la cabecera del remanso, y a
  // velocidad baja en un único bin justo después de la zona de entrada (x=10 m). Causa: el
  // depósito no modificaba la hidráulica. Con la realimentación de Exner, el depósito eleva el
  // lecho, reduce la profundidad efectiva, por continuidad sube U y τ, y la barra deja de crecer
  // cuando τ ≈ τce; a partir de ahí su frente avanza aguas abajo (progradación).
  const gravelIdx = GRAIN_CLASSES.length - 1;
  const gravel = GRAIN_CLASSES[gravelIdx];

  function runBed(velocity: number, depth: number, poolFactor: number, seconds: number, mix?: number[]) {
    const e = new SedimentEngine({ capacity: 8000, seed: 7 });
    e.setParams({ ...e.params, velocity, depth, poolFactor, feedRate: 20, mix: mix ?? e.params.mix });
    e.advance(seconds, 0.05);
    return e;
  }

  it("remanso profundo: la barra de grava llega a su altura de equilibrio (τ≈τce) y luego prograda", () => {
    const e = runBed(2, 3, 3.8, 1600);
    const st = e.getStats();
    for (let c = 0; c < GRAIN_CLASSES.length; c++) {
      expect(st.injected[c]).toBe(st.exited[c] + st.deposited[c] + st.suspended[c]);
    }
    const bins = e.getBinsSnapshot();
    const bed = e.getBedSnapshot();
    let maxBin = 0;
    let occupied = 0;
    for (let b = 0; b < N_BINS; b++) {
      if (bins[gravelIdx * N_BINS + b] > bins[gravelIdx * N_BINS + maxBin]) maxBin = b;
      if (bins[gravelIdx * N_BINS + b] > 0) occupied++;
    }
    // ya no está todo en uno o dos bins
    expect(bins[gravelIdx * N_BINS + maxBin] / st.deposited[gravelIdx]).toBeLessThan(0.5);
    expect(occupied).toBeGreaterThanOrEqual(3);
    // sobre la cresta de la barra el esfuerzo ya subió mucho respecto al remanso sin depósito
    // (τ/τce ≈ 0.21) camino al umbral de la grava, sin pasarlo
    const xCrest = ((maxBin + 0.5) / N_BINS) * RIVER_LENGTH;
    const ratio = e.tauAt(xCrest) / tauCritErosion(gravel);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(1.3);
    // y la barra no pasa de su altura de equilibrio analítica (h_eq ≈ 5.7 m con q = 6 m²/s)
    expect(bed[maxBin]).toBeLessThan(3 * 3.8 - 5.3);
  }, 60000);

  it("equilibrio: aguas arriba del remanso el lecho de grava se ajusta hasta τ ≈ τce", () => {
    // velocity=0.7, depth=1: τ inicial ≈ 0.73·τce de la grava, así que la grava se deposita
    // aguas arriba; el lecho sube hasta que la sección reducida lleva τ al umbral.
    const e = runBed(0.7, 1, 2.75, 800);
    for (const x of [15, 25, 35]) {
      const r = e.tauAt(x) / tauCritErosion(gravel);
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1.15);
    }
  }, 60000);

  it("velocidad baja: la grava no se apila en un único bin justo después de la zona de entrada", () => {
    const mix = GRAIN_CLASSES.map((_, i) => (i === gravelIdx ? 100 : 0));
    const e = runBed(0.3, 0.5, 1, 900, mix);
    const bins = e.getBinsSnapshot();
    const dep = e.getStats().deposited[gravelIdx];
    const firstBin = Math.ceil((ENTRY_BUFFER / RIVER_LENGTH) * N_BINS);
    expect(dep).toBeGreaterThan(0);
    expect(bins[gravelIdx * N_BINS + firstBin] / dep).toBeLessThan(0.5);
  }, 60000);

  it("el lecho respeta el ángulo de reposo, la lámina mínima de agua y es coherente con los conteos", () => {
    const e = runBed(0.4, 3, 4, 800);
    const bins = e.getBinsSnapshot();
    const bed = e.getBedSnapshot();
    const hMin = MIN_WATER_FRACTION * 3;
    const firstBin = Math.ceil((ENTRY_BUFFER / RIVER_LENGTH) * N_BINS);
    const h0 = (b: number) => e.h0At(((b + 0.5) / N_BINS) * RIVER_LENGTH);
    for (let b = 0; b < N_BINS; b++) {
      let n = 0;
      for (let c = 0; c < GRAIN_CLASSES.length; c++) n += bins[c * N_BINS + b];
      expect(bed[b]).toBeCloseTo(n * BED_DZ_PER_PARTICLE, 6);
      expect(h0(b) - bed[b]).toBeGreaterThanOrEqual(hMin - 1e-9);
    }
    for (let i = 0; i < 400; i++) expect(e.hArr[i]).toBeGreaterThanOrEqual(hMin - 1e-6);
    // ninguna cara de depósito más empinada que el reposo (salvo que el vecino bajo esté lleno)
    const binW = RIVER_LENGTH / N_BINS;
    const tol = binW * REPOSE_TAN + 2 * BED_DZ_PER_PARTICLE;
    for (let b = firstBin; b < N_BINS - 1; b++) {
      for (const [hi, lo] of [
        [b, b + 1],
        [b + 1, b],
      ]) {
        if (bed[hi] <= 0 || lo < firstBin) continue;
        const loFull = bed[lo] + BED_DZ_PER_PARTICLE > h0(lo) - hMin;
        const drop = bed[hi] - h0(hi) - (bed[lo] - h0(lo));
        if (!loFull) expect(drop).toBeLessThanOrEqual(tol);
      }
    }
  }, 60000);

  it("reset() borra el lecho y restaura la hidráulica original", () => {
    const e = runBed(0.7, 1, 2.75, 300);
    const hPoolBefore = e.hAt(60);
    e.reset();
    expect(Array.from(e.getBedSnapshot()).every((v) => v === 0)).toBe(true);
    expect(e.hAt(60)).toBeCloseTo(e.h0At(60), 6);
    expect(e.hAt(60)).toBeGreaterThanOrEqual(hPoolBefore);
  }, 60000);
});
