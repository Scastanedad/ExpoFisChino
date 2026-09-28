import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// El proyecto no usa `test.globals` de Vitest (los tests importan describe/it/expect
// explícitamente, como sim.test.ts), así que Testing Library no detecta el framework y no
// registra su limpieza automática. Sin esto, cada `render()` deja el DOM montado del test
// anterior en jsdom, y las queries de un test empiezan a encontrar elementos "de más" de
// renders previos (esto es justo lo que rompía los tests de Metrics/Controls al principio).
afterEach(() => {
  cleanup();
});
