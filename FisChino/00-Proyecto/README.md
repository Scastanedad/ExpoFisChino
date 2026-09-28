---
tipo: proyecto
estado: activo
última-actualización: 2026-09-20
tags: [expofischino, efc]
---

# ExpoFisChino

**Estado:** 🟢 Activo
**Última actualización:** 2026-09-20

## Resumen
Simulación web, para público universitario, que representa cómo un río transporta sedimentos. El usuario modifica la velocidad del agua y observa cuántas partículas se transportan hasta el final del río y cuántas se depositan antes al perder capacidad de transporte.

## Objetivo Principal
- [x] Slider de velocidad que cambia en tiempo real transportado vs depositado (MVP v0.1)
- [x] Mostrar el porqué físico: Rouse, τ/τce, diagrama de Hjulström del modelo
- [x] Validar la física con fuentes y métricas de estado estacionario (backend, `src/sim/**`)
- [x] Integrar esas métricas de estado estacionario en la UI de resultados (react-expert, Fase 2)
- [x] URL compartible (react-expert, Fase 2)
- [x] `frontend-expert` integra `useSimulationLoop`/`drawRiver` en `RiverCanvas.tsx` (Fase 2, completo)
- [x] Correcciones UI/UX ronda 1 (UX-01 a UX-07, UX-09; ver [[informe-uiux-2026-09-19]])
- [x] Experimentos guiados (Fase 3, `GuidedExperiments.tsx`, resuelve UX-08)
- [x] Re-auditoría UI/UX ronda 2 (U2): sin Críticos/Altos abiertos, ver [[informe-uiux-2026-09-19]]
- [x] Skills propias de física para `backend-expert` (3 skills, activas: symlinks en `.claude/skills/`, `backend-expert.md` reescrito con herramienta `Skill`)
- [x] **Revamp visual + comportamiento completo** (2026-09-20): causa raíz del reset-en-cada-tick del slider corregida, identidad visual nueva "instrumento de campo" implementada, re-auditoría con criterio de diseño (9/10 hallazgos D1-D10 resueltos, N1/N2 resueltos), 43/43 tests, build limpio. Ver [[decisiones]] e [[informe-uiux-2026-09-19]]. **Pendiente: confirmación del usuario tras probarla en el navegador.**
- [~] Desplegar en Vercel (Fase 4, parcial — V2/V3 hechos: proyecto vinculado, deploy con prueba de humo exitosa; V4 producción NO ejecutado, requiere autorización explícita del usuario; además queda una decisión pendiente sobre la etiqueta "production" que puso Vercel automáticamente)

## Estado Actual
- **Fix post-cierre (2026-09-20):** el usuario reportó acumulación "infinita" de grava en remanso profundo (`velocity=2, depth=3, poolFactor=3.8`); diagnosticado como física real (no bug, limitación conocida sin realimentación lecho→hidráulica) y acotado visualmente con un clamp proporcional en `drawRiver.ts`. Detalle en [[decisiones]].
- **Fase:** Revamp visual + comportamiento **completo y verificado** (2026-09-20). El usuario había probado la app de la ronda de cierre anterior (Fases 1-3 completas, re-auditoría U2 "sin hallazgos Críticos/Altos") y no quedó conforme "ni en física ni en visual". Se ejecutó el prompt de rediseño ([[../03-Activos/prompt-revamp-2026-09-20]]) con los 6 subagentes: diagnóstico crítico con criterio de diseño/comportamiento (no el checklist de accesibilidad, ya superado), dirección visual "instrumento de campo" aprobada por el usuario, implementación por los 3 subagentes de código, y re-auditoría con el mismo criterio nuevo. Por qué esto no contradice el veredicto U2 anterior: son varas distintas (accesibilidad/usabilidad vs. diseño/estética + plausibilidad física en movimiento) — detalle completo en [[decisiones]].
- **Qué se corrigió:** bug crítico de comportamiento — cada tick de arrastre de un slider (no solo al soltar) disparaba un `reset()` completo del motor, root cause de "no convence viéndola correr" — separado en "live update" (sin reset) vs. "commit" al soltar (`react-expert`). Identidad visual completa nueva, chrome oscuro tipo estación de aforo hidráulico, paleta de grano coherente con el diámetro físico, río con textura/movimiento real, depósito de grava ya no parece un bug de render, jerarquía visual y orden móvil corregidos (`frontend-expert`). Escala de color de grano y nuevos `DEFAULT_PARAMS`/`capacity` con justificación física, evaluación (y descarte documentado, por costo) de un fix numérico de grava sub-resuelta (`backend-expert`). Re-auditoría (`uiux-reviewer`): 9/10 hallazgos de diseño (D1-D10) resueltos con evidencia, 2 hallazgos menores nuevos (N1/N2) resueltos en una ronda corta. Detalle completo por subagente en [[decisiones]] y tabla D1-D10/N1-N2 en [[informe-uiux-2026-09-19]].
- **Progreso:** 43/43 pruebas Vitest (39 base + 4 nuevas de regresión del fix de reset), `npm run build` limpio sin warnings, sin errores de consola en ninguna auditoría Playwright. **No se hizo `git commit` ni `git push`** — el usuario no lo ha pedido todavía.
- **Fases 1-3 (ronda anterior, ya completas, para no perder el hilo):** física validada, UI/UX integrada, experimentos guiados, re-auditoría U2 sin hallazgos Críticos/Altos — detalle en [[decisiones]], [[roadmap]] e [[informe-uiux-2026-09-19]]. **Fase 4 (Vercel) sigue parcial:** V2-V3 ejecutados (proyecto vinculado, deploy y prueba de humo con Playwright exitosa); **V4 (producción explícita) no se ejecutó ni se ejecutará sin autorización separada del usuario.** Esta ronda de revamp no tocó nada de Vercel/producción (regla explícita). Detalle en [[../04-Sync/sesion-actual]].
- **Deadline:** N/D
- **Bloqueantes:**
  1. Decisión del usuario sobre la etiqueta "production" que Vercel puso automáticamente al primer deploy — el usuario pidió "revisar antes de decidir" qué hacer (aceptarla tal cual o gestionarla de otra forma).
  2. Recomendado, no confirmado: rotar o deshabilitar desde el dashboard de Vercel (Project Settings → Deployment Protection) el secreto de "Protection Bypass for Automation" generado para la prueba de humo — quedó momentáneamente visible en la salida de herramientas (transcript) del subagente, nunca se escribió a ningún archivo del repo ni quedó en disco (`git status` limpio confirmado), pero se recomienda rotarlo si el usuario prefiere no confiar en que quedó solo en el transcript.
  3. V4 (despliegue a producción explícito) requiere autorización adicional del usuario, no dada.
  4. Confirmación del usuario sobre versión de Node (22.x pineado vs. 24.x local).
  5. Conectar GitHub a Vercel para previews automáticos por PR: se intentó automáticamente y falló por permisos de la GitHub App (correcto y esperado, no se otorgó ningún permiso); sigue pendiente si el usuario lo quiere hacer manualmente desde el dashboard.
  (Bloqueantes 1-5 son de la Fase 4/Vercel, sin relación con el revamp; ver detalle en [[roadmap]] y [[../04-Sync/sesion-actual]].)

## Tech Stack
Ver [[../01-Referencias/tech-stack]] y [[arquitectura]]

## Personas Clave
| Nombre | Rol | Contexto |
|--------|-----|----------|
| Sam | Autor del proyecto | Público objetivo: universidad |

## Links Importantes
- Carpeta de la bóveda: `D:\Proyectos\ExpoFisChino\FisChino`
- Código del MVP: `D:\Proyectos\ExpoFisChino\app`
- Repo: https://github.com/Scastanedad/ExpoFisChino.git (`origin`, rama `main`)
- Referencias: [[../01-Referencias/urls]]
- Primer prompt para Claude Code: [[../03-Activos/prompt-inicial-claude-code]]
- Informe UI/UX ronda 1: [[informe-uiux-2026-09-19]]

## Skills relacionadas
**Propias del proyecto, para `backend-expert`** (symlinks en `.claude/skills/`, sin entrada en `skills-lock.json` por ser locales, no del marketplace — su contenido vive en `.agents/skills/`): `fisica-transporte-sedimentos` (teoría y fuentes citables), `modelo-rio-efc` (el modelo concreto verificado contra `src/sim/`, se actualiza en el mismo commit que `src/sim/`), `calibracion-numerica-lagrangiana` (método numérico y protocolo de ajuste). `backend-expert.md` tiene la herramienta `Skill` y la regla de precedencia diagnóstica (masa → dt → ruido estadístico → casos analíticos → parámetro físico). Detalle en [[decisiones]].
**Externas** (skills.sh): `frontend-design`, `design-taste-frontend` (+v1) → `frontend-expert`; `deploy-to-vercel` → `vercel-deploy-expert`; `wcag-accessibility-audit` → `uiux-reviewer`; `find-skills` a nivel de sesión. (6 skills externos + 3 propios = 9 skills instalados en total.)
**De cuenta:** `arquitectura-simulaciones-web` aplicada (estado fuera de React, typed arrays, Canvas 2D). `electromagnetismo-computacional` no aplica.

## Siguiente Paso
1. **El usuario revisa la app corriendo en su navegador** (`D:\Proyectos\ExpoFisChino\app`) y confirma si "esta vez sí se ve bien y se comporta bien" — ese es el criterio real de cierre de esta ronda, no un checklist de hallazgos (el checklist de diseño ya está en 9/10 D1-D10 + N1/N2 resueltos, ver [[decisiones]] e [[informe-uiux-2026-09-19]]). Si el usuario aprueba, considerar hacer `git commit`/`git push` (no hecho todavía, no pedido).
2. **Decisión del usuario (bloqueante, sin relación con el revamp):** qué hacer con la etiqueta "production" que Vercel puso automáticamente al primer deploy (`vercel deploy` sin `--prod`), y si rota/deshabilita el secreto de "Protection Bypass for Automation" generado para la prueba de humo.
3. Retomar Fase 4 solo cuando el usuario decida: V4 (producción explícita) requiere autorización adicional; conectar GitHub a Vercel para previews por PR queda pendiente y manual si se quiere.
Ver [[roadmap]] y [[../04-Sync/sesion-actual]].
