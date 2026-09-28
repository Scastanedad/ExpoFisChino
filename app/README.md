# EFC — Transporte de sedimentos en un río

Simulación web interactiva (universidad): cambia la velocidad del agua y observa cuántos sedimentos se transportan hasta la salida y cuántos se depositan antes.

## Comandos
- `npm install` — instalar dependencias
- `npm run dev` — servidor de desarrollo (http://localhost:5173)
- `npm test` — pruebas de la física y del motor (Vitest)
- `npm run build` — tipado + build de producción (`dist/`)

## Estructura
- `src/sim/physics.ts` — funciones puras: Soulsby (ws, D*, θcr), Rouse, u*, umbrales
- `src/sim/engine.ts` — motor de partículas lagrangiano (Float32Array, RNG con semilla)
- `src/components/` — `RiverCanvas` (Canvas 2D), `Controls`, `Metrics`, `HjulstromChart`, `DepositChart`
- `src/App.tsx` — estado de la interfaz; los datos de alta frecuencia viven en el motor

## Modelo (resumen)
Advección con perfil logarítmico, caída con ws de Soulsby (1997), turbulencia por caminata aleatoria vertical
(difusividad parabólica con corrección de gradiente), deposición/resuspensión por esfuerzo cortante frente a
τce/τcd (Shields de Soulsby-Whitehouse; cohesión de arcilla/limo con valores pedagógicos). Lecho fijo, z0 = 1 mm.

## Deploy
Sitio estático; Vercel detecta Vite (`vercel.json` incluido).
