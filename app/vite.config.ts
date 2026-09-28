import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom: sim.test.ts (motor puro) funciona igual en node, pero las pruebas de componentes
    // (Controls.test.tsx, Metrics.test.tsx) necesitan un DOM. Un solo entorno para todo el
    // proyecto evita tener que anotar por archivo con un comentario @vitest-environment.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
