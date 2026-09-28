import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GuidedExperiments from "./GuidedExperiments";

function setup() {
  const onApplyParams = vi.fn();
  const onReset = vi.fn();
  const onEnsureRunning = vi.fn();
  render(<GuidedExperiments onApplyParams={onApplyParams} onReset={onReset} onEnsureRunning={onEnsureRunning} />);
  return { onApplyParams, onReset, onEnsureRunning };
}

describe("GuidedExperiments (R3)", () => {
  it("iniciar el experimento por defecto fija U=1.5 (crecida) y dispara el reset", () => {
    const { onApplyParams, onReset, onEnsureRunning } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Iniciar experimento/i }));
    expect(onApplyParams).toHaveBeenCalledWith(expect.objectContaining({ velocity: 1.5 }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onEnsureRunning).toHaveBeenCalledTimes(1);
  });

  it("seleccionar otro experimento y luego iniciar fija sus parámetros (Clasificación granulométrica)", () => {
    const { onApplyParams } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: /Experimento/i }), { target: { value: "clasificacion" } });
    fireEvent.click(screen.getByRole("button", { name: /Iniciar experimento/i }));
    expect(onApplyParams).toHaveBeenCalledWith(expect.objectContaining({ velocity: 0.5 }));
  });

  it("tras iniciar, pulsar 'Ver conclusión' muestra la conclusión esperada", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Iniciar experimento/i }));
    expect(screen.getByText(/¿Qué esperas que pase\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/incluso la grava llega a la salida/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ver conclusión/i }));
    expect(screen.getByText(/incluso la grava llega a la salida/i)).toBeInTheDocument();
  });

  it("avanzar al siguiente paso del experimento de dos pasos fija los nuevos parámetros y vuelve a resetear", () => {
    const { onApplyParams, onReset } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Iniciar experimento/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ver conclusión/i }));

    const nextBtn = screen.getByRole("button", { name: /Siguiente paso/i });
    fireEvent.click(nextBtn);

    expect(onApplyParams).toHaveBeenLastCalledWith(expect.objectContaining({ velocity: 0.15 }));
    expect(onReset).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/caudal de sequía/i)).toBeInTheDocument();
  });

  it("Salir del experimento vuelve al selector sin tocar los parámetros actuales", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Iniciar experimento/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salir del experimento/i }));
    expect(screen.getByRole("button", { name: /Iniciar experimento/i })).toBeInTheDocument();
    expect(screen.queryByText(/¿Qué esperas que pase\?/i)).not.toBeInTheDocument();
  });

  it("N-10: mueve el foco programáticamente en cada transición (iniciar → ver conclusión → siguiente paso → salir)", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: /Iniciar experimento/i }));
    expect(document.activeElement).toHaveTextContent(/Paso 1 de 2: Crecida/i);

    fireEvent.click(screen.getByRole("button", { name: /Ver conclusión/i }));
    expect(document.activeElement).toHaveAttribute("role", "status");
    expect(document.activeElement).toHaveTextContent(/incluso la grava llega a la salida/i);

    fireEvent.click(screen.getByRole("button", { name: /Siguiente paso/i }));
    expect(document.activeElement).toHaveTextContent(/Paso 2 de 2: Sequía/i);

    fireEvent.click(screen.getByRole("button", { name: /Ver conclusión/i }));
    fireEvent.click(screen.getByRole("button", { name: /Terminar y volver a modo libre/i }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Iniciar experimento/i }));
  });

  it("N-11: el bloque de paso/pregunta es una región viva (aria-live) además de la conclusión", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Iniciar experimento/i }));
    const stepBlock = screen.getByText(/Paso 1 de 2: Crecida/i).closest(".guided-step");
    expect(stepBlock).toHaveAttribute("aria-live", "polite");
  });
});
