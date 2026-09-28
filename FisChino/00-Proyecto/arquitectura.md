---
tipo: arquitectura
última-actualización: 2026-09-19
---

# Arquitectura — ExpoFisChino

## Visión General
Simulador web (Vite + React + TypeScript + Canvas 2D) del transporte de sedimentos en un río. El usuario mueve la velocidad del agua y ve en tiempo real cuántas partículas llegan a la salida y cuántas se depositan. Decisiones en [[decisiones]]. Código en `D:\Proyectos\ExpoFisChino\app`.

## Componentes (MVP v0.1, implementado)
- `src/sim/physics.ts`: funciones puras (Soulsby ws/D*/θcr, Rouse, u*, umbrales, curvas para Hjulström).
- `src/sim/engine.ts`: `SedimentEngine` — partículas en `Float32Array`/`Uint8Array`, RNG con semilla, campo hidráulico por celda (400), remanso 50–70 m, histograma de depósito (50 bins), `advance(dt)` con subpasos ≤ 0,05 s.
- `src/components/RiverCanvas.tsx`: bucle rAF + dibujo Canvas 2D fuera del estado de React.
- `src/components/Controls|Metrics|HjulstromChart|DepositChart.tsx`: interfaz y gráficos SVG.
- `src/App.tsx`: estado de la interfaz; métricas al estado a ~4 Hz.
- `src/sim/sim.test.ts`: 10 pruebas (física + motor).

## Flujo de Datos
Sliders → `params` (React) → `engine.setParams` → bucle rAF: `engine.advance` + dibujo → cada 250 ms `engine.getStats()` → `setStats` → métricas y gráficos.

## Integraciones Externas
- Ninguna. Sitio estático; deploy previsto en Vercel.

## Próxima arquitectura (definida en el prompt)
Propiedad de archivos por subagente y fases: ver [[../03-Activos/prompt-inicial-claude-code]].

## Relacionado
- [[decisiones]]
- [[../01-Referencias/tech-stack]]
