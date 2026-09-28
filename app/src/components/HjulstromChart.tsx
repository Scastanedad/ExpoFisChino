import { useMemo } from "react";
import { GRAIN_CLASSES, criticalDepositionVelocity, criticalErosionVelocity, makeCurveClass } from "../sim/physics";

interface Props {
  velocity: number;
  depth: number;
}

const W = 520;
const H = 340;
// Márgenes generosos: UX-02 subió el tamaño de los ticks/ejes SVG (modo proyector), así que
// necesitan más aire para no recortarse contra el borde del viewBox.
const M = { l: 58, r: 22, t: 16, b: 48 };
const X0 = Math.log10(1e-3); // 0.001 mm
const X1 = Math.log10(100); // 100 mm
const Y0 = Math.log10(0.02);
const Y1 = Math.log10(10);

const px = (dMm: number) => M.l + ((Math.log10(dMm) - X0) / (X1 - X0)) * (W - M.l - M.r);
const py = (u: number) => H - M.b - ((Math.log10(u) - Y0) / (Y1 - Y0)) * (H - M.t - M.b);

export default function HjulstromChart({ velocity, depth }: Props) {
  const curves = useMemo(() => {
    const pts: { d: number; ue: number; ud: number }[] = [];
    for (let k = 0; k <= 90; k++) {
      const dMm = Math.pow(10, X0 + (k / 90) * (X1 - X0));
      const c = makeCurveClass(dMm / 1000);
      pts.push({ d: dMm, ue: criticalErosionVelocity(c, depth), ud: criticalDepositionVelocity(c, depth) });
    }
    return pts;
  }, [depth]);

  const clampU = (u: number) => Math.min(10, Math.max(0.02, u));
  const eroPath = curves.map((p, i) => `${i ? "L" : "M"}${px(p.d).toFixed(1)},${py(clampU(p.ue)).toFixed(1)}`).join(" ");
  const depPath = curves.map((p, i) => `${i ? "L" : "M"}${px(p.d).toFixed(1)},${py(clampU(p.ud)).toFixed(1)}`).join(" ");
  const areaTop = `M${px(curves[0].d)},${M.t} ` + curves.map((p) => `L${px(p.d).toFixed(1)},${py(clampU(p.ue)).toFixed(1)}`).join(" ") + ` L${px(curves[curves.length - 1].d)},${M.t} Z`;

  const xTicks = [0.001, 0.01, 0.1, 1, 10, 100];
  const yTicks = [0.05, 0.1, 0.5, 1, 5];
  const uY = py(clampU(velocity));

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="hj-title hj-desc">
        <title id="hj-title">Diagrama de Hjulström del modelo</title>
        <desc id="hj-desc">
          Velocidad media del agua frente al tamaño de grano, con las zonas de erosión, transporte y deposición, y la velocidad actual como línea horizontal.
        </desc>
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="var(--surface-2)" />
        <path d={areaTop} fill="rgba(224,87,74,0.16)" />
        {xTicks.map((t) => (
          <g key={t}>
            <line x1={px(t)} x2={px(t)} y1={M.t} y2={H - M.b} stroke="var(--line)" strokeWidth="1" />
            <text x={px(t)} y={H - M.b + 16} textAnchor="middle" className="tick">
              {t}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={M.l - 6} y={py(t) + 4} textAnchor="end" className="tick">
              {t}
            </text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" className="axis">
          Tamaño de grano (mm, escala log)
        </text>
        <text transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis">
          Velocidad media (m/s, escala log)
        </text>

        <text x={W - M.r - 8} y={M.t + 18} textAnchor="end" className="zone" fill="var(--danger)">
          EROSIÓN
        </text>
        <text
          transform={`translate(${px(1.4).toFixed(1)} ${((M.t + (H - M.b)) / 2).toFixed(1)}) rotate(-90)`}
          textAnchor="middle"
          className="zone halo"
          fill="var(--accent)"
        >
          TRANSPORTE
        </text>
        <text x={px(0.02)} y={H - M.b - 8} textAnchor="middle" className="zone" fill="var(--muted)">
          DEPOSICIÓN
        </text>

        <path d={eroPath} fill="none" stroke="var(--danger)" strokeWidth="2.4" />
        <path d={depPath} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeDasharray="6 4" />

        <line x1={M.l} x2={W - M.r} y1={uY} y2={uY} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="2 3" />
        <text x={M.l + 6} y={uY - 5} className="tick" fill="var(--ink)">
          U = {velocity.toFixed(2)} m/s
        </text>
        {GRAIN_CLASSES.map((c) => (
          <circle
            key={c.id}
            cx={px(c.d * 1000)}
            cy={uY}
            r="6"
            fill={c.color}
            stroke="rgba(238,242,245,0.9)"
            strokeWidth="1.5"
          >
            <title>{c.label}</title>
          </circle>
        ))}
      </svg>
      <figcaption>
        Curva roja: velocidad necesaria para erosionar cada grano. Curva azul discontinua: por debajo el grano se deposita. Los puntos son las clases de la mezcla a la velocidad actual (h = {depth.toFixed(1)} m). Curvas del
        modelo, no datos empíricos.
      </figcaption>
    </figure>
  );
}
