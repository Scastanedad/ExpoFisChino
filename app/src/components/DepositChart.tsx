import { GRAIN_CLASSES } from "../sim/physics";
import { N_BINS, RIVER_LENGTH, type SimStats } from "../sim/engine";

const W = 520;
const H = 260;
// Márgenes generosos: UX-02 subió el tamaño de los ticks/ejes SVG (modo proyector).
const M = { l: 50, r: 18, t: 14, b: 44 };

export default function DepositChart({ stats }: { stats: SimStats }) {
  const nC = GRAIN_CLASSES.length;
  const totals: number[] = [];
  for (let b = 0; b < N_BINS; b++) {
    let t = 0;
    for (let c = 0; c < nC; c++) t += stats.depositBins[c * N_BINS + b];
    totals.push(t);
  }
  const max = Math.max(10, ...totals);
  const bw = (W - M.l - M.r) / N_BINS;
  const yScale = (v: number) => ((H - M.t - M.b) * v) / max;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="dp-title">
        <title id="dp-title">Dónde se deposita el sedimento a lo largo del río</title>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--line)" />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--line)" />
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={M.l - 6} y={H - M.b - yScale(max * f) + 4} textAnchor="end" className="tick">
            {Math.round(max * f)}
          </text>
        ))}
        {[0, 20, 40, 60, 80, 100].map((m) => (
          <text key={m} x={M.l + (m / RIVER_LENGTH) * (W - M.l - M.r)} y={H - M.b + 16} textAnchor="middle" className="tick">
            {m}
          </text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" className="axis">
          Distancia aguas abajo (m)
        </text>
        <text transform={`translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis">
          Partículas depositadas
        </text>
        {Array.from({ length: N_BINS }, (_, b) => {
          let y = H - M.b;
          return (
            <g key={b}>
              {GRAIN_CLASSES.map((c, ci) => {
                const n = stats.depositBins[ci * N_BINS + b];
                if (n <= 0) return null;
                const hh = yScale(n);
                y -= hh;
                return <rect key={c.id} x={M.l + b * bw} y={y} width={bw - 0.5} height={hh} fill={c.color} />;
              })}
            </g>
          );
        })}
      </svg>
      <figcaption>Depósito por tramo de 2 m, apilado por tamaño de grano.</figcaption>
    </figure>
  );
}
