import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RiverCanvas from "./components/RiverCanvas";
import Controls from "./components/Controls";
import GuidedExperiments from "./components/GuidedExperiments";
import Metrics from "./components/Metrics";
import HjulstromChart from "./components/HjulstromChart";
import DepositChart from "./components/DepositChart";
import { SedimentEngine, type SimParams, type SimStats, type WindowStats } from "./sim/engine";
import { GRAIN_CLASSES } from "./sim/physics";
import { prefersReducedMotion } from "./hooks/useSimulationLoop";
import { copyShareLink, readStateFromSearch, replaceUrlWithState } from "./state/urlParams";

// Valores por defecto verificados por backend-expert (Paso 1): fuera del remanso (poolFactor
// activo desde el arranque) τ=2.36 Pa deposita solo grava marginalmente; dentro del remanso
// τ=0.227 Pa, por debajo del umbral de deposición de grava/arena media/arcilla pero por encima
// del de limo/arena fina. Resultado: el remanso atrapa sedimento de forma visible desde temprano
// y unas clases sedimentan mientras otras siguen de largo, en vez de "nada pasa" o "todo se
// deposita". La mezcla de entrada se deja en los defaultShare de GRAIN_CLASSES (sin cambios).
const DEFAULT_PARAMS: SimParams = {
  velocity: 0.7,
  depth: 1,
  poolFactor: 2.75,
  feedRate: 25,
  mix: GRAIN_CLASSES.map((c) => c.defaultShare),
};
const DEFAULT_TIME_SCALE = 15;
/** Ventana (s de simulación) para la métrica de régimen estacionario (getWindowStats), ver R6/UX-05. */
const WINDOW_SECONDS = 20;
/** Debounce (ms) para no escribir la URL en cada evento "input" de un slider. */
const URL_WRITE_DEBOUNCE_MS = 500;
/** Cuánto se muestra el aviso "Nuevo experimento" tras un reset por cambio de parámetro clave. */
const RESET_NOTICE_MS = 4000;

/** ¿cambió alguno de los parámetros "clave" que hacen que un reset de conteo sea coherente? */
function keyParamsChanged(a: SimParams, b: SimParams): boolean {
  if (a.velocity !== b.velocity || a.depth !== b.depth || a.poolFactor !== b.poolFactor || a.feedRate !== b.feedRate) {
    return true;
  }
  if (a.mix.length !== b.mix.length) return true;
  for (let i = 0; i < a.mix.length; i++) if (a.mix[i] !== b.mix[i]) return true;
  return false;
}

export default function App() {
  // Los datos de alta frecuencia viven en el motor (fuera de React); aquí solo el estado de la interfaz.
  // capacity: con los DEFAULT_PARAMS de arriba (poolFactor=2.75, sin resuspensión de grava/arena
  // media a ese τ), el remanso es una trampa permanente y el motor llega a saturated=true en unos
  // cientos de s simulados si nadie toca los controles (comportamiento físico esperado: capacidad
  // finita de un remanso real). Con capacity=8000 eso ocurría a los ~37-40 s reales (timeScale=15)
  // de dejar correr la demo sin interacción, que es poco margen para una pantalla de expo sin
  // supervisión constante. Se sube a 16000 (roughly 2x runway antes del banner "saturated") como
  // compromiso entre demo más larga y costo de iterar el array de partículas en el dibujo por
  // frame (16k elementos sigue siendo trivial). El banner de "saturated" se conserva: seguir
  // corriendo indefinidamente sin interacción sigue llegando a él, y es parte de la lección
  // (trampa + capacidad finita), no un bug.
  const engine = useMemo(() => new SedimentEngine({ capacity: 16000 }), []);

  // Estado inicial: URL compartida > defaults. Ver src/state/urlParams.ts.
  const initial = useMemo(() => readStateFromSearch(window.location.search), []);
  const [params, setParams] = useState<SimParams>(() => ({ ...DEFAULT_PARAMS, ...initial.params }));
  // UX-06: si el usuario prefiere menos movimiento, arrancamos en pausa (puede reanudar a mano).
  const [running, setRunning] = useState(() => !prefersReducedMotion());
  const [timeScale, setTimeScale] = useState(initial.timeScale ?? DEFAULT_TIME_SCALE);
  const [stats, setStats] = useState<SimStats>(() => engine.getStats());
  const [windowStats, setWindowStats] = useState<WindowStats>(() => engine.getWindowStats(WINDOW_SECONDS));
  const [justReset, setJustReset] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const prevKeyParamsRef = useRef(params);
  const resetNoticeTimeoutRef = useRef<number>();
  const linkCopiedTimeoutRef = useRef<number>();
  const urlWriteTimeoutRef = useRef<number>();

  // R4 (revisado tras diagnóstico backend-expert, Paso 1): la política de resetOnChange sigue
  // siendo "resetea cuando cambia un parámetro clave, para no mezclar en el mismo acumulado
  // partículas de dos regímenes distintos" — pero antes se aplicaba en *cada* cambio de `params`,
  // y un <input type="range"> dispara onChange en cada tick de arrastre (no solo al soltar): con
  // el slider de Hjulström pidiendo explícitamente "muévelo lentamente", eso encadenaba decenas de
  // resets (partículas borradas, contadores a 0, historial de WindowStats vaciado) en un solo
  // arrastre, y probablemente era la causa raíz de que la simulación "no convenciera" viéndola
  // correr.
  //
  // Ahora se separan dos cosas:
  //  1) Sincronía "en vivo" (este efecto, cada tick): actualiza el campo de flujo del motor
  //     (velocidad/profundidad/remanso) sin pedir reset (no se envía resetOnChange), así el
  //     usuario ve el remanso/caudal reaccionar mientras arrastra, sin perder el conteo acumulado.
  //  2) Commit explícito (commitParams, abajo): solo se llama cuando el usuario "confirma" el
  //     cambio -> soltar el control (pointerup/mouseup/touchend/keyup en Controls.tsx) o un click
  //     discreto (preset, experimento guiado). Ahí sí se compara contra el último valor confirmado
  //     y se resetea si corresponde.
  useEffect(() => {
    engine.setParams(params);
  }, [engine, params]);

  useEffect(() => () => window.clearTimeout(resetNoticeTimeoutRef.current), []);

  // Importante: el reset ya NO pasa por el `resetOnChange` interno de engine.setParams. Ese
  // mecanismo compara contra el `this.params` *del motor*, y como el efecto "en vivo" de arriba
  // ya mantiene ese `this.params` sincronizado en cada tick (para el feedback inmediato del campo
  // de flujo), en el momento del commit el motor ya no vería ninguna diferencia y nunca
  // resetearía. Por eso aquí la decisión de resetear se toma en React, comparando contra el
  // último valor *confirmado* (prevKeyParamsRef, que solo se actualiza en un commit) y llamando a
  // `engine.reset()` explícitamente.
  const commitParams = useCallback(
    (p: SimParams) => {
      const changed = keyParamsChanged(prevKeyParamsRef.current, p);
      prevKeyParamsRef.current = p;
      if (changed) {
        engine.reset();
        setStats(engine.getStats());
        setWindowStats(engine.getWindowStats(WINDOW_SECONDS));
        setJustReset(true);
        window.clearTimeout(resetNoticeTimeoutRef.current);
        resetNoticeTimeoutRef.current = window.setTimeout(() => setJustReset(false), RESET_NOTICE_MS);
      }
    },
    [engine],
  );

  // Métricas agregadas a ~4 Hz hacia la interfaz (acumulados + régimen estacionario de R6).
  useEffect(() => {
    const id = window.setInterval(() => {
      setStats(engine.getStats());
      setWindowStats(engine.getWindowStats(WINDOW_SECONDS));
    }, 250);
    return () => window.clearInterval(id);
  }, [engine]);

  // R2: refleja el escenario en la URL (con debounce) para que se pueda compartir un enlace.
  useEffect(() => {
    window.clearTimeout(urlWriteTimeoutRef.current);
    urlWriteTimeoutRef.current = window.setTimeout(() => {
      replaceUrlWithState(params, timeScale);
    }, URL_WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(urlWriteTimeoutRef.current);
  }, [params, timeScale]);

  const reset = useCallback(() => {
    engine.reset();
    setStats(engine.getStats());
    setWindowStats(engine.getWindowStats(WINDOW_SECONDS));
  }, [engine]);

  // R3: "experimento guiado" fija parámetros con un commit inmediato (como un preset: es un click
  // discreto, no un arrastre, así que no hay razón para diferir el reset a un pointerup que nunca
  // llega). Se actualiza `params` y se llama a commitParams con el mismo objeto en el mismo evento
  // para evitar leer estado de React que todavía no se re-renderizó; onReset (llamado aparte por
  // GuidedExperiments) además fuerza el reinicio aunque el patch coincida con los parámetros
  // actuales (p.ej. reabrir el mismo paso) — ese reset extra es idempotente si commitParams ya
  // reseteó por el cambio de parámetros clave.
  const applyExperimentParams = useCallback(
    (patch: Partial<SimParams>) => {
      const next = { ...params, ...patch };
      setParams(next);
      commitParams(next);
    },
    [params, commitParams],
  );
  const ensureRunning = useCallback(() => setRunning(true), []);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyShareLink(params, timeScale);
    if (ok) {
      setLinkCopied(true);
      window.clearTimeout(linkCopiedTimeoutRef.current);
      linkCopiedTimeoutRef.current = window.setTimeout(() => setLinkCopied(false), 2500);
    }
    return ok;
  }, [params, timeScale]);

  return (
    <div className="app">
      <header className="hero">
        <h1>Transporte de sedimentos en un río</h1>
        <p>
          Cambia la velocidad del agua y observa cómo la corriente pierde capacidad para transportar partículas: los granos más pesados se depositan primero y los más finos llegan más lejos.
        </p>
      </header>

      <GuidedExperiments onApplyParams={applyExperimentParams} onReset={reset} onEnsureRunning={ensureRunning} />

      <main className="layout">
        <div className="col-main">
          <section className="panel" aria-label="Simulación">
            <RiverCanvas engine={engine} running={running} timeScale={timeScale} />
            <ul className="legend" aria-label="Leyenda de tamaños de grano">
              {GRAIN_CLASSES.map((c) => (
                <li key={c.id}>
                  <i className="dot" style={{ background: c.color }} aria-hidden="true" />
                  {c.label}
                </li>
              ))}
              <li className="muted">Escala vertical exagerada (100 m de largo, ~1 m de profundidad)</li>
            </ul>
          </section>
          {justReset && (
            <p className="note warn" role="status">
              Nuevo experimento: cambiaste un parámetro clave, así que el conteo se reinició para que los porcentajes describan este escenario y no una mezcla con el anterior.
            </p>
          )}
          <Metrics stats={stats} params={params} windowStats={windowStats} />
        </div>

        <aside className="col-side">
          <Controls
            params={params}
            onChange={setParams}
            onCommit={commitParams}
            running={running}
            onToggleRun={() => setRunning((r) => !r)}
            onReset={reset}
            timeScale={timeScale}
            onTimeScale={setTimeScale}
            onCopyLink={handleCopyLink}
            linkCopied={linkCopied}
          />
        </aside>
      </main>

      <section className="charts" aria-label="Gráficos explicativos">
        <div className="panel">
          <h2>Diagrama de Hjulström (modelo)</h2>
          <HjulstromChart velocity={params.velocity} depth={params.depth} />
        </div>
        <div className="panel">
          <h2>Dónde se deposita</h2>
          <DepositChart stats={stats} />
        </div>
      </section>

      <section className="panel model" aria-label="Modelo físico">
        <h2>Modelo físico</h2>
        <p>
          Cada punto es una partícula que se mueve con la corriente (perfil logarítmico de velocidad), cae por su peso (velocidad de caída de Soulsby, 1997) y es agitada por la turbulencia (caminata aleatoria vertical con difusividad parabólica). Al tocar el lecho se deposita si el esfuerzo cortante es menor que el crítico, y puede
          volver a levantarse si lo supera (parámetro de Shields, Soulsby y Whitehouse, 1997). El número de Rouse P = ws / (κ u*) indica si el grano viaja por el fondo (P &gt; 2,5), en suspensión (0,8 – 2,5) o como carga de lavado (P &lt; 0,8).
        </p>
        <p className="muted">
          Limitaciones: modelo didáctico en 2D (perfil longitudinal), lecho fijo con rugosidad constante (z0 = 1 mm), sin retroalimentación del depósito sobre la geometría. Los umbrales de arcilla y limo son valores pedagógicos calibrados para reproducir la forma del diagrama de Hjulström, porque el criterio de Shields no incluye cohesión.
        </p>
      </section>
    </div>
  );
}
