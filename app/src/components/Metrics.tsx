import { GRAIN_CLASSES, RHO_W, rouseNumber, settlingVelocity, shearVelocity, tauCritErosion, transportMode } from "../sim/physics";
import type { SimParams, SimStats, WindowStats } from "../sim/engine";

interface Props {
  stats: SimStats;
  params: SimParams;
  /** Tasas de régimen "ventana móvil" (ver getWindowStats en src/sim/engine.ts). Complementa los acumulados: se mueve mucho antes que el % acumulado a U bajas/medias (UX-05). El propio WindowStats ya trae requestedWindowSeconds/actualWindowSeconds para mostrar. */
  windowStats: WindowStats;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);
const ratioPct = (r: number) => Math.round(100 * r);

export default function Metrics({ stats, params, windowStats }: Props) {
  const inj = sum(stats.injected);
  const out = sum(stats.exited);
  const dep = sum(stats.deposited);
  const sus = sum(stats.suspended);
  const uStar = shearVelocity(params.velocity, params.depth);
  const tau = RHO_W * uStar * uStar;
  const windowTooShort = windowStats.actualWindowSeconds < windowStats.requestedWindowSeconds * 0.9;

  return (
    <section className="panel" aria-label="Resultados">
      <h2>Resultados</h2>

      <div className="kpis">
        <div className="kpi transported">
          <span className="kpi-label">Transportado hasta la salida</span>
          <strong>{pct(out, inj)} %</strong>
          <span className="kpi-sub">{out.toLocaleString("es")} partículas</span>
        </div>
        <div className="kpi deposited">
          <span className="kpi-label">Depositado en el lecho</span>
          <strong>{pct(dep, inj)} %</strong>
          <span className="kpi-sub">{dep.toLocaleString("es")} partículas</span>
        </div>
        <div className="kpi moving">
          <span className="kpi-label">Aún en el agua</span>
          <strong>{pct(sus, inj)} %</strong>
          <span className="kpi-sub">{sus.toLocaleString("es")} partículas</span>
        </div>
      </div>

      <div
        className="stackbar"
        role="img"
        aria-label={`Transportado ${pct(out, inj)} %, depositado ${pct(dep, inj)} %, en el agua ${pct(sus, inj)} %`}
      >
        <span style={{ width: `${pct(out, inj)}%` }} className="seg transported" />
        <span style={{ width: `${pct(dep, inj)}%` }} className="seg deposited" />
        <span style={{ width: `${pct(sus, inj)}%` }} className="seg moving" />
      </div>

      {stats.saturated && (
        <p className="note warn" role="status">
          El lecho alcanzó la capacidad máxima de partículas: reinicia o aumenta la velocidad para seguir observando.
        </p>
      )}

      <details className="results-more">
        <summary>Ver régimen actual, tabla por grano y u*/τ</summary>
        <h3>Régimen actual (últimos {Math.round(windowStats.actualWindowSeconds)} s de simulación)</h3>
      <p className="muted">
        A diferencia de los acumulados de arriba (que dependen de cuánto lleva corriendo la simulación desde el
        reinicio), esto describe lo que está pasando <em>ahora mismo</em>: cuánto sale y entra por segundo, y si el
        tramo deja pasar tanto sedimento como recibe.
      </p>
      <div className="kpis">
        <div className="kpi moving">
          <span className="kpi-label">Sale por la salida</span>
          <strong>{windowStats.totalOutflowRate.toFixed(1)}</strong>
          <span className="kpi-sub">partículas/s</span>
        </div>
        <div className="kpi moving">
          <span className="kpi-label">Entra (aporte)</span>
          <strong>{windowStats.totalInflowRate.toFixed(1)}</strong>
          <span className="kpi-sub">partículas/s</span>
        </div>
        <div className="kpi transported">
          <span className="kpi-label">Capacidad de transporte relativa</span>
          <strong>{ratioPct(windowStats.totalTransportCapacity)} %</strong>
          <span className="kpi-sub">salida / aporte · ~100% = estacionario</span>
        </div>
      </div>
      {windowTooShort && (
        <p className="muted">
          La simulación (o el escenario actual) lleva poco tiempo corriendo: esta ventana cubre{" "}
          {windowStats.actualWindowSeconds.toFixed(1)} s de los {windowStats.requestedWindowSeconds} s pedidos, así
          que todavía puede cambiar rápido.
        </p>
      )}

      <p className="muted">
        Velocidad de corte u* = {(uStar * 100).toFixed(1)} cm/s · esfuerzo en el lecho τ = {tau.toFixed(2)} Pa
      </p>

      <div className="table-wrap">
        <table>
          <caption className="sr-only">Resultados por tamaño de grano</caption>
          <thead>
            <tr>
              <th scope="col">Grano</th>
              <th scope="col" title="Número de Rouse: ws / (κ u*)">
                Rouse
              </th>
              <th scope="col">Modo de transporte</th>
              <th scope="col" title="Esfuerzo actual / esfuerzo crítico de erosión">
                τ/τce
              </th>
              <th scope="col">Salió</th>
              <th scope="col">Depositado</th>
              <th scope="col" title={`Salida por segundo en los últimos ${Math.round(windowStats.actualWindowSeconds)} s`}>
                Salida (part/s)
              </th>
              <th scope="col" title="Salida / aporte en la ventana actual (régimen), no acumulado desde el inicio">
                Capacidad
              </th>
            </tr>
          </thead>
          <tbody>
            {GRAIN_CLASSES.map((c, i) => {
              const P = rouseNumber(settlingVelocity(c.d), uStar);
              const ratio = tau / tauCritErosion(c);
              return (
                <tr key={c.id}>
                  <th scope="row">
                    <i className="dot" style={{ background: c.color }} aria-hidden="true" />
                    {c.label}
                  </th>
                  <td>{P < 100 ? P.toFixed(2) : ">100"}</td>
                  <td>{transportMode(P)}</td>
                  <td className={ratio >= 1 ? "pos" : "neg"}>{ratio.toFixed(2)}</td>
                  <td>{pct(stats.exited[i], stats.injected[i])} %</td>
                  <td>{pct(stats.deposited[i], stats.injected[i])} %</td>
                  <td>{windowStats.outflowRate[i].toFixed(2)}</td>
                  <td>{ratioPct(windowStats.transportCapacity[i])} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        τ/τce ≥ 1: el flujo puede mover (erosionar) ese grano; &lt; 1: tiende a depositarse.
      </p>
      </details>
    </section>
  );
}
