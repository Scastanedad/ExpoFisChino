import { useEffect, useRef, useState } from "react";
import { GRAIN_CLASSES } from "../sim/physics";
import type { SimParams } from "../sim/engine";

/** Mezcla por defecto (igual a la de App.tsx) para que cada experimento arranque desde un punto reproducible. */
const DEFAULT_MIX = GRAIN_CLASSES.map((c) => c.defaultShare);
const BASE_PARAMS: Partial<SimParams> = { depth: 1, poolFactor: 1, feedRate: 20, mix: DEFAULT_MIX };

export interface ExperimentStep {
  /** título corto del paso (para "paso N de M" y el botón "siguiente paso") */
  title: string;
  /** parámetros que fija este paso al iniciar (se combinan con BASE_PARAMS para reproducibilidad) */
  params: Partial<SimParams>;
  /** pregunta guía mostrada mientras el usuario observa */
  question: string;
  /** qué mirar y cuánto tiempo, según el diseño de uiux-reviewer (fase 1) */
  observeHint: string;
  /** conclusión física esperada (validada por uiux-reviewer; no reformular la física aquí) */
  conclusion: string;
  /** segundos reales tras los que se revela la conclusión sola, si el usuario no pulsó el botón antes */
  autoRevealSeconds: number;
}

export interface GuidedExperiment {
  id: string;
  title: string;
  summary: string;
  steps: ExperimentStep[];
}

/**
 * Los 4 experimentos diseñados por uiux-reviewer en la fase 1. Los valores de parámetros y las
 * conclusiones son los ya validados en el backlog: no se reformula la física aquí, solo se
 * conecta con la UI (fijar sliders + reset + mostrar pregunta/conclusión).
 */
export const GUIDED_EXPERIMENTS: GuidedExperiment[] = [
  {
    id: "crecida-sequia",
    title: "De crecida a sequía",
    summary: "Compara qué tamaños de grano llegan a la salida con un caudal alto y con uno bajo.",
    steps: [
      {
        title: "Crecida (U = 1.5 m/s)",
        params: { ...BASE_PARAMS, velocity: 1.5 },
        question: "Con una crecida (U = 1.5 m/s), ¿qué tamaños de grano crees que van a llegar hasta la salida (100 m)?",
        observeHint: "Observa 15-20 s de simulación y fíjate en el color de las partículas que salen por la derecha.",
        conclusion:
          "A mayor velocidad, incluso la grava llega a la salida: el río tiene capacidad de transporte para (casi) todos los tamaños de grano.",
        autoRevealSeconds: 20,
      },
      {
        title: "Sequía (U = 0.15 m/s)",
        params: { ...BASE_PARAMS, velocity: 0.15 },
        question: "Ahora baja a un caudal de sequía (U = 0.15 m/s). ¿Qué esperas que cambie respecto a la crecida?",
        observeHint: "Observa otros 15-20 s y compara dónde se detienen ahora los granos gruesos.",
        conclusion:
          "Al bajar la velocidad, la grava y la arena media se depositan casi de inmediato cerca del origen, mientras que la arcilla y el limo siguen viajando: la capacidad de transporte del río depende de la velocidad.",
        autoRevealSeconds: 20,
      },
    ],
  },
  {
    id: "clasificacion",
    title: "Clasificación granulométrica",
    summary: "Con un caudal normal y sostenido, ¿el río deposita todos los tamaños en el mismo lugar?",
    steps: [
      {
        title: "Caudal normal (U = 0.5 m/s)",
        params: { ...BASE_PARAMS, velocity: 0.5 },
        question:
          "Con caudal normal (U = 0.5 m/s), mira el gráfico \"Dónde se deposita\". ¿Los granos gruesos y los finos se acumulan en el mismo tramo del cauce?",
        observeHint:
          "Deja correr 20-30 s y compara las barras de grava/arena contra las de limo/arcilla en el gráfico de depósito.",
        conclusion:
          "Los granos gruesos se apilan cerca de 0-10 m del origen; la arcilla y el limo casi no aparecen ahí: el río clasifica el sedimento por tamaño a lo largo de su curso.",
        autoRevealSeconds: 25,
      },
    ],
  },
  {
    id: "hjulstrom",
    title: "Umbral de Hjulström/Shields",
    summary: "Mueve la velocidad del agua a mano y observa cuándo un grano deja de poder erosionarse.",
    steps: [
      {
        title: "Barrido de velocidad",
        params: { ...BASE_PARAMS, velocity: 0.05 },
        question:
          "Mueve el slider de velocidad del agua (U) lentamente de 0.05 a 2.0 m/s, mirando a la vez la línea U del diagrama de Hjulström y la columna τ/τce de la tabla de resultados. ¿Qué pasa con un grano cuando la línea U cruza por debajo de la curva roja?",
        observeHint: "No hace falta esperar: mueve el slider tú mismo y mira ambos indicadores a la vez.",
        conclusion:
          "Cuando la línea U cruza bajo la curva roja de un grano, τ/τce cae bajo 1 y ese grano deja de poder erosionarse: el diagrama empírico de Hjulström y el modelo físico de Shields describen el mismo umbral.",
        autoRevealSeconds: 30,
      },
    ],
  },
  {
    id: "remanso",
    title: "Efecto del remanso",
    summary: "Con el mismo caudal de entrada, ¿la forma del cauce también decide dónde se sedimenta?",
    steps: [
      {
        title: "Profundizar el remanso",
        params: { ...BASE_PARAMS, velocity: 0.6 },
        question:
          "Con U = 0.6 m/s constante, sube el control \"Remanso (profundización)\" de 1x a 3-4x y observa el tramo entre 50 y 70 m. ¿Qué esperas que pase ahí aunque el caudal de entrada no cambie?",
        observeHint: "Sube el slider de remanso tú mismo mientras miras el canal y el gráfico de depósito en esa zona.",
        conclusion:
          "Aunque el caudal de entrada no cambia, al profundizarse el cauce (U = q/h) el agua se frena localmente y allí se deposita sedimento que no se habría sedimentado en un tramo uniforme: la geometría del cauce, no solo el caudal, controla dónde se sedimenta.",
        autoRevealSeconds: 30,
      },
    ],
  },
];

interface Props {
  /** Aplica un parche de parámetros sobre los actuales (App decide cómo fusionarlo y cuándo resetear vía resetOnChange). */
  onApplyParams: (patch: Partial<SimParams>) => void;
  /** Reinicio explícito del conteo (mismo callback que usa el botón "Reiniciar" de Controls). */
  onReset: () => void;
  /** Se llama al iniciar/avanzar un paso para asegurar que la simulación esté corriendo (si estaba en pausa). */
  onEnsureRunning: () => void;
}

interface ActiveState {
  stepIndex: number;
  phase: "question" | "conclusion";
}

/**
 * "Experimento guiado" (R3, fase 3): una máquina de estados simple sobre los 4 experimentos
 * diseñados por uiux-reviewer. No reemplaza el modo libre: seleccionar/iniciar un experimento
 * solo fija los sliders y dispara un reset (mismos mecanismos que ya usa Controls/App), el
 * usuario puede seguir ajustando los sliders a mano en cualquier momento (p.ej. los experimentos
 * 3 y 4 lo requieren explícitamente).
 */
export default function GuidedExperiments({ onApplyParams, onReset, onEnsureRunning }: Props) {
  const [selectedId, setSelectedId] = useState(GUIDED_EXPERIMENTS[0].id);
  const [active, setActive] = useState<ActiveState | null>(null);
  const revealTimeoutRef = useRef<number>();

  // N-10 (uiux-reviewer, U2): tras cada transición disparada por click/Enter, el botón pulsado se
  // desmonta y el foco cae a <body>. `focusTargetRef` apunta al elemento que debe recibir el foco
  // en el estado nuevo (título del paso, conclusión, o botón "Iniciar experimento"); `focusSignal`
  // se incrementa solo en las transiciones iniciadas por el usuario (no en el auto-reveal por
  // temporizador, para no robarle el foco a alguien que no interactuó) y dispara el `.focus()` ya
  // con el elemento nuevo montado. `didMountRef` evita robar el foco en el render inicial.
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const didMountRef = useRef(false);

  useEffect(() => () => window.clearTimeout(revealTimeoutRef.current), []);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    focusTargetRef.current?.focus();
  }, [focusSignal]);

  const experiment = GUIDED_EXPERIMENTS.find((e) => e.id === selectedId) ?? GUIDED_EXPERIMENTS[0];
  const step = active ? experiment.steps[active.stepIndex] : null;
  const isLastStep = active ? active.stepIndex >= experiment.steps.length - 1 : false;

  const startStep = (stepIndex: number) => {
    const s = experiment.steps[stepIndex];
    onApplyParams(s.params);
    onReset();
    onEnsureRunning();
    setActive({ stepIndex, phase: "question" });
    setFocusSignal((n) => n + 1);
    window.clearTimeout(revealTimeoutRef.current);
    revealTimeoutRef.current = window.setTimeout(() => {
      // Auto-reveal por temporizador: no toca el foco (nadie pulsó nada), solo se apoya en el
      // aria-live del contenedor para que un lector de pantalla anuncie la conclusión igual.
      setActive((cur) => (cur && cur.stepIndex === stepIndex ? { ...cur, phase: "conclusion" } : cur));
    }, s.autoRevealSeconds * 1000);
  };

  const handleSelect = (id: string) => {
    window.clearTimeout(revealTimeoutRef.current);
    setSelectedId(id);
    setActive(null);
  };

  const handleReveal = () => {
    window.clearTimeout(revealTimeoutRef.current);
    setActive((cur) => (cur ? { ...cur, phase: "conclusion" } : cur));
    setFocusSignal((n) => n + 1);
  };

  const handleExit = () => {
    window.clearTimeout(revealTimeoutRef.current);
    setActive(null);
    setFocusSignal((n) => n + 1);
  };

  return (
    <section className="panel guided" aria-label="Experimento guiado">
      <h2>Experimento guiado</h2>
      {/* N-12 (uiux-reviewer): colapsado por defecto para que este panel sea compacto y el canvas
          del río quede visible sin scroll en portátiles de aula (~1024x768). Es un <details> nativo,
          sin estado de React: no cambia la lógica del componente, solo su presentación inicial. */}
      <details className="guided-intro">
        <summary>¿Cómo funciona un experimento guiado?</summary>
        <p className="muted">
          Elige una pregunta de investigación: el experimento fija los sliders y reinicia el conteo por vos. Si
          preferís explorar libremente, ignorá esto y seguí moviendo los controles a mano.
        </p>
      </details>

      <div className="field">
        <label htmlFor="guided-select">
          <span>Experimento</span>
        </label>
        <select
          id="guided-select"
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          style={{ width: "100%", padding: "8px", minHeight: "40px" }}
        >
          {GUIDED_EXPERIMENTS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </div>
      <p>{experiment.summary}</p>

      {!step && (
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            ref={(el) => {
              focusTargetRef.current = el;
            }}
            onClick={() => startStep(0)}
          >
            Iniciar experimento
          </button>
        </div>
      )}

      {step && active && (
        <div
          className="guided-step"
          aria-label={`Paso ${active.stepIndex + 1} de ${experiment.steps.length}`}
          aria-live="polite"
        >
          {/* N-10/N-11: título del paso, foco programático al iniciar/avanzar de paso (tabIndex=-1
              lo hace un destino de foco válido aunque no sea interactivo) y ancla del aria-live del
              contenedor, para que quien navegue por lectura (sin mover el foco a mano) también
              escuche el paso y la pregunta nuevos. */}
          <p
            className="muted"
            tabIndex={-1}
            ref={(el) => {
              if (active.phase === "question") focusTargetRef.current = el;
            }}
          >
            Paso {active.stepIndex + 1} de {experiment.steps.length}: {step.title}
          </p>
          <p>
            <strong>¿Qué esperas que pase?</strong> {step.question}
          </p>
          <p className="muted">{step.observeHint}</p>

          {active.phase === "question" && (
            <div className="btn-row">
              <button type="button" className="btn" onClick={handleReveal}>
                Ver conclusión
              </button>
              <button type="button" className="btn link" onClick={handleExit}>
                Salir del experimento
              </button>
            </div>
          )}

          {active.phase === "conclusion" && (
            <>
              <p
                className="note warn"
                role="status"
                tabIndex={-1}
                ref={(el) => {
                  focusTargetRef.current = el;
                }}
              >
                {step.conclusion}
              </p>
              <div className="btn-row">
                {!isLastStep && (
                  <button type="button" className="btn primary" onClick={() => startStep(active.stepIndex + 1)}>
                    Siguiente paso: {experiment.steps[active.stepIndex + 1].title}
                  </button>
                )}
                <button type="button" className="btn link" onClick={handleExit}>
                  {isLastStep ? "Terminar y volver a modo libre" : "Salir del experimento"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
