import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { SedimentEngine } from "./sim/engine";

/**
 * Regresión del bug crítico diagnosticado por backend-expert (Paso 1): un <input type="range">
 * dispara `onChange` en cada tick de arrastre, no solo al soltar. La política de "resetea cuando
 * cambia un parámetro clave" (R4) se aplicaba antes en cada `onChange`, así que arrastrar
 * lentamente un slider (justo lo que le pide el experimento guiado de Hjulström) encadenaba
 * decenas de `engine.reset()` seguidos. Estas pruebas espían `SedimentEngine.prototype.reset`
 * para verificar que un arrastre (varios `change` sin soltar) no resetea, y que soltar el control
 * (o un preset, que es un click discreto) sí dispara exactamente un reset.
 */
describe("App — política de reset al cambiar parámetros (R4)", () => {
  beforeEach(() => {
    // jsdom no implementa requestAnimationFrame por defecto en todas las versiones; stub simple
    // que no ejecuta el callback (no necesitamos que el bucle de simulación corra de verdad para
    // estas pruebas, solo que useSimulationLoop pueda montarse/desmontarse sin lanzar).
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("arrastrar el slider de velocidad (varios onChange sin soltar) no resetea el motor", () => {
    const resetSpy = vi.spyOn(SedimentEngine.prototype, "reset");
    render(<App />);
    const slider = screen.getByRole("slider", { name: /Velocidad del agua/i });

    // Simula un arrastre: varios ticks de "change" con valores distintos, sin pointerup/mouseup.
    fireEvent.change(slider, { target: { value: "0.9" } });
    fireEvent.change(slider, { target: { value: "1.0" } });
    fireEvent.change(slider, { target: { value: "1.1" } });
    fireEvent.change(slider, { target: { value: "1.2" } });

    expect(resetSpy).not.toHaveBeenCalled();
  });

  it("soltar el slider (pointerup) tras arrastrarlo confirma el cambio con un único reset", () => {
    const resetSpy = vi.spyOn(SedimentEngine.prototype, "reset");
    render(<App />);
    const slider = screen.getByRole("slider", { name: /Velocidad del agua/i });

    fireEvent.change(slider, { target: { value: "0.9" } });
    fireEvent.change(slider, { target: { value: "1.2" } });
    expect(resetSpy).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    // Soltar de nuevo sin haber cambiado nada más no debe volver a resetear.
    fireEvent.pointerUp(slider);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("confirmar con teclado (keyup) también dispara el reset (accesibilidad)", () => {
    const resetSpy = vi.spyOn(SedimentEngine.prototype, "reset");
    render(<App />);
    const slider = screen.getByRole("slider", { name: /Velocidad del agua/i });

    fireEvent.change(slider, { target: { value: "0.3" } });
    expect(resetSpy).not.toHaveBeenCalled();
    fireEvent.keyUp(slider);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("un preset (click discreto) sigue aplicando un reset inmediato", () => {
    const resetSpy = vi.spyOn(SedimentEngine.prototype, "reset");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Crecida/i }));
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});
