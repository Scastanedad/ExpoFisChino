import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Metrics from "./Metrics";
import { GRAIN_CLASSES } from "../sim/physics";
import { N_BINS, type SimParams, type SimStats, type WindowStats } from "../sim/engine";

const N = GRAIN_CLASSES.length;
const fill = (v: number) => new Array(N).fill(v);

function baseParams(): SimParams {
  return { velocity: 0.6, depth: 1, poolFactor: 1, feedRate: 20, mix: GRAIN_CLASSES.map((c) => c.defaultShare) };
}

function baseStats(overrides: Partial<SimStats> = {}): SimStats {
  return {
    injected: fill(20), // total 100
    exited: fill(4), // total 20 -> 20% transportado, 20% por clase
    deposited: fill(12), // total 60 -> 60% depositado
    suspended: fill(2), // total 10 -> 10% en el agua
    depositBins: new Int32Array(N * N_BINS),
    saturated: false,
    time: 120,
    ...overrides,
  };
}

function baseWindowStats(overrides: Partial<WindowStats> = {}): WindowStats {
  return {
    requestedWindowSeconds: 20,
    actualWindowSeconds: 20,
    outflowRate: fill(1),
    inflowRate: fill(1.4),
    netDepositionRate: fill(0.1),
    transportCapacity: fill(0.71), // 71% por clase
    totalOutflowRate: 5,
    totalInflowRate: 7,
    totalNetDepositionRate: 0.5,
    totalTransportCapacity: 0.5, // 50% total
    ...overrides,
  };
}

describe("Metrics", () => {
  it("calcula los KPI acumulados (transportado/depositado/en el agua) a partir de stats", () => {
    render(<Metrics stats={baseStats()} params={baseParams()} windowStats={baseWindowStats()} />);
    expect(screen.getByText("20 %", { selector: ".kpi.transported strong" })).toBeInTheDocument();
    expect(screen.getByText("60 %", { selector: ".kpi.deposited strong" })).toBeInTheDocument();
    expect(screen.getByText("10 %", { selector: ".kpi.moving strong" })).toBeInTheDocument();
  });

  it("no muestra el aviso de saturación cuando stats.saturated=false", () => {
    render(<Metrics stats={baseStats()} params={baseParams()} windowStats={baseWindowStats()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra el aviso de saturación cuando stats.saturated=true", () => {
    render(
      <Metrics
        stats={baseStats({ saturated: true })}
        params={baseParams()}
        windowStats={baseWindowStats()}
       
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/capacidad máxima/i);
  });

  it("R6/UX-05: integra getWindowStats (régimen estacionario) junto a los acumulados", () => {
    render(<Metrics stats={baseStats()} params={baseParams()} windowStats={baseWindowStats()} />);
    expect(screen.getByRole("heading", { name: /Régimen actual \(últimos 20 s/i })).toBeInTheDocument();
    expect(screen.getByText("5.0", { selector: ".kpi.moving strong" })).toBeInTheDocument(); // salida part/s
    expect(screen.getByText("7.0", { selector: ".kpi.moving strong" })).toBeInTheDocument(); // aporte part/s
    expect(screen.getByText("50 %", { selector: ".kpi.transported strong" })).toBeInTheDocument(); // capacidad relativa
  });

  it("muestra por clase la salida (part/s) y la capacidad de transporte de la ventana", () => {
    render(<Metrics stats={baseStats()} params={baseParams()} windowStats={baseWindowStats()} />);
    const row = screen.getByRole("row", { name: /Grava/i });
    expect(within(row).getByText("1.00")).toBeInTheDocument();
    expect(within(row).getByText("71 %")).toBeInTheDocument();
  });

  it("avisa cuando la ventana real es más corta que la pedida", () => {
    render(
      <Metrics
        stats={baseStats()}
        params={baseParams()}
        windowStats={baseWindowStats({ actualWindowSeconds: 5, requestedWindowSeconds: 20 })}
       
      />,
    );
    expect(screen.getByText(/lleva poco tiempo corriendo/i)).toBeInTheDocument();
  });

  it("no avisa de ventana corta cuando ya se cubrió casi toda la ventana pedida", () => {
    render(
      <Metrics
        stats={baseStats()}
        params={baseParams()}
        windowStats={baseWindowStats({ actualWindowSeconds: 19.5, requestedWindowSeconds: 20 })}
       
      />,
    );
    expect(screen.queryByText(/lleva poco tiempo corriendo/i)).not.toBeInTheDocument();
  });
});
