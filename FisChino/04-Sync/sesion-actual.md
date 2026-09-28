---
tipo: sync
fecha: 2026-09-20
---

# Sesión Actual

**Fecha:** 2026-09-20 (cierre de la ronda de revamp visual + comportamiento, más un fix post-cierre)
**Proyecto:** [[../00-Proyecto/README|ExpoFisChino]]

## Qué pasó en este bloque (fix post-cierre: acumulación de grava en remanso profundo)
Tras cerrar el revamp (ver sección siguiente), el usuario probó la app y reportó: "la grava se acumula de manera infinita y no natural en ciertas condiciones, como por ejemplo en el experimento de crecida a sequía con velocidad de agua a 2 m/s, remanso 3.8, profundidad 3 y demás."

- **Diagnóstico (`backend-expert`):** siguiendo el protocolo de la skill `calibracion-numerica-lagrangiana`, se confirmó que es física real, no un bug de contabilidad (invariante de masa exacto en todo momento). Con `depth=3, poolFactor=3.8` el remanso queda con `τ≈0.67 Pa`, solo 21% del `τ_ce` de la grava — la resuspensión nunca ocurre a estos parámetros, así que la grava depositada queda atrapada de forma permanente y crece sin plateau. Es la manifestación extrema de la limitación #3 ya declarada de `modelo-rio-efc` (sin lecho evolutivo / sin realimentación morfológica). Se decidió explícitamente **no tocar el motor** (parchar un caso límite fuera del rango antes probado contradice el criterio de no ajustar un mecanismo para tapar un resultado físicamente correcto; una realimentación lecho→hidráulica real es un modelo morfodinámico completo, fuera de alcance). Se agregó un test de regresión de comportamiento documentado y una entrada nueva en la tabla de rangos de `modelo-rio-efc` (`poolFactor≥3` con `depth≥2` requiere cautela).
- **Corrección visual (`frontend-expert`):** en `src/render/drawRiver.ts` faltaba un tope de altura del apilado de depósito respecto a la columna de agua local — el hallazgo D2 de la auditoría del revamp solo se había resuelto con suavizado de contorno + textura, no con el tope de altura que esa misma auditoría también sugería. Con los parámetros extremos reportados, la pila perforaba la superficie del agua y casi tocaba el borde del canvas. Se agregó `maxDepositPx` por bin (columna local menos margen visible, mínimo 6px o 12%); si la demanda de las 5 clases lo excede, se comprime PROPORCIONALMENTE toda la pila del bin (sin tocar el dato real de `getBinsSnapshot`, ni truncar una clase arbitrariamente). Bins comprimidos se marcan "colmatados" con textura de aspas de advertencia. Verificado con Playwright en el escenario exacto reportado. Único archivo tocado: `src/render/drawRiver.ts`.
- **Nota de proceso:** `backend-expert` escribió su parte directamente en la bóveda (se salió del flujo normal, solo el bibliotecario debería escribir ahí); la entrada quedó correcta y se completó con la parte de frontend. De aquí en adelante todo vuelve a pasar por el bibliotecario.
- **Verificación combinada final:** `npm test` 45/45 verde (43 base + 2 tests nuevos del caso límite), `npm run build` limpio.

Detalle técnico completo en [[../00-Proyecto/decisiones]] (entrada "Corrección post-cierre: acumulación de grava 'infinita' en remanso profundo").

## Qué pasó en el bloque anterior (revamp — ejecución completa)
Se ejecutó el prompt de rediseño planeado en el bloque previo ([[../03-Activos/prompt-revamp-2026-09-20]]) sobre `D:\Proyectos\ExpoFisChino\app`, con los mismos 6 subagentes.

- **Disparador (ya registrado antes):** el usuario probó la app de la ronda de cierre anterior (Fases 1-3 completas, `uiux-reviewer` había dado "sin hallazgos Críticos/Altos" en U2) y no quedó conforme, "ni en física ni en visual". Por qué esto no contradice U2: esa ronda midió accesibilidad/usabilidad (Nielsen + WCAG); esta ronda usó un criterio distinto — diseño/estética + plausibilidad física en movimiento — que U2 nunca evaluó. Detalle completo en [[../00-Proyecto/decisiones]].
- **Paso 1, diagnóstico:** `backend-expert` encontró la causa raíz más probable del "no convence viéndola correr": `App.tsx` reseteaba el motor completo en cada tick de arrastre de los sliders (no solo al soltar), por usar `onChange` de `<input type="range">` con `resetOnChange:true`. También detectó que los `DEFAULT_PARAMS` anteriores escondían el fenómeno de deposición (4/5 clases nunca depositaban) y que la grava queda numéricamente sub-resuelta en el mínimo de profundidad (ya anticipado en la skill `calibracion-numerica-lagrangiana`). `uiux-reviewer` encontró 10 hallazgos de diseño (D1-D10): sin textura/movimiento en el agua, depósito de grava que parecía bug de render, sin jerarquía visual, paleta "SaaS genérico" con colores de grano arbitrarios, panel de resultados sobrecargado, etc.
- **Paso 2, dirección visual aprobada por el usuario:** concepto "panel de instrumento de campo" (estación de aforo hidráulico), chrome oscuro (`--bg #10161c`, `--accent #2fb8c4`, `--accent-2 #e8a23d`), escala de color de grano tierra→piedra coherente con el diámetro físico, tipografía monoespaciada del sistema con `tabular-nums` para datos.
- **Paso 3, implementación por propiedad de archivo:** `react-expert` arregló el bug del reset (separó "live update" de "commit" al soltar el slider), aplicó los nuevos `DEFAULT_PARAMS` recomendados por `backend-expert`, subió `capacity` 8000→16000. `frontend-expert` reescribió `drawRiver.ts` (agua con gradiente y líneas de flujo animadas, depósito con textura granulada), toda la paleta/tipografía, jerarquía del panel de Resultados (`<details>` en 2 niveles), orden móvil. `backend-expert` aplicó la nueva escala de color de grano y evaluó (implementó, perfiló y **descartó por costo**, documentado) un fix numérico para la grava sub-resuelta.
- **Paso 4, re-auditoría con el mismo criterio nuevo:** `uiux-reviewer` confirmó 9/10 hallazgos D1-D10 resueltos con evidencia (capturas + secuencia de movimiento + arrastre de slider sin soltar), encontró 2 hallazgos menores nuevos (N1: modo proyector no pintaba el panel nivel 2 en Chromium por `::details-content`; N2: contraste bajo AA en `td.neg`), ambos resueltos en una ronda corta de `frontend-expert`. `backend-expert` reconfirmó comportamiento correcto del motor tras los cambios (remanso, deposición por clase, runway de saturación ~91s, invariante de masa).
- **Veredicto final de `uiux-reviewer`:** la app ya no se ve como dashboard genérico ni como bug visual — se ve como un instrumento científico legible con identidad propia (fotorrealismo de agua descartado a propósito como esfuerzo desperdiciado para una app didáctica).

Detalle técnico completo (causa raíz, tabla D1-D10, valores de paleta, decisiones de cada subagente) en [[../00-Proyecto/decisiones]] (entrada "Revamp visual + comportamiento (ejecución completa)") y en [[../00-Proyecto/informe-uiux-2026-09-19]] (sección "Ronda 3").

## Qué NO se tocó en este bloque
- Nada de Vercel/producción/deploy (regla explícita de esta ronda y del fix post-cierre, tema aparte, sigue pendiente de decisión del usuario).
- Ningún `git commit`/`git push` — el usuario no lo ha pedido todavía; los cambios están en el árbol de trabajo de `D:\Proyectos\ExpoFisChino\app` sin confirmar en git.
- `api/**` — ni el revamp ni el fix post-cierre tocaron nada de backend serverless.
- `src/sim/engine.ts` / `src/sim/physics.ts` no se tocaron en el fix post-cierre (decisión explícita de no cambiar el motor).

## Pendiente / Próximos Pasos
1. **El usuario revisa la app corriendo en su navegador y confirma si ahora sí queda conforme**, incluyendo el escenario de grava en remanso profundo que reportó. Si aprueba, considerar `git commit`/`git push` (no hecho, no pedido).
2. **Decisión del usuario (bloqueante, sin relación con el revamp ni el fix):** qué hacer con la etiqueta "production" del primer deploy de Vercel.
3. **Recomendado, no confirmado:** rotar/deshabilitar el secreto de "Protection Bypass for Automation" desde el dashboard de Vercel.
4. Retomar Fase 4 una vez resuelto lo anterior: V4 (producción explícita) solo con autorización adicional del usuario; conectar GitHub a Vercel para previews por PR, si el usuario lo quiere (manual).
5. Confirmar con el usuario: ¿Node pineado a 22.x o subir a 24.x? (bloqueante desde Fase 1, sigue abierto).
6. Completar en el README la fecha de la expo.

## Resumen de rondas anteriores (para no perder el hilo)
- **Fases 1, 2 y 3 (2026-09-19/20):** física validada, integración de UI/React, experimentos guiados, re-auditoría U2 sin hallazgos Críticos/Altos abiertos. Detalle en [[../00-Proyecto/decisiones]], [[../00-Proyecto/roadmap]] e [[../00-Proyecto/informe-uiux-2026-09-19]].
- **Fase 4 (Vercel) — parcial, sigue abierta.** Proyecto vinculado (`dev-ia2/app`), deploy hecho con `vercel deploy` (sin `--prod`) que Vercel marcó automáticamente como "production" (comportamiento nativo del primer deploy). Prueba de humo (V3) exitosa con Playwright. URLs en [[../01-Referencias/urls]]. V4 (producción explícita) nunca se ejecutó ni se ejecutará sin autorización separada.
- **Tooling:** 6 skills externos de skills.sh + 3 skills propios de física para `backend-expert`, confirmados activos como symlinks en `.claude/skills/`. Total: 9 skills instalados.
- **Verificación de esta ronda (revamp):** `npm test` 43/43 verde (39 base + 4 nuevas de regresión del fix de reset). `npm run build` limpio, sin warnings. Sin errores de consola en ninguna auditoría Playwright.
- **Verificación del fix post-cierre:** `npm test` 45/45 verde (43 base + 2 tests nuevos del caso límite de remanso profundo). `npm run build` limpio.

## Bloqueantes
1. **Aprobación del usuario sobre el resultado del revamp + el fix post-cierre** (no es un bloqueante externo, es la confirmación pendiente del trabajo recién hecho).
2. Decisión del usuario sobre la etiqueta "production" del primer deploy de Vercel.
3. Rotación/deshabilitación (recomendada, no confirmada) del secreto de "Protection Bypass for Automation".
4. V4 (despliegue a producción explícito) requiere autorización adicional del usuario, no dada.
5. Confirmación del usuario sobre versión de Node (22.x pineado vs. 24.x local).
