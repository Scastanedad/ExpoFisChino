import { GRAIN_CLASSES } from "../sim/physics";
import type { SimParams } from "../sim/engine";

interface Props {
  params: SimParams;
  /** Actualización "en vivo" (cada tick de arrastre): solo refleja el valor en la interfaz, no debe disparar un reset del motor. */
  onChange: (p: SimParams) => void;
  /**
   * Confirma un cambio de parámetros (soltar un slider, un preset, o cualquier interacción
   * discreta). App decide si eso amerita un reset del motor (ver resetOnChange en App.tsx) — a
   * diferencia de onChange, esto NO debe llamarse en cada tick de un `<input type="range">`
   * mientras se arrastra, solo al terminar la interacción (ver fix del reset-en-cada-tick).
   */
  onCommit: (p: SimParams) => void;
  running: boolean;
  onToggleRun: () => void;
  onReset: () => void;
  timeScale: number;
  onTimeScale: (v: number) => void;
  /** Copia al portapapeles un enlace que reproduce el escenario actual (ver src/state/urlParams.ts). Devuelve si tuvo éxito. */
  onCopyLink?: () => void | Promise<boolean>;
  /** Muestra brevemente una confirmación de que el enlace se copió. */
  linkCopied?: boolean;
}

interface SliderProps {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  /**
   * Confirma el valor actual del slider (ver Props.onCommit en Controls). Se dispara al soltar el
   * control -pointerup/mouseup/touchend- o al terminar una interacción de teclado -keyup-, nunca
   * en cada tick de `onChange` mientras se arrastra: así el reset del motor (si corresponde) pasa
   * una sola vez por interacción, no decenas de veces por arrastre.
   */
  onCommit?: () => void;
  hint?: string;
  digits?: number;
  /** Clase extra en el contenedor `.field` (p.ej. "playback" para separar visualmente el
   * control de reproducción de los parámetros físicos, UX-04/UX-09). */
  variant?: string;
}

function Slider({ id, label, unit, min, max, step, value, onChange, onCommit, hint, digits = 2, variant }: SliderProps) {
  return (
    <div className={variant ? `field ${variant}` : "field"}>
      <label htmlFor={id}>
        <span>{label}</span>
        <output htmlFor={id}>
          {value.toFixed(digits)} {unit}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onKeyUp={onCommit}
      />
      {hint && <small>{hint}</small>}
    </div>
  );
}

const PRESETS = [
  { label: "Sequía", v: 0.15 },
  { label: "Caudal normal", v: 0.5 },
  { label: "Crecida", v: 1.5 },
];

export default function Controls({
  params,
  onChange,
  onCommit,
  running,
  onToggleRun,
  onReset,
  timeScale,
  onTimeScale,
  onCopyLink,
  linkCopied,
}: Props) {
  // Actualización en vivo (cada tick de arrastre): no reset. Ver comentario de Props.onChange.
  const set = (patch: Partial<SimParams>) => onChange({ ...params, ...patch });
  // Confirma el valor ya reflejado en `params` (se llama al soltar un slider, cuando `params` ya
  // quedó actualizado por el último `set()` de esa misma interacción).
  const commit = () => onCommit(params);
  // Interacciones discretas (botones, no arrastre): actualizar y confirmar en el mismo evento, con
  // el mismo objeto, para no depender de que React ya haya re-renderizado `params` (ver preset).
  const setAndCommit = (patch: Partial<SimParams>) => {
    const next = { ...params, ...patch };
    onChange(next);
    onCommit(next);
  };
  return (
    <section className="panel" aria-label="Controles de la simulación">
      <h2>Controles</h2>

      <div className="btn-row" role="group" aria-label="Reproducción">
        <button type="button" className="btn primary" onClick={onToggleRun}>
          {running ? "Pausar" : "Reanudar"}
        </button>
        <button type="button" className="btn" onClick={onReset}>
          Reiniciar
        </button>
        {onCopyLink && (
          <button type="button" className="btn link" onClick={() => onCopyLink()}>
            {linkCopied ? "¡Enlace copiado!" : "Copiar enlace"}
          </button>
        )}
      </div>

      <Slider
        id="vel"
        label="Velocidad del agua (U)"
        unit="m/s"
        min={0.05}
        max={2}
        step={0.05}
        value={params.velocity}
        onChange={(v) => set({ velocity: v })}
        onCommit={commit}
        hint="Velocidad media aguas arriba."
      />
      <div className="btn-row" role="group" aria-label="Escenarios de velocidad">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="btn small" onClick={() => setAndCommit({ velocity: p.v })}>
            {p.label} ({p.v})
          </button>
        ))}
      </div>

      <Slider
        id="depth"
        label="Profundidad (h)"
        unit="m"
        min={0.5}
        max={3}
        step={0.1}
        value={params.depth}
        onChange={(v) => set({ depth: v })}
        onCommit={commit}
        digits={1}
      />
      <Slider
        id="pool"
        label="Remanso (profundización)"
        unit="×"
        min={1}
        max={4}
        // step=0.25 (no 0.5): el default de poolFactor (2.75, ver App.tsx DEFAULT_PARAMS) tiene
        // que caer justo en un paso del slider, si no el usuario nunca puede volver a ese valor
        // exacto arrastrando después de haberlo movido.
        step={0.25}
        value={params.poolFactor}
        onChange={(v) => set({ poolFactor: v })}
        onCommit={commit}
        digits={1}
        hint="1× = río uniforme. Mayor valor: entre 50 y 70 m el cauce se profundiza y el agua se frena (U = q/h)."
      />
      <Slider
        id="feed"
        label="Aporte de sedimento"
        unit="part/s"
        min={5}
        max={60}
        step={5}
        value={params.feedRate}
        onChange={(v) => set({ feedRate: v })}
        onCommit={commit}
        digits={0}
      />
      <Slider
        id="speed"
        label="Avance del tiempo (reproducción)"
        unit="×"
        min={1}
        max={40}
        step={1}
        value={timeScale}
        onChange={onTimeScale}
        digits={0}
        hint="No es la velocidad del agua: controla qué tan rápido avanza la simulación en tu pantalla."
        variant="playback"
      />

      <details className="mix">
        <summary>Mezcla de sedimento que entra</summary>
        {GRAIN_CLASSES.map((c, i) => (
          <div className="field" key={c.id}>
            <label htmlFor={`mix-${c.id}`}>
              <span>
                <i className="dot" style={{ background: c.color }} aria-hidden="true" />
                {c.label}
              </span>
              <output htmlFor={`mix-${c.id}`}>{params.mix[i]} %</output>
            </label>
            <input
              id={`mix-${c.id}`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={params.mix[i]}
              onChange={(e) => {
                const mix = [...params.mix];
                mix[i] = Number(e.target.value);
                set({ mix });
              }}
              onPointerUp={commit}
              onMouseUp={commit}
              onTouchEnd={commit}
              onKeyUp={commit}
            />
          </div>
        ))}
        <small>Los porcentajes se normalizan automáticamente.</small>
      </details>
    </section>
  );
}
