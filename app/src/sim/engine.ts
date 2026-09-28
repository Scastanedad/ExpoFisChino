import {
  GRAIN_CLASSES,
  KAPPA,
  RHO_W,
  Z0,
  settlingVelocity,
  shearVelocity,
  tauCritDeposition,
  tauCritErosion,
  type GrainClass,
} from "./physics";

/** Longitud del tramo de río simulado (m). */
export const RIVER_LENGTH = 100;
/** Celdas para el campo hidráulico y bins del histograma de depósito. */
export const NX = 400;
export const N_BINS = 50;
/** Tramo lento (remanso): fracción de la longitud donde el río se profundiza. */
export const POOL_START = 0.5;
export const POOL_END = 0.7;
/**
 * Zona de entrada (m) desde x=0: las partículas no pueden depositarse aquí (quedan en
 * suspensión/rebotan cerca del lecho). Evita el artefacto de que una partícula recién
 * inyectada (posición vertical aleatoria, sin desarrollo de perfil) se deposite de forma
 * casi instantánea a un paso de tiempo de haber entrado, lo que contaminaría el conteo de
 * depósito con un efecto de borde numérico en vez de física de transporte real.
 * Valor pedagógico/ingenieril (no de literatura): ~10 m es suficiente para varios tiempos de
 * mezcla vertical h/(κu*) a las velocidades típicas de la app.
 */
export const ENTRY_BUFFER = 10;

/**
 * Realimentación lecho → flujo (morfodinámica, ecuación de Exner discretizada por bins).
 *
 * Cada partícula lagrangiana representa una "parcela" de sedimento de volumen fijo. Al
 * depositarse eleva el lecho de su bin (2 m de ancho) en `BED_DZ_PER_PARTICLE` metros, y al
 * resuspenderse lo baja lo mismo: dz_b/dt = (D − E)·V/(Δx·(1−λ)) (Exner, 1925), con el volumen de
 * la parcela y la porosidad λ absorbidos en esta única constante. El lecho elevado reduce la
 * profundidad local del agua; por continuidad (q = U·h constante) U y u* suben, τ sube, y el
 * depósito se detiene por sí solo cuando τ alcanza τce. Eso sustituye el crecimiento "infinito"
 * en un solo bin (sin realimentación) por el comportamiento natural: la barra crece hasta su
 * altura de equilibrio y luego su frente avanza aguas abajo (progradación de un delta).
 * Valor pedagógico: 1 cm por parcela en un bin de 2 m hace que un remanso se colmate en minutos
 * de simulación (visible en la expo), no en años.
 */
export const BED_DZ_PER_PARTICLE = 0.005;
/**
 * Pendiente máxima estable del lecho (tangente del ángulo de reposo). Para arena/grava
 * sumergida el ángulo de reposo es ~30–35° (p.ej. van Rijn 1993); se usa 32° → tan ≈ 0.62.
 * Si la diferencia de cota entre dos bins vecinos supera Δx·tanφ, las parcelas del bin alto
 * "avalanchan" al vecino más bajo (cara de avalancha de una barra/delta).
 */
export const REPOSE_TAN = Math.tan((32 * Math.PI) / 180);
/**
 * Lámina de agua mínima sobre el depósito, como fracción de la profundidad aguas arriba.
 * Guardarraíl: un bin cuyo lecho llegó a este tope ya no acepta más depósito (sin espacio de
 * acomodación) y el sedimento sigue de largo como carga de fondo por encima de él.
 */
export const MIN_WATER_FRACTION = 0.1;

export interface SimParams {
  /** velocidad media aguas arriba (m/s) */
  velocity: number;
  /** profundidad aguas arriba (m) */
  depth: number;
  /** factor de profundización del remanso (1 = sin remanso) */
  poolFactor: number;
  /** partículas inyectadas por segundo de simulación */
  feedRate: number;
  /** pesos (%) de cada clase de grano en la mezcla que entra */
  mix: number[];
  /**
   * Si es true, un cambio en un parámetro "clave" (velocity, depth, poolFactor, feedRate o mix)
   * respecto al setParams() anterior dispara automáticamente un reset() del motor (partículas,
   * contadores e historial de getWindowStats). Por defecto false/undefined: el motor NO decide
   * cuándo resetear, solo expone el mecanismo. La decisión de política de UX (p.ej. resetear al
   * mover el slider vs. dejar que el usuario decida con un botón) es de la capa de React.
   */
  resetOnChange?: boolean;
}

/** Compara los campos "clave" de dos SimParams (ignora resetOnChange). */
function keyParamsChanged(a: SimParams, b: SimParams): boolean {
  if (a.velocity !== b.velocity || a.depth !== b.depth || a.poolFactor !== b.poolFactor || a.feedRate !== b.feedRate) {
    return true;
  }
  if (a.mix.length !== b.mix.length) return true;
  for (let i = 0; i < a.mix.length; i++) if (a.mix[i] !== b.mix[i]) return true;
  return false;
}

/**
 * Interpolación C2-continua (Ken Perlin, "smootherstep": 6t^5-15t^4+10t^3) usada para la
 * transición de profundidad en los bordes del remanso. Es una elección de suavizado
 * geométrico/numérico (evita picos artificiales en dh/dx y por lo tanto en dτ/dx cerca de
 * los bordes 50 m/70 m), no una fórmula de física de flujo.
 */
function smootherstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export interface SimStats {
  injected: number[];
  exited: number[];
  deposited: number[];
  suspended: number[];
  /** histograma de depósito: clase * N_BINS + bin */
  depositBins: Int32Array;
  saturated: boolean;
  time: number;
}

/**
 * Estadísticas de régimen "ventana móvil" (contrato consumido por la UI de resultados).
 * A diferencia de SimStats (contadores acumulados desde t=0, que dependen de cuánto tiempo
 * lleva corriendo la simulación), estas tasas se calculan sobre los últimos `actualWindowSeconds`
 * de simulación, por lo que reflejan el régimen "actual" (estacionario si los parámetros no
 * cambiaron en esa ventana) y son comparables entre corridas de distinta duración.
 * Todos los arreglos por clase están indexados igual que SedimentEngine.classes.
 */
export interface WindowStats {
  /** ventana pedida por el llamador (s) */
  requestedWindowSeconds: number;
  /**
   * ventana realmente cubierta por el historial (s). Puede ser menor que la pedida si la
   * simulación lleva corriendo poco tiempo, o si el historial (acotado en tamaño) ya no
   * retiene una muestra tan antigua. La UI debe mostrar esto (o al menos avisar) cuando
   * actualWindowSeconds < requestedWindowSeconds, en vez de asumir que la ventana pedida
   * siempre se cumplió.
   */
  actualWindowSeconds: number;
  /** flujo de salida por clase (partículas/s) en la ventana */
  outflowRate: number[];
  /** flujo de inyección/aporte por clase (partículas/s) en la ventana */
  inflowRate: number[];
  /** tasa neta de depósito por clase (partículas/s); positivo = se acumula, negativo = erosión neta */
  netDepositionRate: number[];
  /**
   * "capacidad de transporte relativa" por clase = salida/aporte en la ventana (adimensional).
   * ~1 = régimen estacionario (lo que entra, sale); <1 = el tramo está reteniendo/depositando
   * más de lo que deja pasar; >1 = el tramo está liberando un remanente acumulado antes.
   * Si no hubo aporte de esa clase en la ventana (inflowRate=0), se define como 0 en vez de
   * NaN/Infinity para que sea seguro de graficar.
   */
  transportCapacity: number[];
  /** agregados sobre todas las clases (suma de los arreglos de arriba, capacidad recalculada) */
  totalOutflowRate: number;
  totalInflowRate: number;
  totalNetDepositionRate: number;
  totalTransportCapacity: number;
}

/** Estados de cada partícula */
export const FREE = 0;
export const SUSPENDED = 1;
export const DEPOSITED = 2;

const E0 = 0.2; // tasa base de resuspensión (1/s) por exceso de esfuerzo
const BIN_WIDTH = RIVER_LENGTH / N_BINS; // ancho de bin (m)

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SedimentEngine {
  readonly capacity: number;
  readonly classes: GrainClass[];
  // Estado de partículas (arrays tipados; viven fuera del estado de React)
  readonly x: Float32Array;
  readonly s: Float32Array; // coordenada sigma z/h ∈ [0,1]
  readonly cls: Uint8Array;
  readonly state: Uint8Array;

  // Campo hidráulico por celda
  /** profundidad geométrica base (sin depósito), impuesta por depth/poolFactor */
  readonly h0Arr = new Float32Array(NX);
  /** profundidad efectiva del agua = h0 − espesor del depósito (lo que ve la hidráulica) */
  readonly hArr = new Float32Array(NX);
  readonly uMeanArr = new Float32Array(NX);
  readonly uStarArr = new Float32Array(NX);

  // Propiedades por clase
  private ws: Float64Array;
  private tauCe: Float64Array;
  private tauCd: Float64Array;

  params: SimParams;
  private injected: number[];
  private exited: number[];
  private deposited: number[];
  private depositBins: Int32Array;
  /** espesor del depósito por bin (m), = conteo total del bin · BED_DZ_PER_PARTICLE */
  private bedBin = new Float64Array(N_BINS);
  /** profundidad base en el centro de cada bin (m) */
  private h0Bin = new Float64Array(N_BINS);
  private hMin = 0.1;
  private bedDirty = false;
  private readonly firstDepositBin = Math.ceil((ENTRY_BUFFER / RIVER_LENGTH) * N_BINS);
  private saturated = false;
  private time = 0;
  private injectAcc = 0;
  private freeCursor = 0;
  private rand: () => number;
  private spare: number | null = null;
  private mixCdf: number[] = [];

  // Historial para getWindowStats(): snapshots periódicos de los contadores acumulados.
  private history: { time: number; injected: number[]; exited: number[]; deposited: number[] }[] = [];
  private historyAcc = 0;
  private readonly historySampleInterval: number;
  private readonly historyMaxSamples: number;

  constructor(
    opts: {
      capacity?: number;
      seed?: number;
      classes?: GrainClass[];
      /** cada cuántos segundos de simulación se guarda una muestra para getWindowStats (default 0.2 s) */
      historySampleInterval?: number;
      /** cuántas muestras retener como máximo (default 3000; con el intervalo por defecto ≈10 min de historial) */
      historyMaxSamples?: number;
    } = {},
  ) {
    this.capacity = opts.capacity ?? 8000;
    this.classes = opts.classes ?? GRAIN_CLASSES;
    const n = this.classes.length;
    this.x = new Float32Array(this.capacity);
    this.s = new Float32Array(this.capacity);
    this.cls = new Uint8Array(this.capacity);
    this.state = new Uint8Array(this.capacity);
    this.ws = Float64Array.from(this.classes.map((c) => settlingVelocity(c.d)));
    this.tauCe = Float64Array.from(this.classes.map(tauCritErosion));
    this.tauCd = Float64Array.from(this.classes.map(tauCritDeposition));
    this.injected = new Array(n).fill(0);
    this.exited = new Array(n).fill(0);
    this.deposited = new Array(n).fill(0);
    this.depositBins = new Int32Array(n * N_BINS);
    this.rand = mulberry32(opts.seed ?? 12345);
    this.historySampleInterval = opts.historySampleInterval ?? 0.2;
    this.historyMaxSamples = opts.historyMaxSamples ?? 3000;
    this.params = {
      velocity: 0.6,
      depth: 1,
      poolFactor: 1,
      feedRate: 20,
      mix: this.classes.map((c) => c.defaultShare),
    };
    this.setParams(this.params);
    this.pushHistorySnapshot();
  }

  setParams(p: SimParams) {
    const prev = this.params;
    const shouldReset = !!p.resetOnChange && keyParamsChanged(prev, p);
    this.params = { ...p, mix: [...p.mix] };
    const { depth, poolFactor } = this.params;
    const ramp = 0.08; // fracción de la longitud usada para suavizar el remanso (8 m a cada lado del tramo 50-70 m)
    for (let i = 0; i < NX; i++) {
      const f = (i + 0.5) / NX;
      let w: number;
      if (f <= POOL_START - ramp) w = 0;
      else if (f < POOL_START) w = smootherstep((f - (POOL_START - ramp)) / ramp);
      else if (f <= POOL_END) w = 1;
      else if (f < POOL_END + ramp) w = 1 - smootherstep((f - POOL_END) / ramp);
      else w = 0;
      this.h0Arr[i] = depth * (1 + (poolFactor - 1) * w);
    }
    for (let b = 0; b < N_BINS; b++) this.h0Bin[b] = this.h0Arr[this.cell(((b + 0.5) / N_BINS) * RIVER_LENGTH)];
    this.hMin = MIN_WATER_FRACTION * depth;
    this.updateHydraulics();
    let total = 0;
    this.mixCdf = this.params.mix.map((m) => (total += Math.max(0, m)));
    if (total > 0) this.mixCdf = this.mixCdf.map((v) => v / total);
    else this.mixCdf = this.mixCdf.map(() => 0);
    if (shouldReset) this.reset();
  }

  /**
   * Recalcula h, U, u* por celda a partir de la geometría base y el espesor del depósito.
   * El espesor por bin se interpola linealmente entre centros de bin para que τ(x) no tenga
   * saltos escalonados cada 2 m (que crearían barras espurias en los bordes de bin).
   */
  private updateHydraulics() {
    const q = this.params.velocity * this.params.depth; // caudal por unidad de ancho (continuidad)
    for (let i = 0; i < NX; i++) {
      const fb = ((i + 0.5) / NX) * N_BINS - 0.5;
      const b0 = Math.floor(fb);
      const t = fb - b0;
      const lo = b0 < 0 ? 0 : b0;
      const hi = b0 + 1 >= N_BINS ? N_BINS - 1 : b0 + 1;
      const bed = this.bedBin[lo] * (1 - t) + this.bedBin[hi] * t;
      const h = Math.max(this.h0Arr[i] - bed, this.hMin);
      const U = q / h;
      this.hArr[i] = h;
      this.uMeanArr[i] = U;
      this.uStarArr[i] = shearVelocity(U, h);
    }
    this.bedDirty = false;
  }

  /** ¿cabe una parcela más en el bin b sin dejar menos de hMin de agua encima? */
  private hasRoom(b: number): boolean {
    return this.bedBin[b] + BED_DZ_PER_PARTICLE <= this.h0Bin[b] - this.hMin;
  }

  private addToBed(c: number, b: number, sign: 1 | -1) {
    this.depositBins[c * N_BINS + b] += sign;
    this.bedBin[b] = Math.max(0, this.bedBin[b] + sign * BED_DZ_PER_PARTICLE);
    this.bedDirty = true;
  }

  reset() {
    this.state.fill(FREE);
    this.injected.fill(0);
    this.exited.fill(0);
    this.deposited.fill(0);
    this.depositBins.fill(0);
    this.bedBin.fill(0);
    this.updateHydraulics();
    this.saturated = false;
    this.time = 0;
    this.injectAcc = 0;
    this.freeCursor = 0;
    this.history.length = 0;
    this.historyAcc = 0;
    this.pushHistorySnapshot();
  }

  /** Esfuerzo cortante local τ (Pa) en la posición x (m). */
  tauAt(xm: number): number {
    const us = this.uStarAt(xm);
    return RHO_W * us * us;
  }
  uStarAt(xm: number): number {
    return this.uStarArr[this.cell(xm)];
  }
  /** Profundidad efectiva del agua (m) en x: base menos el espesor del depósito. */
  hAt(xm: number): number {
    return this.hArr[this.cell(xm)];
  }
  /** Profundidad geométrica base (m) en x, sin depósito (fondo rocoso/sustrato del tramo). */
  h0At(xm: number): number {
    return this.h0Arr[this.cell(xm)];
  }
  /** Espesor del depósito (m) por bin. Vista directa, sin copia. */
  getBedSnapshot(): Float64Array {
    return this.bedBin;
  }
  private cell(xm: number): number {
    const i = Math.floor((xm / RIVER_LENGTH) * NX);
    return i < 0 ? 0 : i >= NX ? NX - 1 : i;
  }

  private randn(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = this.rand();
    const v = this.rand();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  private pickClass(): number {
    const r = this.rand();
    for (let c = 0; c < this.mixCdf.length; c++) if (r <= this.mixCdf[c]) return c;
    return this.mixCdf.length - 1;
  }

  private inject(dt: number) {
    if (this.mixCdf.length === 0 || this.mixCdf[this.mixCdf.length - 1] === 0) return;
    this.injectAcc += this.params.feedRate * dt;
    while (this.injectAcc >= 1) {
      let slot = -1;
      for (let k = 0; k < this.capacity; k++) {
        const idx = (this.freeCursor + k) % this.capacity;
        if (this.state[idx] === FREE) {
          slot = idx;
          this.freeCursor = (idx + 1) % this.capacity;
          break;
        }
      }
      if (slot < 0) {
        this.saturated = true;
        this.injectAcc = 0;
        return;
      }
      this.injectAcc -= 1;
      const c = this.pickClass();
      this.state[slot] = SUSPENDED;
      this.cls[slot] = c;
      this.x[slot] = 0;
      this.s[slot] = 0.02 + 0.96 * this.rand();
      this.injected[c]++;
    }
  }

  /** Avanza la simulación dtSim segundos (se subdivide en pasos estables). */
  advance(dtSim: number, maxStep = 0.05) {
    const n = Math.max(1, Math.ceil(dtSim / maxStep));
    const dt = dtSim / n;
    for (let k = 0; k < n; k++) this.step(dt);
  }

  step(dt: number) {
    if (this.bedDirty) this.updateHydraulics();
    this.inject(dt);
    this.time += dt;
    this.historyAcc += dt;
    if (this.historyAcc >= this.historySampleInterval) {
      this.historyAcc -= this.historySampleInterval;
      this.pushHistorySnapshot();
    }
    const L = RIVER_LENGTH;
    for (let i = 0; i < this.capacity; i++) {
      const st = this.state[i];
      if (st === FREE) continue;
      const c = this.cls[i];
      const ci = this.cell(this.x[i]);
      const h = this.hArr[ci];
      const us = this.uStarArr[ci];
      const tau = RHO_W * us * us;

      if (st === DEPOSITED) {
        const b = this.bin(this.x[i]);
        // Avalancha: si la cara de la barra supera el ángulo de reposo respecto a un vecino,
        // la parcela se desliza a ese vecino (cota del lecho = espesor − profundidad base).
        const elev = this.bedBin[b] - this.h0Bin[b];
        const maxDiff = BIN_WIDTH * REPOSE_TAN + BED_DZ_PER_PARTICLE;
        let target = -1;
        let drop = maxDiff;
        for (let k = 0; k < 2; k++) {
          const nb = k === 0 ? b + 1 : b - 1;
          if (nb < this.firstDepositBin || nb >= N_BINS) continue;
          const d = elev - (this.bedBin[nb] - this.h0Bin[nb]);
          if (d > drop && this.hasRoom(nb)) {
            drop = d;
            target = nb;
          }
        }
        if (target >= 0) {
          this.addToBed(c, b, -1);
          this.x[i] += (target - b) * BIN_WIDTH;
          this.addToBed(c, target, 1);
          continue;
        }
        const ex = tau / this.tauCe[c];
        if (ex > 1) {
          const p = Math.min(1, E0 * (ex - 1)) * dt;
          if (this.rand() < p) {
            const zb = 0.02 * h;
            const lift = Math.min(0.3 * h, h * 0.03 * Math.sqrt(ex - 1) * this.rand());
            this.state[i] = SUSPENDED;
            this.s[i] = (zb + lift) / h;
            this.deposited[c]--;
            this.addToBed(c, b, -1);
          }
        }
        continue;
      }

      // --- partícula en suspensión / carga de fondo ---
      const zb = 0.02 * h; // altura de referencia del lecho
      let z = this.s[i] * h;
      const zc = Math.min(Math.max(z, zb), h - zb);
      const deps = KAPPA * us * (1 - (2 * zc) / h); // dε/dz
      const zm = Math.min(Math.max(z + 0.5 * deps * dt, zb), h - zb);
      const epsM = KAPPA * us * zm * (1 - zm / h);
      z += (-this.ws[c] + deps) * dt + Math.sqrt(2 * epsM * dt) * this.randn();

      // advección horizontal con perfil logarítmico
      const zl = Math.max(zc, Z0 * Math.E);
      const ux = (us / KAPPA) * Math.log(zl / Z0);
      const xn = this.x[i] + ux * dt;

      if (xn >= L) {
        this.state[i] = FREE;
        this.exited[c]++;
        continue;
      }
      this.x[i] = xn;

      if (z > h - zb) z = Math.max(zb, 2 * (h - zb) - z); // rebote en superficie
      if (z < zb) {
        // contacto con el lecho: ¿se deposita? (no en la zona de entrada, ver ENTRY_BUFFER)
        // Sin espacio de acomodación (lecho ya al tope hMin) la parcela sigue como carga de fondo.
        const bn = this.bin(xn);
        const pd = xn >= ENTRY_BUFFER && this.hasRoom(bn) ? 1 - tau / this.tauCd[c] : 0;
        if (pd > 0 && this.rand() < pd) {
          this.state[i] = DEPOSITED;
          this.deposited[c]++;
          this.addToBed(c, bn, 1);
          continue;
        }
        const ex = tau / this.tauCe[c];
        const lift = ex > 1 ? Math.min(0.3 * h, h * 0.03 * Math.sqrt(ex - 1) * this.rand()) : 0;
        z = zb + lift;
      }
      this.s[i] = z / h;
    }
  }

  private bin(xm: number): number {
    const b = Math.floor((xm / RIVER_LENGTH) * N_BINS);
    return b < 0 ? 0 : b >= N_BINS ? N_BINS - 1 : b;
  }

  /** Vista directa (sin copia) del histograma de depósito, para dibujar cada frame. */
  getBinsSnapshot(): Int32Array {
    return this.depositBins;
  }

  getStats(): SimStats {
    const n = this.classes.length;
    const suspended = new Array(n).fill(0);
    for (let i = 0; i < this.capacity; i++) if (this.state[i] === SUSPENDED) suspended[this.cls[i]]++;
    return {
      injected: [...this.injected],
      exited: [...this.exited],
      deposited: [...this.deposited],
      suspended,
      depositBins: this.depositBins.slice(),
      saturated: this.saturated,
      time: this.time,
    };
  }

  private pushHistorySnapshot() {
    this.history.push({ time: this.time, injected: [...this.injected], exited: [...this.exited], deposited: [...this.deposited] });
    if (this.history.length > this.historyMaxSamples) this.history.shift();
  }

  /**
   * Estadísticas de régimen en una ventana móvil de `windowSeconds` segundos de simulación
   * (ver contrato en WindowStats). No es un promedio de SimStats: recorre el historial de
   * snapshots guardado por step() y usa las diferencias de los contadores acumulados entre
   * "ahora" y la muestra más antigua disponible que sea >= windowSeconds atrás.
   */
  getWindowStats(windowSeconds: number): WindowStats {
    const n = this.classes.length;
    if (this.history.length === 0) this.pushHistorySnapshot();
    const targetTime = this.time - Math.max(0, windowSeconds);
    let base = this.history[0];
    for (const snap of this.history) {
      if (snap.time <= targetTime) base = snap;
      else break;
    }
    const actualWindowSeconds = Math.max(this.time - base.time, this.historySampleInterval * 0.5, 1e-6);

    const outflowRate = new Array(n);
    const inflowRate = new Array(n);
    const netDepositionRate = new Array(n);
    const transportCapacity = new Array(n);
    let dExitTotal = 0;
    let dInjTotal = 0;
    let dDepTotal = 0;
    for (let c = 0; c < n; c++) {
      const dExit = this.exited[c] - base.exited[c];
      const dInj = this.injected[c] - base.injected[c];
      const dDep = this.deposited[c] - base.deposited[c];
      dExitTotal += dExit;
      dInjTotal += dInj;
      dDepTotal += dDep;
      outflowRate[c] = dExit / actualWindowSeconds;
      inflowRate[c] = dInj / actualWindowSeconds;
      netDepositionRate[c] = dDep / actualWindowSeconds;
      transportCapacity[c] = dInj > 0 ? dExit / dInj : 0;
    }

    return {
      requestedWindowSeconds: windowSeconds,
      actualWindowSeconds,
      outflowRate,
      inflowRate,
      netDepositionRate,
      transportCapacity,
      totalOutflowRate: dExitTotal / actualWindowSeconds,
      totalInflowRate: dInjTotal / actualWindowSeconds,
      totalNetDepositionRate: dDepTotal / actualWindowSeconds,
      totalTransportCapacity: dInjTotal > 0 ? dExitTotal / dInjTotal : 0,
    };
  }
}
