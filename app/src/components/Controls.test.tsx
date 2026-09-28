import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import Controls from "./Controls";
import { GRAIN_CLASSES } from "../sim/physics";
import type { SimParams } from "../sim/engine";

function baseParams(): SimParams {
  return {
    velocity: 0.6,
    depth: 1,
    poolFactor: 1,
    feedRate: 20,
    mix: GRAIN_CLASSES.map((c) => c.defaultShare),
  };
}

function setup(overrides: Partial<ComponentProps<typeof Controls>> = {}) {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  const onToggleRun = vi.fn();
  const onReset = vi.fn();
  const onTimeScale = vi.fn();
  const onCopyLink = vi.fn();
  render(
    <Controls
      params={baseParams()}
      onChange={onChange}
      onCommit={onCommit}
      running
      onToggleRun={onToggleRun}
      onReset={onReset}
      timeScale={15}
      onTimeScale={onTimeScale}
      onCopyLink={onCopyLink}
      linkCopied={false}
      {...overrides}
    />,
  );
  return { onChange, onCommit, onToggleRun, onReset, onTimeScale, onCopyLink };
}

describe("Controls", () => {
  it("distingue el slider de velocidad del agua (U) del de avance del tiempo (UX-04)", () => {
    setup();
    expect(screen.getByText(/Velocidad del agua \(U\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Avance del tiempo/i)).toBeInTheDocument();
    // no debe quedar un segundo control llamado literalmente "Velocidad de simulación"
    expect(screen.queryByText(/Velocidad de simulación/i)).not.toBeInTheDocument();
  });

  it("mover el slider de velocidad U llama a onChange con el nuevo valor", () => {
    const { onChange } = setup();
    // getByRole("slider", ...) en vez de getByLabelText: el <output> de la UI queda anidado
    // dentro del mismo <label> que el <input> (asociación implícita) además del `for` explícito
    // al input, así que getByLabelText encuentra ambos elementos. El rol "slider" solo lo tiene
    // el <input type="range">, así que desambigua sin tocar el markup de Controls.tsx.
    fireEvent.change(screen.getByRole("slider", { name: /Velocidad del agua/i }), { target: { value: "1.2" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ velocity: 1.2 }));
  });

  it("un botón de escenario (preset) fija la velocidad exacta del preset", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Crecida/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ velocity: 1.5 }));
  });

  it("mover un slider de mezcla actualiza solo esa clase de grano", () => {
    const { onChange } = setup();
    const gravel = GRAIN_CLASSES.findIndex((c) => c.id === "grava");
    fireEvent.change(screen.getByRole("slider", { name: /Grava/i }), { target: { value: "40" } });
    const call = onChange.mock.calls[0][0] as SimParams;
    expect(call.mix[gravel]).toBe(40);
    // el resto de la mezcla no debería cambiar en esta llamada
    expect(call.mix.filter((_, i) => i !== gravel)).toEqual(baseParams().mix.filter((_, i) => i !== gravel));
  });

  it("Pausar/Reanudar y Reiniciar llaman a sus callbacks", () => {
    const { onToggleRun, onReset } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Pausar/i }));
    expect(onToggleRun).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Reiniciar/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("el botón de reproducción muestra Reanudar cuando running=false", () => {
    setup({ running: false });
    expect(screen.getByRole("button", { name: /Reanudar/i })).toBeInTheDocument();
  });

  it("Copiar enlace llama a onCopyLink y refleja la confirmación (R2)", () => {
    const { onCopyLink } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Copiar enlace/i }));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it("muestra la confirmación de enlace copiado cuando linkCopied=true", () => {
    setup({ linkCopied: true });
    expect(screen.getByRole("button", { name: /Enlace copiado/i })).toBeInTheDocument();
  });

  it("sin onCopyLink no renderiza el botón de copiar enlace", () => {
    setup({ onCopyLink: undefined });
    expect(screen.queryByRole("button", { name: /Copiar enlace/i })).not.toBeInTheDocument();
  });
});
