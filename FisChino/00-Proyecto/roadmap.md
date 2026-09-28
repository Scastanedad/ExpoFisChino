---
tipo: roadmap
última-actualización: 2026-09-20
---

# Roadmap — ExpoFisChino

## Ahora
- [ ] **Confirmación del usuario sobre el resultado del revamp:** revisar la app corriendo en el navegador y confirmar si "esta vez sí se ve bien y se comporta bien" (criterio real de cierre, no un checklist — el checklist de diseño ya está en verde, ver [[informe-uiux-2026-09-19]] "Ronda 3"). Si aprueba, considerar `git commit`/`git push` (no hecho todavía).
- [ ] **Decisión del usuario (bloqueante, nuevo 2026-09-20, sin relación con el revamp):** qué hacer con la etiqueta "production" que Vercel puso automáticamente al primer deploy (`vercel deploy` sin `--prod`) del proyecto `dev-ia2/app`. Ver [[../04-Sync/sesion-actual]].
- [ ] **Recomendado, no confirmado (nuevo 2026-09-20):** rotar/deshabilitar desde el dashboard de Vercel el secreto de "Protection Bypass for Automation" usado en la prueba de humo (quedó visible solo en transcript, nunca en disco/repo).
- [ ] **Confirmar con el usuario:** ¿mantener Node pineado a 22.x (`.nvmrc`/`engines`) o subir a 24.x (versión real del entorno local)? Ver [[decisiones]].
- [ ] Completar en el README: fecha de la expo (audiencia y personas clave ya están completos)

## Próximo (fases del prompt)
- [ ] Fase 4 — V4: producción, solo con autorización explícita del usuario (bloqueado además por la decisión pendiente sobre la etiqueta "production" de arriba)
- [ ] Conectar GitHub a Vercel para previews automáticos por PR (manual desde el dashboard, si el usuario lo quiere; el intento automático falló por permisos de la GitHub App, esperado)

## Después / Ideas
- Retroalimentación del depósito sobre la profundidad (lecho móvil)
- Web Worker si el perfilado lo exige (>8 ms/frame o >20 000 partículas)
- Puntos empíricos de Hjulström con fuente

## Completado
- [x] Crear bóveda de Obsidian (2026-09-19)
- [x] Investigación profunda del enfoque de implementación (2026-09-19)
- [x] MVP v0.1: simulador funcional, 10 pruebas en verde, build OK (2026-09-19)
- [x] Diseñar y guardar el primer prompt con subagentes (2026-09-19)
- [x] Ejecutar en Claude Code el prompt de subagentes (crea los 6 subagentes) (2026-09-19)
- [x] Fase 1 — backend-expert: validación de física (B1-B4), `getWindowStats`, `ENTRY_BUFFER` (2026-09-19)
- [x] Fase 1 — uiux-reviewer: auditoría UI/UX ronda 1, ver [[informe-uiux-2026-09-19]] (2026-09-19)
- [x] Fase 1 — vercel-deploy-expert: config inicial de deploy (`.nvmrc`, `engines`, `vercel.json`, meta tags, `.gitignore`) (2026-09-19)
- [x] Verificación combinada Fase 1: `npm test` 16/16 verde, `npm run build` verde (2026-09-19)
- [x] Fase 2 — react-expert (R1, R2, R4, R5, R6): `useSimulationLoop`, estado de escenario en la URL, `resetOnChange`, tests de componentes, `getWindowStats` en la UI (2026-09-20)
- [x] Fase 2 — frontend-expert: integración de `useSimulationLoop`/`drawRiver` en `RiverCanvas.tsx`, modo proyector, favicon, y correcciones UX-01/02/03/04/06(refuerzo)/07/09 de [[informe-uiux-2026-09-19]] (2026-09-20)
- [x] Verificación combinada Fase 2: `npm test` 32/32 verde, `npm run build` verde (2026-09-20)
- [x] Fase 3 — react-expert (R3): experimento guiado `GuidedExperiments.tsx` con los 4 experimentos del guion, resuelve UX-08 (2026-09-20)
- [x] Fase 3 — uiux-reviewer (U2): re-auditoría completa, sin Críticos/Altos abiertos, 3 hallazgos nuevos (N-10/N-11/N-12) (2026-09-20)
- [x] Fase 3-correcciones — react-expert: N-10 (foco tras transiciones) y N-11 (`aria-live` en la pregunta) resueltos (2026-09-20)
- [x] Fase 3-correcciones — frontend-expert: N-12 (panel empuja el canvas en tablet) resuelto con `<details>` colapsado (2026-09-20)
- [x] Fase 3 — backend-expert (B5, B6): perfilado de rendimiento (hasta 20 000 partículas muy por debajo de 8ms/frame) → decisión de NO usar Web Worker; revisión de `urlParams.ts` → decisión de NO crear `api/**` (2026-09-20)
- [x] Verificación combinada Fase 3: `npm test` 39/39 verde, `npm run build` verde (2026-09-20)
- [x] Skills propias de física para `backend-expert` (3 skills) confirmadas activas: symlinks en `.claude/skills/`, `backend-expert.md` con herramienta `Skill` + regla de precedencia diagnóstica (2026-09-20)
- [x] Fase 4 — `vercel-deploy-expert` V2-V3 (parcial): proyecto vinculado a Vercel (`dev-ia2/app`), deploy hecho y prueba de humo (Playwright) exitosa. **Vercel marcó el deploy como "production" automáticamente** (primer deploy del proyecto, sin `--prod` explícito) — queda como decisión pendiente del usuario en "Ahora". V4 (producción explícita) sigue sin ejecutarse (2026-09-20)
- [x] Diagnóstico del feedback del usuario ("no quedó bien ni en física ni en visual") y diseño del prompt de rediseño con los 6 subagentes existentes, guardado en [[../03-Activos/prompt-revamp-2026-09-20]] (2026-09-20)
- [x] **Revamp visual + comportamiento, ejecución completa** (2026-09-20): causa raíz del reset-en-cada-tick del slider corregida (`react-expert`), identidad visual "instrumento de campo" implementada (`frontend-expert`), nueva paleta de grano y evaluación documentada del fix numérico de grava sub-resuelta (`backend-expert`), re-auditoría con criterio de diseño: 9/10 hallazgos D1-D10 resueltos + N1/N2 resueltos (`uiux-reviewer`). 43/43 tests, build limpio. No se tocó Vercel/producción ni se hizo `git commit`. Detalle en [[decisiones]] e [[informe-uiux-2026-09-19]]. Queda pendiente en "Ahora": confirmación del usuario tras probar la app en su navegador.
