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
import { ENTRY_BUFFER, N_BINS, POOL_START, RIVER_LENGTH, SedimentEngine, SUSPENDED, type SimParams } from "./engine";

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

describe("caso límite: remanso profundo sin resuspensión posible (reporte de usuario, sept. 2026)", () => {
  // velocity=2, depth=3, poolFactor=3.8: fuera del rango instrumentado hasta ahora
  // (depth se había probado hasta 1, poolFactor hasta 3). A estos parámetros h en el
  // remanso sube a depth*poolFactor=11.4 m, y por continuidad U y u* caen tanto que
  // tau_remanso/tauCe_grava ≈ 0.21: la grava queda atrapada de forma permanente (nunca
  // tau_remanso supera tauCe_grava, así que ex=tau/tauCe nunca pasa de 1 y la probabilidad
  // de resuspensión, que sólo es >0 cuando ex>1, es exactamente 0 todo el tiempo).
  // Esto es la limitación conocida "sin lecho evolutivo" (ver modelo-rio-efc §5, punto 3)
  // llevada a un extremo visualmente dramático: sin realimentación lecho→hidráulica, el
  // depósito de grava en la cabecera del remanso crece de forma monótona y sin límite
  // natural (sólo lo acota la capacity global del motor). No es un bug de contabilidad:
  // el invariante de masa se mantiene, y el depósito se concentra correctamente en la
  // franja donde tau cruza tauCe (borde de entrada al remanso), no en un bin arbitrario.
  // Este test es un test de regresión de comportamiento documentado, no una corrección:
  // si algún día se agrega realimentación lecho→hidráulica, hay que revisar y actualizar
  // este test (y la skill modelo-rio-efc) a propósito, no dejar que falle en silencio.
  it("tau en el remanso queda muy por debajo de tauCe de la grava (sin vía de resuspensión)", () => {
    const e = new SedimentEngine({ capacity: 500, seed: 1 });
    const params: SimParams = { ...e.params, velocity: 2, depth: 3, poolFactor: 3.8 };
    e.setParams(params);
    const gravel = GRAIN_CLASSES[GRAIN_CLASSES.length - 1];
    const tauPool = e.tauAt(RIVER_LENGTH * (POOL_START + 0.1)); // dentro del tramo plano del remanso
    expect(tauPool).toBeLessThan(0.3 * tauCritErosion(gravel));
  });

  it("la grava se acumula de forma monótona y sin resuspensión, y el invariante de masa se mantiene", () => {
    const gravelIdx = GRAIN_CLASSES.length - 1;
    const e = new SedimentEngine({ capacity: 8000, seed: 7 });
    const params: SimParams = { ...e.params, velocity: 2, depth: 3, poolFactor: 3.8, feedRate: 20 };
    e.setParams(params);

    e.advance(300, 0.05);
    const dep300 = e.getStats().deposited[gravelIdx];
    e.advance(600, 0.05); // otros 600 s simulados (900 s totales), bien lejos de saturar capacity=8000
    const stats900 = e.getStats();
    const dep900 = stats900.deposited[gravelIdx];

    // invariante de masa, por clase y en total, tras la ventana larga
    for (let c = 0; c < GRAIN_CLASSES.length; c++) {
      expect(stats900.injected[c]).toBe(stats900.exited[c] + stats900.deposited[c] + stats900.suspended[c]);
    }
    expect(stats900.saturated).toBe(false);

    // crecimiento monótono y sustancial: no hay resuspensión posible a estos parámetros
    // (ver test anterior), así que el depósito de grava solo puede subir con el tiempo.
    expect(dep900).toBeGreaterThan(dep300);
    expect(dep900).toBeGreaterThan(dep300 * 1.5);

    // el depósito de grava está concentrado cerca de la entrada al remanso (donde tau cruza
    // tauCe), no disperso al azar por todo el tramo: confirma que no hay un bug de índice de
    // bin. Bin del borde de entrada al remanso ≈ floor(POOL_START*N_BINS) - unos pocos bins.
    const bins = e.getBinsSnapshot();
    const poolEdgeBin = Math.floor(POOL_START * N_BINS);
    let nearEdge = 0;
    let totalGravelBins = 0;
    for (let b = 0; b < N_BINS; b++) {
      const v = bins[gravelIdx * N_BINS + b];
      totalGravelBins += v;
      if (b >= poolEdgeBin - 4 && b <= poolEdgeBin) nearEdge += v;
    }
    expect(totalGravelBins).toBe(dep900);
    expect(nearEdge / totalGravelBins).toBeGreaterThan(0.9);
  });
});
