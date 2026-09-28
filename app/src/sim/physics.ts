/**
 * Física del transporte de sedimentos (funciones puras, sin dependencias de UI).
 *
 * Referencias:
 *  - D* (dStar): tamaño de grano adimensional, Soulsby (1997) "Dynamics of Marine Sands",
 *    Thomas Telford, ec. estándar D* = [g(s-1)/ν²]^(1/3)·d. Validado: para d=0.25mm da D*≈6.3
 *    (rango típico de arena media), consistente con las tablas publicadas del libro.
 *  - settlingVelocity (ws): fórmula empírica de Soulsby (1997) para velocidad de caída de
 *    granos naturales, ws = (ν/d)·[√(10.36² + 1.049·D*³) − 10.36]. Es la fórmula de ajuste
 *    más citada en la literatura de ingeniería costera/fluvial (p.ej. reproducida en
 *    van Rijn 1993, USACE CEM). Validado con el caso de referencia: arena de 0.25mm → ws≈36 mm/s
 *    (dentro del rango tabulado 33–39 mm/s para agua a 20°C), ver prueba en sim.test.ts.
 *  - shieldsCritical (θcr): Soulsby & Whitehouse (1997), fórmula de ajuste de la curva de
 *    Shields, θcr = 0.3/(1+1.2D*) + 0.055·[1−exp(−0.02D*)]. Misma fuente que D* y ws; es la
 *    forma cerrada estándar que evita leer la curva de Shields gráficamente.
 *  - Rouse: modo de transporte según P = ws / (κ u*) (Rouse 1937); los umbrales de P
 *    (2.5 / 1.2 / 0.8) usados en transportMode() son los de uso común en textos de
 *    hidráulica fluvial (p.ej. van Rijn) para clasificar carga de fondo / suspensión / lavado.
 *
 *  Umbrales cohesivos (arcilla τce=1.0 Pa, limo τce=0.3 Pa, τcd=0.3·τce):
 *  A diferencia de Shields/Soulsby (que da una fórmula cerrada única), el esfuerzo crítico de
 *  erosión de sedimento cohesivo NO tiene una fórmula universal: depende fuertemente de la
 *  densidad seca/grado de consolidación, contenido de arcilla, mineralogía y biología del
 *  lecho (Mehta & Partheniades 1982; Whitehouse, Soulsby, Roberts & Mitchener 2000,
 *  "Dynamics of Estuarine Muds", Thomas Telford — manual estándar que da correlaciones
 *  τce = f(densidad seca) en vez de un único número). Una revisión reciente de la literatura
 *  (Zhu et al. 2021, "Critical Shear Stress for Erosion of Sand-Mud Mixtures and Pure Mud",
 *  Frontiers in Marine Science, https://doi.org/10.3389/fmars.2021.713039) reporta que los
 *  valores típicos reportados en la literatura caen en el rango 0.1 Pa < τce < 5 Pa.
 *  Nuestros valores (arcilla 1.0 Pa, limo 0.3 Pa) están dentro de ese rango y mantienen el
 *  orden correcto (arcilla más cohesiva que limo, limo más cohesiva que arena que ya es
 *  no-cohesiva según Shields), pero SON valores representativos elegidos para que la curva
 *  de Hjulström resultante tenga la forma cualitativa correcta (mínimo de erosión en limo fino
 *  y meseta de resistencia en arcilla), no una calibración a un sitio o dataset real.
 *  Se marcan explícitamente como "valor pedagógico documentado" — para un caso real habría
 *  que medirlo in situ o usar las correlaciones de densidad de Whitehouse et al. (2000).
 *  τcd = 0.3·τce (histéresis erosión/depósito) es la relación de orden de magnitud típica
 *  citada en la literatura de Krone/Partheniades (τcd < τce siempre en sedimento cohesivo);
 *  el factor exacto 0.3 también es pedagógico.
 */

export const G = 9.81; // m/s²
export const NU = 1e-6; // viscosidad cinemática del agua (m²/s, 20 °C)
export const RHO_W = 1000; // kg/m³
export const RHO_S = 2650; // kg/m³ (cuarzo)
export const S_REL = RHO_S / RHO_W;
export const KAPPA = 0.41; // von Kármán
export const Z0 = 0.001; // rugosidad hidráulica del lecho (m): lecho natural rugoso

export interface GrainClass {
  id: string;
  label: string;
  /** diámetro (m) */
  d: number;
  color: string;
  cohesive: boolean;
  /** esfuerzo cortante crítico de erosión cohesivo (Pa), solo si cohesive */
  tauCohesion?: number;
  /** fracción por defecto en la mezcla que entra al río */
  defaultShare: number;
  /** τcd/τce (histéresis de deposición); por defecto 0.3 si es cohesivo, 1 si no */
  depFactor?: number;
}

export const GRAIN_CLASSES: GrainClass[] = [
  { id: "arcilla", label: "Arcilla", d: 2e-6, color: "#3a2a1e", cohesive: true, tauCohesion: 1.0, defaultShare: 15 },
  { id: "limo", label: "Limo", d: 2e-5, color: "#7d5a35", cohesive: true, tauCohesion: 0.3, defaultShare: 20 },
  { id: "arena-fina", label: "Arena fina", d: 1.25e-4, color: "#c08a3f", cohesive: false, defaultShare: 30 },
  { id: "arena", label: "Arena media", d: 5e-4, color: "#e0a95c", cohesive: false, defaultShare: 25 },
  { id: "grava", label: "Grava", d: 4e-3, color: "#d6cdbd", cohesive: false, defaultShare: 10 },
];

/** Tamaño de grano adimensional D* */
export function dStar(d: number): number {
  return Math.cbrt(((S_REL - 1) * G * d ** 3) / NU ** 2);
}

/** Velocidad de caída (m/s), Soulsby (1997). */
export function settlingVelocity(d: number): number {
  const ds = dStar(d);
  return (NU / d) * (Math.sqrt(10.36 ** 2 + 1.049 * ds ** 3) - 10.36);
}

/** Parámetro de Shields crítico, Soulsby & Whitehouse (1997). */
export function shieldsCritical(d: number): number {
  const ds = dStar(d);
  return 0.3 / (1 + 1.2 * ds) + 0.055 * (1 - Math.exp(-0.02 * ds));
}

/** Esfuerzo cortante crítico de erosión τce (Pa). */
export function tauCritErosion(c: GrainClass): number {
  const nonCohesive = shieldsCritical(c.d) * (RHO_S - RHO_W) * G * c.d;
  return Math.max(nonCohesive, c.cohesive ? (c.tauCohesion ?? 0) : 0);
}

/** Esfuerzo cortante crítico de deposición τcd (Pa). Menor que τce en cohesivos (histéresis). */
export function tauCritDeposition(c: GrainClass): number {
  return tauCritErosion(c) * (c.depFactor ?? (c.cohesive ? 0.3 : 1));
}

/** Velocidad de corte u* (m/s) a partir de la velocidad media U y la profundidad h (perfil logarítmico). */
export function shearVelocity(U: number, h: number): number {
  const k = Math.log(h / Z0) - 1;
  return (U * KAPPA) / Math.max(k, 0.5);
}

/** Velocidad media U (m/s) que produce una velocidad de corte dada. */
export function meanVelocityFromShear(uStar: number, h: number): number {
  const k = Math.log(h / Z0) - 1;
  return (uStar * Math.max(k, 0.5)) / KAPPA;
}

/** Número de Rouse P = ws / (κ u*). */
export function rouseNumber(ws: number, uStar: number): number {
  return ws / (KAPPA * Math.max(uStar, 1e-6));
}

export type TransportMode = "carga de fondo" | "suspensión parcial" | "suspensión total" | "carga de lavado";

export function transportMode(P: number): TransportMode {
  if (P > 2.5) return "carga de fondo";
  if (P > 1.2) return "suspensión parcial";
  if (P > 0.8) return "suspensión total";
  return "carga de lavado";
}

/** Velocidad media crítica de erosión (m/s) para una clase y profundidad h. */
export function criticalErosionVelocity(c: GrainClass, h: number): number {
  return meanVelocityFromShear(Math.sqrt(tauCritErosion(c) / RHO_W), h);
}

/** Velocidad media crítica de deposición (m/s). */
export function criticalDepositionVelocity(c: GrainClass, h: number): number {
  return meanVelocityFromShear(Math.sqrt(tauCritDeposition(c) / RHO_W), h);
}

/** Cohesión (Pa) en función del diámetro: 1 Pa (2 µm) → 0.3 Pa (20 µm) → 0 (125 µm), lineal en log d. */
function cohesionLevel(d: number): number {
  const l = Math.log10(d);
  if (l <= Math.log10(2e-6)) return 1;
  if (l <= Math.log10(2e-5)) return 1 - 0.7 * ((l - Math.log10(2e-6)) / 1);
  if (l >= Math.log10(1.25e-4)) return 0;
  return 0.3 * (1 - (l - Math.log10(2e-5)) / (Math.log10(1.25e-4) - Math.log10(2e-5)));
}

/** Clase "continua" para dibujar las curvas del gráfico tipo Hjulström a partir del mismo modelo. */
export function makeCurveClass(d: number): GrainClass {
  const tauCohesion = cohesionLevel(d);
  const w = Math.min(1, tauCohesion / 0.3);
  return {
    id: "curva",
    label: "",
    d,
    color: "",
    cohesive: tauCohesion > 0,
    tauCohesion,
    defaultShare: 0,
    depFactor: 1 - 0.7 * w,
  };
}
