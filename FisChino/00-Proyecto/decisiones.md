---
tipo: decisiones
última-actualización: 2026-09-28
---
Q
# Decisiones Arquitectónicas — ExpoFisChino

Una entrada por decisión, más reciente arriba.

## Lecho evolutivo (Exner + ángulo de reposo): fin de la acumulación "infinita" de grava en puntos extremos
**Fecha:** 2026-09-28  **Impacto:** Alto  **Estado:** implementado, `npm test` 48/48, `npm run build` limpio, verificado con Playwright

El usuario volvió a reportar que la grava se acumula en puntos extremos y pidió corregirlo y revisar la física. Se revierte la decisión del 2026-09-20 de "no tocar el motor": el clamp visual tapaba el síntoma, pero la causa era física (faltaba la realimentación lecho→flujo). Reproducción: con `U=2, h=3, remanso=3.8`, 96 % de la grava en un solo bin de 2 m (x≈44 m); con `U=0.05` o `U=0.3, h=0.5`, miles de partículas en el bin justo después de la zona de entrada (x=10 m).

- `src/sim/engine.ts`: cada partícula es una parcela; al depositarse sube el lecho de su bin `BED_DZ_PER_PARTICLE=0.005 m` (Exner). La hidráulica usa `h = h₀ − η` (con `h₀` la geometría base) y se recalcula cuando el lecho cambia; por continuidad, sobre la barra suben U y τ, y el depósito se frena solo cuando τ≈τce. Después la barra prograda (delta). Ángulo de reposo 32° (avalancha entre bins vecinos) y lámina mínima `0.1·depth` (bin colmatado → el sedimento pasa por encima).
- Validación: altura de equilibrio de la barra de grava en el remanso profundo ≈ 5.75 m, igual al valor analítico de `q = h·(u*c/κ)(ln(h/z₀)−1)`; aguas arriba τ/τce converge a 1.01.
- `src/render/drawRiver.ts`: el depósito se dibuja con su espesor físico (misma escala que el agua) sobre el lecho base `h0At`; se elimina el clamp proporcional (ya no hace falta), se mantiene la marca "colmatado".
- Tests: el describe "caso límite" (que documentaba crecimiento sin límite) se reemplazó por 5 tests de equilibrio, reposo, lámina mínima, coherencia lecho/conteos y reset.
- Revisión de física de `physics.ts` (D*, ws, θcr, ley de la pared, Rouse) y del paseo aleatorio (esquema de Visser): sin errores. Simplificación conocida, no cambiada: la grava en carga de fondo avanza a la velocidad del fluido a `z_b`, no con el retraso de partícula de Fernández Luque & van Beek.
- Skill `modelo-rio-efc` actualizada (sección "Lecho evolutivo", limitación #3 reescrita).

## Corrección post-cierre: acumulación de grava "infinita" en remanso profundo — diagnóstico, no bug, documentación de limitación conocida
**Fecha:** 2026-09-20  **Impacto:** Medio  **Estado:** resuelto por ambos lados — `backend-expert` diagnosticó y documentó (dato real sin cambios de motor) y `frontend-expert` acotó la representación visual con un clamp proporcional; test de regresión agregado; **sin cambios de motor** (decisión explícita de no tocar `src/sim/engine.ts`); `npm test` 45/45 verde, `npm run build` limpio

### Contexto
Tras el revamp de la entrada anterior, el usuario probó la app y reportó: "la grava se acumula de manera infinita y no natural en ciertas condiciones, como por ejemplo en el experimento de crecida a sequía con velocidad de agua a 2 m/s, remanso 3.8, profundidad 3 y demás." Esta combinación (`velocity=2, depth=3, poolFactor=3.8`) está fuera del rango instrumentado hasta entonces (`depth` sólo se había probado a fondo hasta 1, `poolFactor` hasta 3).

### Diagnóstico (`backend-expert`)
Siguiendo el protocolo de la skill `calibracion-numerica-lagrangiana` (masa → dt → ruido → analítico → física), se reprodujo el escenario exacto con el motor (`feedRate=20`, mezcla por defecto) y se corrió 900 s simulados midiendo depósito por bin y por clase.

- **Invariante de masa se mantiene exacto** en todo momento (`injected = exited + deposited + suspended`, por clase). No es un bug de contabilidad.
- El depósito solo crece en **grava** (las otras 4 clases no cruzan su umbral de depósito en este remanso). Se concentra en 1-2 bins justo donde `τ(x)` cruza `τ_ce` de la grava, cerca del borde de entrada al remanso (~x=44-46 m) — no está disperso ni en un bin con índice erróneo.
- **Causa raíz:** con `h_remanso = depth·poolFactor = 11.4 m`, por continuidad `τ_remanso ≈ 0.67 Pa`, solo 21% del `τ_ce` de la grava (3.25 Pa). La resuspensión (`ex=τ/τ_ce > 1`) **nunca ocurre** a estos parámetros: la grava que se deposita ahí queda atrapada de forma permanente. Con aporte continuo, el depósito crece de forma monótona y sin plateau, acotado solo por la `capacity` global del motor (no por ningún mecanismo físico).
- Esto es exactamente la limitación ya declarada #3 de `modelo-rio-efc` ("sin lecho evolutivo": depositar no cambia `h` ni `τ`, no hay realimentación morfológica), llevada a un extremo visualmente dramático por la combinación `depth` alto + `poolFactor` alto. Cualitativamente es el mismo fenómeno que un delta en la cabecera de un embalse (la carga de fondo se agota donde el flujo pierde competencia); lo irreal es la magnitud, porque en un río real el delta progradaría, subiría la cota local y recuperaría algo de competencia — la realimentación que este modelo no tiene.

### Decisión — no se cambió el motor
Se evaluó explícitamente agregar un tope de capacidad de bin (resuspender/redistribuir al superar cierta altura) y se **descartó**:
1. Ya es una limitación declarada y aceptada del modelo (`modelo-rio-efc` §5), no un bug — parchar el motor para un caso límite fuera del rango antes probado contradice el criterio de "no ajustar un parámetro/mecanismo para tapar un resultado físicamente correcto".
2. Una realimentación lecho→hidráulica real es un modelo morfodinámico completo (subir `h`/`z₀` localmente al depositar, recalcular `τ`), fuera de alcance esta ronda, con riesgo de alterar resultados ya validados en otros experimentos (remanso, clasificación granulométrica).
3. Un tope de bin puramente numérico sería un parche sin respaldo físico.

Se documentó con datos la "manifestación extrema" de la limitación #3 en `modelo-rio-efc` (nueva entrada en la tabla de rangos de parámetros: `poolFactor≥3` con `depth≥2` requiere cautela), y se avisó a `frontend-expert` para que decida el tratamiento visual/UX (aviso de "fuera de rango validado", límite de slider, o similar) — la responsabilidad de comunicar el caso queda del lado de UI, no del motor.

### Test de regresión agregado
`src/sim/sim.test.ts`, describe "caso límite: remanso profundo sin resuspensión posible": confirma `τ_remanso < 0.3·τ_ce` de la grava (sin vía de resuspensión), confirma crecimiento monótono sustancial del depósito de grava entre t=300s y t=900s sin saturar `capacity`, confirma invariante de masa, y confirma que el depósito está concentrado (>90%) en los bins cercanos al borde de entrada al remanso (protege contra una futura regresión de índice de bin). Marcado explícitamente como test de comportamiento documentado: si algún día se agrega realimentación lecho→hidráulica, hay que revisarlo y actualizarlo a propósito.

### Corrección visual (`frontend-expert`)
A `backend-expert` se le encargó el diagnóstico y a `frontend-expert` el tratamiento visual/UX del caso límite; esto es esa segunda parte, misma decisión.

En `src/render/drawRiver.ts` faltaba un clamp/tope de altura del apilado de depósito respecto a la columna de agua local (`hAt`) — el hallazgo D2 original de la auditoría de la ronda de revamp (ver entrada "Revamp visual + comportamiento" arriba) solo se había resuelto con suavizado de contorno + textura granulada, no con el tope de altura que esa misma auditoría también sugería. Con parámetros extremos (`velocity=2, depth=3, poolFactor=3.8`, el escenario exacto reportado por el usuario) la pila de depósito crecía como una pared vertical que perforaba la superficie del agua y casi tocaba el borde superior del canvas — no era el mismo bug de "bloque sólido" de D2, sino un caso nuevo de altura sin tope, alcanzable solo en la combinación extrema de parámetros que `backend-expert` diagnosticó como la causa física real.

Corrección aplicada: por cada bin se calcula `maxDepositPx` (la columna de agua local menos un margen visible, con un mínimo de 6px o 12% de la columna, lo que sea mayor); si la demanda de altura combinada de las 5 clases de grano excede ese tope, se comprime **proporcionalmente** toda la pila del bin (mantiene las proporciones relativas entre clases de grano — no trunca una clase arbitrariamente). El dato real que devuelve `getBinsSnapshot` no se toca, solo su representación visual en el canvas. Los bins comprimidos (colmatados) se marcan con una textura de aspas de advertencia (mismo lenguaje visual que el rayado de la zona de entrada) y una etiqueta condicional cuando hay espacio para mostrarla.

Verificado con Playwright en el escenario exacto reportado por el usuario, corriendo varios minutos simulados: la pila queda contenida bajo el agua con margen visible, ya no perfora la superficie ni el borde del canvas. Único archivo tocado: `src/render/drawRiver.ts`.

### Implicaciones
- No se tocó `src/sim/engine.ts` ni `src/sim/physics.ts` (solo se leyeron/instrumentaron para el diagnóstico) — el dato real de depósito sigue siendo el mismo, documentado como limitación conocida #3 de `modelo-rio-efc`.
- `src/render/drawRiver.ts` sí se tocó (`frontend-expert`): tope de altura proporcional por bin sobre la columna de agua local, sin alterar el dato subyacente.
- Caso considerado cerrado por ambos lados: física real documentada como limitación conocida (no se parcha el motor) + representación visual acotada para que no rompa la lectura del canvas en los parámetros extremos que el usuario probó.
- Ver [[../01-Referencias/glosario]] si se agrega terminología nueva relacionada (delta de cabecera de embalse).

### Verificación
`npm test`: 45/45 verde (43 base + 2 tests nuevos del caso límite). `npm run build`: limpio. Verificación combinada final corrida por el orquestador tras ambos fixes (backend + frontend).

## Revamp visual + comportamiento (ejecución completa): causa raíz del reset en cada tick del slider, nueva identidad visual "instrumento de campo", re-auditoría con criterio de diseño
**Fecha:** 2026-09-20  **Impacto:** Alto  **Estado:** implementado en `src/App.tsx`, `src/components/Controls.tsx`, `src/sim/physics.ts`, `src/sim/engine.ts`, `src/styles.css`, `src/render/drawRiver.ts`, `src/components/Metrics.tsx`, `src/components/HjulstromChart.tsx`, `src/components/DepositChart.tsx`, `public/favicon.svg`, `src/components/App.test.tsx`; verificado (`npm test` 43/43, `npm run build` limpio); **sin `git commit`/`git push`** (no pedido por el usuario todavía)

### Contexto
Ejecución del prompt de rediseño planeado en la entrada anterior ([[../03-Activos/prompt-revamp-2026-09-20]]), sobre `D:\Proyectos\ExpoFisChino\app`, con los mismos 6 subagentes. Recordatorio del disparador: el usuario probó la app de la ronda de cierre anterior (Fases 1-3 completas, `uiux-reviewer` había dado veredicto "sin hallazgos Críticos/Altos abiertos" en la re-auditoría U2 del 2026-09-19/20) y no quedó conforme, dijo textualmente que no quedó bien "ni en física ni en visual", y pidió un revamp visual completo (repensar de cero, no parchar).

### Por qué esto NO contradice el veredicto U2 anterior
La auditoría U2 midió heurísticas de Nielsen + WCAG 2.1 AA (accesibilidad/usabilidad) y dio correctamente "sin hallazgos" para ESE criterio. Esta ronda usó un criterio distinto y explícito — juicio de diseño/estética (paleta, tipografía, composición, plausibilidad visual del río) y plausibilidad del comportamiento físico observado en movimiento durante minutos, no en una fórmula aislada — que la auditoría anterior nunca evaluó. Son varas distintas; la app podía ser accesible y usable y aun así no "verse bien" ni "sentirse correcta" corriendo. Se deja explícito aquí para que la bóveda no suene contradictoria entre las dos rondas.

### Diagnóstico nuevo (Paso 1) que la auditoría anterior no vio

**Comportamiento (`backend-expert`):**
1. **CRÍTICO, causa raíz confirmada por lectura de código:** `App.tsx` llamaba `engine.setParams({...params, resetOnChange:true})` en cada `onChange` de los sliders, y como `<input type="range">` dispara `onChange` en cada tick de arrastre (no solo al soltar), cada tick con un valor de velocity/depth/poolFactor/feedRate/mix distinto disparaba un `reset()` completo del motor. Root cause más probable de "no me convence viéndola correr" — el experimento guiado de Hjulström pedía explícitamente "mueve el slider lentamente", lo que producía decenas de resets encadenados.
2. Los `DEFAULT_PARAMS` anteriores (velocity=0.6, depth=1, poolFactor=1, feedRate=20) escondían el fenómeno: con esos valores, 4 de 5 clases de grano nunca depositaban (τ nunca bajaba de τ_cd) y el remanso estaba desactivado (poolFactor=1) — la demo "en frío" casi no mostraba nada.
3. Grava numéricamente sub-resuelta cuando `depth` se lleva a su mínimo (0.5 m): `w_s·dt > z_b` — ya anticipado en la skill `calibracion-numerica-lagrangiana` §2, ahora confirmado alcanzable desde el slider de la UI.

**Diseño (`uiux-reviewer`, hallazgos D1-D10, resumen de los más graves — tabla completa en [[informe-uiux-2026-09-19]]):**
- D1: agua/lecho sin textura ni movimiento, partículas sin profundidad → lee como scatter-plot sobre fondo de color, no como río.
- D2: el depósito de grava se renderizaba como bloque sólido opaco que parecía un bug de render, no un banco de grava — justo el momento más "vistoso" de cualquier demo.
- D3: sin jerarquía visual — 6-7 secciones en cards blancas idénticas, el río (protagonista) competía en igualdad de peso con un `<select>`; en móvil el canvas quedaba ~4 pantallas de scroll por debajo de todos los controles.
- D4/D5: paleta "SaaS dashboard genérico" sin intención de río/geociencia; los 5 colores de clase de grano eran una selección arbitraria del círculo cromático (la grava era morada).
- D6-D10: panel de Resultados sobrecargado (hoja de cálculo, no tablero de expo), gráficos SVG desentonados con el canvas, botones sin diferenciar por categoría, sin identidad visual, jerarquía tipográfica floja dentro del canvas.

### Decisión — qué se cambió (Pasos 2-4)

**Paso 2, dirección visual aprobada por el usuario:** concepto "panel de instrumento de campo" (como una estación de aforo hidráulico), chrome oscuro. Paleta UI: `--bg #10161c`, `--surface #1a222b`, `--surface-2 #212b36`, `--line #2c3947`, `--ink #eef2f5`, `--accent #2fb8c4` (controles físicos), `--accent-2 #e8a23d` (reproducción/tiempo). Escala de color de grano nueva, tierra→piedra, coherente con el diámetro físico: arcilla `#3a2a1e` → limo `#7d5a35` → arena fina `#c08a3f` → arena media `#e0a95c` → grava `#d6cdbd` (reemplaza los 5 colores arbitrarios anteriores). Tipografía: sin webfonts nuevos, `system-ui` para prosa, monoespaciado del sistema con `tabular-nums` para todo dato numérico (KPIs, tabla, etiquetas del canvas).

**Paso 3, implementación, por propiedad de archivo:**
- `backend-expert` (`src/sim/physics.ts`, `src/sim/engine.ts`): aplicó la nueva escala de color de grano (único campo `color` tocado). Recomendó los nuevos `DEFAULT_PARAMS` con justificación física (τ dentro/fuera del remanso). Evaluó el fix numérico de grava sub-resuelta (`maxStep` adaptativo `min(maxStep, 0.2·z_b/w_s_max)`), lo implementó y perfiló, y **decidió NO aplicarlo esta ronda**: el costo medido era de hasta 3.2× sub-pasos a depth=1 m (caso típico) y hasta 11× a depth=0.3 m, penalizando casi todo el rango normal de profundidad para corregir un sesgo modesto (~7% medido en convergencia). Documentado con datos en la skill `calibracion-numerica-lagrangiana` §2, no descartado en silencio.
- `frontend-expert` (`src/styles.css`, `src/render/drawRiver.ts`, `src/components/Metrics.tsx`, `HjulstromChart.tsx`, `DepositChart.tsx`, `public/favicon.svg`): reescritura completa de la paleta/tipografía; reescritura de `drawRiver.ts` (agua con gradiente de 4 paradas, líneas de flujo animadas atadas a la velocidad real del motor vía `performance.now()`, overlay sutil de remanso, depósito con contorno suavizado + patrón de textura granulada cacheado en vez de relleno plano — resuelve D2); canvas sin marco de "card genérica", ocupa toda su columna; Resultados escalonado en 2 niveles (`<details>` colapsado, resuelve D6); gráficos SVG heredan la paleta oscura; botones diferenciados por categoría; identidad visual mínima en el header; corrigió el orden móvil (quitó `order:-1` de `.col-side`) para que el canvas se vea antes que los controles, sin necesidad de tocar `App.tsx`.
- `react-expert` (`src/App.tsx`, `src/components/Controls.tsx`): arregló el bug crítico #1 separando "live update" (cada tick, sin reset, solo actualiza el número mostrado) de "commit" (`onPointerUp`/`onMouseUp`/`onTouchEnd`/`onKeyUp`, dispara `engine.reset()` explícito decidido en React comparando contra el estado previo — el flag interno `resetOnChange` del motor dejó de usarse para esta decisión porque el motor ya no ve diferencia para cuando llega el commit). Aplicó los `DEFAULT_PARAMS` recomendados por `backend-expert` (`velocity=0.7, depth=1, poolFactor=2.75, feedRate=25`). Subió `capacity` de 8000 a 16000 (con los nuevos defaults el motor saturaba en ~32-33 s reales sin interacción; con 16000 el runway real medido es ~91 s, mejor de lo estimado inicialmente). Ajustó el `step` del slider de remanso de 0.5 a 0.25 (el nuevo default 2.75 no era alcanzable con el step anterior). Agregó 4 tests de regresión nuevos en `App.test.tsx`.

**Paso 4, re-auditoría con el mismo criterio nuevo:**
- `uiux-reviewer`: 9/10 hallazgos de diseño (D1-D10) **Resueltos** con evidencia (capturas Playwright en 3 resoluciones + secuencia de movimiento + arrastre de slider sin soltar). D6 resuelto con un matiz. Encontró 2 hallazgos nuevos menores: **N1** (el CSS de "modo proyector" ≥1600px no forzaba pintar el panel nivel 2 en Chromium, por `content-visibility:hidden` del pseudo-elemento interno `::details-content`) y **N2** (contraste `--danger` sobre `--surface` en 4.31:1, bajo el umbral AA 4.5:1, afectando una celda de tabla `td.neg`). Confirmó en vivo que el fix del reset-en-tick funciona: arrastrando el slider sin soltar, los conteos evolucionan coherentemente y solo resetean al soltar. Veredicto honesto final: ya no se ve como dashboard genérico ni como bug visual — se ve como un instrumento científico legible y con identidad propia (el objetivo real; el fotorrealismo de agua fue descartado explícitamente como esfuerzo desperdiciado para una app didáctica).
- `backend-expert`: reconfirmó el comportamiento tras los cambios — remanso visible desde temprano (τ cae de 2.36 a 0.227 Pa dentro del remanso, coincide con el modelo), 3/5 clases de grano depositan (limo y arena fina siguen sin depositar por diseño físico correcto, no por defecto: arena fina es el mínimo del diagrama de Hjulström del modelo, es la lección central del proyecto), runway de saturación con capacity=16000 confirmado en ~91 s reales (mejor que lo estimado), sin artefactos entre la ruta "live update" y "commit", invariante de masa exacto en todos los escenarios probados. Nada que corregir en el motor esta ronda.
- Ronda de corrección corta (N1/N2), `frontend-expert`: N1 resuelto apuntando la regla CSS al pseudo-elemento real `::details-content` (no a los hijos de autor); N2 resuelto con un token nuevo `--danger-text:#e87869` aplicado solo en `td.neg` (5.60:1 sobre `--surface`, sin tocar `--danger` global que ya cumplía en el KPI grande). Ambos verificados con Playwright.

### Alternativas descartadas
- **Fix numérico `maxStep` adaptativo para grava sub-resuelta:** implementado y perfilado, pero descartado esta ronda por costo desproporcionado (hasta 11× sub-pasos a profundidad mínima) frente a un sesgo modesto (~7%); queda documentado en la skill `calibracion-numerica-lagrangiana` para retomarlo si el rango de `depth` se amplía hacia abajo.
- **Fotorrealismo de agua (texturas/shaders complejos):** descartado explícitamente por `uiux-reviewer`/`frontend-expert` como esfuerzo desperdiciado para una app didáctica de expo; el objetivo era "instrumento científico legible", no realismo visual.
- **Mover `GuidedExperiments`/reorganizar el grid para resolver D3 en vez de reordenar CSS:** se resolvió con CSS (`order` en `.col-side`) para no invadir la propiedad de archivo de `react-expert` en `App.tsx`.

### Implicaciones
- Ningún archivo de `api/**` se tocó; el revamp fue enteramente frontend + motor de partículas (`src/sim/**`, `src/render/**`, `src/components/**`, `src/App.tsx`, `src/styles.css`).
- No se tocó nada de Vercel/producción/deploy (regla explícita de esta ronda) — sigue pendiente de decisión del usuario, sin relación con el revamp, ver [[roadmap]].
- No se hizo `git commit` ni `git push` — el usuario no lo ha pedido todavía; el árbol de trabajo en `D:\Proyectos\ExpoFisChino\app` tiene los cambios sin confirmar en git.
- **Siguiente paso real, no un checklist:** el usuario revisa la app corriendo en su navegador y confirma si "esta vez sí se ve bien y se comporta bien" — ese es el criterio de cierre real de esta ronda, distinto de "sin hallazgos abiertos" (que ya se cumplía antes y no fue suficiente). Ver [[../00-Proyecto/README]].
- Detalle completo de D1-D10/N1-N2 con estado Paso 1 vs Paso 4: [[informe-uiux-2026-09-19]] (sección "Ronda 3").

### Verificación
`npm test`: 43/43 verde (39 base + 4 tests de regresión nuevos de `App.test.tsx` para el fix del reset). `npm run build`: limpio, sin warnings. Sin errores de consola en ninguna de las auditorías Playwright (diagnóstico Paso 1 ni re-auditoría Paso 4).

## Feedback del usuario sobre la app terminada: no convence "ni en física ni en visual" → prompt de rediseño con los 6 subagentes
**Fecha:** 2026-09-20  **Impacto:** Alto  **Estado:** prompt de rediseño escrito y guardado ([[../03-Activos/prompt-revamp-2026-09-20]]); NO ejecutado todavía (el usuario lo correrá en Claude Code/VS Code)

### Contexto
Tras el cierre de sesión anterior (Fases 1-3 completas, `uiux-reviewer` sin hallazgos Críticos/Altos en la ronda U2), el usuario probó la app terminada y no quedó conforme. Palabras textuales: "la página no quedó bien ni en física ni en visual". Al pedirle precisión (pregunta directa de Claude), seleccionó las tres opciones a la vez:
1. El comportamiento de la simulación no le convence viéndola correr (sospecha de motor/lógica, no solo de dibujo).
2. La estética general no parece un río real / no convence.
3. No sabe describirlo más técnicamente — confía en que el equipo lo detecte auditando.
También pidió explícitamente un **revamp visual completo** (repensar de cero, no parchar).

### Por qué esto NO contradice la auditoría U2 anterior ("sin hallazgos Críticos/Altos")
Esa auditoría evaluó heurísticas de Nielsen + WCAG 2.1 AA (accesibilidad/usabilidad), no criterio de diseño/gusto estético ni plausibilidad física observada en movimiento durante minutos. Son varas distintas: la app puede ser accesible y usable y aun así no "verse bien" ni "sentirse físicamente correcta" al observarla correr. Se registra explícitamente para que la bóveda no suene contradictoria.

### Decisión
En vez de pedirle a Sam que describa técnicamente qué está mal (no puede), se diseñó un **prompt de rediseño** ([[../03-Activos/prompt-revamp-2026-09-20]]) que reutiliza los 6 subagentes ya existentes (no los recrea) con esta estructura:
1. **Paso 0-1 (diagnóstico crítico, con checkpoint):** `uiux-reviewer` audita esta vez con criterio de DISEÑO/gusto (no el checklist de accesibilidad ya superado), viendo la app correr en movimiento, no solo capturas estáticas. `backend-expert` audita COMPORTAMIENTO observable del motor en vivo (no solo fórmulas, ya validadas), usando el protocolo síntoma→perilla de su skill `calibracion-numerica-lagrangiana` para distinguir artefacto numérico de física real. Se presenta el diagnóstico consolidado al usuario antes de tocar código.
2. **Paso 2 (dirección visual, con checkpoint):** `frontend-expert` propone una dirección estética nueva y completa apoyándose en los skills `frontend-design`/`design-taste-frontend` ya instalados (que no se aprovecharon lo suficiente en la ronda anterior), y el usuario la aprueba antes de implementarla a gran escala.
3. **Paso 3-5:** implementación en paralelo por la misma tabla de propiedad de archivos de siempre, re-auditoría con el mismo criterio nuevo, y cierre con registro en Obsidian que dejará constancia de por qué el veredicto anterior no contradice este.
Se agregó una regla explícita (regla 8 del prompt) de **no tocar nada de Vercel/producción** en este trabajo — es un tema aparte y sigue pendiente de decisión del usuario (ver [[roadmap]]).

### Alternativas descartadas
- **Pedirle al usuario una lista de bugs específicos antes de escribir el prompt:** descartado — el propio usuario dijo no poder describirlo técnicamente; forzarlo hubiera bloqueado el trabajo sin necesidad. En su lugar, el prompt hace que los subagentes re-diagnostiquen con otro criterio.
- **Repartir el rediseño directamente sin fase de diagnóstico:** descartado — sin saber qué específicamente falló (visual, comportamiento, o ambos, y en qué parte), repartir tareas a ciegas hubiera arriesgado gastar trabajo de los 6 subagentes en lo que no era el problema real.
- **Dejar que `uiux-reviewer` reutilice el mismo checklist de siempre:** descartado explícitamente — ya se demostró insuficiente (dio "sin hallazgos" y el usuario no quedó conforme); el prompt le pide criterio de diseño esta vez, no solo accesibilidad.

### Implicaciones
- Ningún archivo de `src/**` ni `api/**` se tocó en esta sesión: este bloque de trabajo fue puramente de diagnóstico de la petición del usuario y redacción del prompt, guardado en la bóveda para que se ejecute en Claude Code (VS Code) sobre `D:\Proyectos\ExpoFisChino\app`.
- El "revamp" que quedaba como intención abierta sin alcance (ver entrada de cierre de sesión más abajo y [[roadmap]]) queda ahora **con alcance definido**: diagnóstico crítico + revamp visual completo + corrección de comportamiento físico observable, con dos checkpoints de aprobación del usuario antes de implementar a fondo.
- Sigue sin resolverse, y sin relación con esto: la decisión pendiente sobre la etiqueta "production" de Vercel y el secreto de bypass (ver [[roadmap]]).

### Verificación
No aplica (no se tocó código ni se corrieron tests en este bloque; es un artefacto de planificación, no de implementación).

## Tres skills de física propias para `backend-expert` (física teórica, modelo del río, calibración numérica)
**Fecha:** 2026-09-20  **Impacto:** Alto  **Estado:** archivos escritos en `.agents/skills/`; faltan las junctions en `.claude/skills/` y el reemplazo de `backend-expert.md` (los hace el usuario a mano)

### Contexto
Decisión pedida directamente por el usuario: "creemos dos skills que hagan al agente de backend experto en física y logre ajustar bien las simulaciones". Al plantear el reparto, el usuario pidió **tres** en vez de dos: física teórica, física aplicada al río, y calibración numérica. Cierra el hueco detectado en la instalación de skills de skills.sh, donde se anotó que **no había skill de física aplicable** (solo opciones en Python). Se escriben a mano, específicas del proyecto, en vez de instalar algo externo.

### Skills creadas (en `app/.agents/skills/`, patrón igual al de skills.sh)
1. **`fisica-transporte-sedimentos`** (13.5 KB) — marco teórico y fuentes citables: ley de la pared y `u*`, `τ = ρu*²`, `D*` y `w_s` de Soulsby (1997), `θ_cr` de Soulsby & Whitehouse (1997), número de Rouse y modos de transporte, curva de Hjulström, sedimento cohesivo (Krone/Partheniades, Whitehouse et al. 2000, Zhu et al. 2021). Incluye la **regla de las tres categorías** (constante física / fórmula de literatura con cita / valor pedagógico documentado) y un protocolo de verificación física de 6 pasos.
2. **`modelo-rio-efc`** (14.6 KB) — el modelo concreto, verificado contra `src/sim/`: geometría (100 m, NX=400, remanso 50-70 m con `smootherstep`, `ENTRY_BUFFER`), campo hidráulico por continuidad, **tabla de las 5 clases de grano con D\*, w_s, θ_cr, τ_ce, τ_cd y velocidades críticas calculadas**, tabla de números de Rouse por velocidad, reglas de deposición/resuspensión, contrato `SimStats` vs `WindowStats`, lista explícita de qué es literatura y qué es pedagógico, 5 desviaciones conocidas declarables, rangos de parámetros con sentido físico, y las preguntas frecuentes de la expo con su respuesta física.
3. **`calibracion-numerica-lagrangiana`** (15.7 KB) — método y ajuste: esquema de Visser, condición de buen mezclado, criterios de `dt`, condiciones de borde, determinismo/RNG, invariantes, pruebas de convergencia y de perfil analítico, ruido estadístico y estado estacionario, **tabla síntoma→perilla**, benchmarks de rendimiento (B5) y checklist de cierre.

### Hallazgos técnicos nuevos (subproducto de escribir las skills)
- **El esquema de integración vertical de `engine.step()` es exactamente el de Visser (1997), MEPS 158:275-281, Eq. 6** (`deps` = ∂K/∂z, `zm` = posición intermedia, `epsM` = K(z̃)). Antes estaba implementado sin identificar la fuente. Queda citado. Implica que el término `deps` **no es opcional**: sin él la caminata aleatoria acumula partículas contra el lecho artificialmente y "deposita" de más por razón numérica.
- **El criterio de `dt` que manda no es el de Visser sino resolver la capa de lecho `z_b = 0.02·h`.** El de Visser (`dt ≪ h/(2κu*)`) da ~29 s a h=1 m, U=0.6 — más de dos órdenes de magnitud de margen sobre `maxStep = 0.05 s`. En cambio `w_s(grava)·dt = 12.9 mm`: **para `h ≲ 0.65 m` la grava recorre en un paso más que el espesor de la capa de lecho** y su deposición queda sub-resuelta. Acción si alguna vez se permite `depth < 0.65 m` o se sube `w_s` de la clase gruesa: bajar `maxStep` (a 0.02 s el paso de grava cae a 5.2 mm) o hacerlo adaptativo, `maxStep = min(0.05, 0.2·z_b/w_s_max)`. **No es un bug hoy** porque el rango de profundidad usado no baja de ahí.
- **La curva de Hjulström del modelo tiene su mínimo en d ≈ 0.067 mm con U ≈ 0.151 m/s** (barriendo `makeCurveClass` a h=1 m), contra 0.1–0.5 mm y ~0.2 m/s de la curva clásica. Desplazada hacia grano más fino y velocidad algo menor. Perillas para corregirlo si alguna vez se quiere: `Z0` y la interpolación de `cohesionLevel()`. **Decisión: no corregir** — la forma cualitativa, que es lo que se enseña, ya es correcta, y la curva clásica tampoco es universal (depende de `h` y `z₀`).
- Arcilla y limo son **carga de lavado (P < 0.8) en todo el rango de la app**; la grava es **carga de fondo (P > 2.5) en todo el rango**. La transición didácticamente interesante está en arena fina y arena media entre 0.2 y 1.2 m/s — ese rango debe quedar bien cubierto por los experimentos guiados.
- El **mínimo de velocidad crítica de erosión del modelo está en arena fina (0.166 m/s)**, no en arcilla ni grava. Es el resultado contraintuitivo que vale la pena mostrar en la expo.

### Alternativas / decisiones de descarte
- **Dos skills vs tres:** se propuso "física + calibración"; el usuario pidió separar además física teórica de física aplicada al río. Ventaja del reparto final: `modelo-rio-efc` es el único que hay que actualizar cuando cambia `src/sim/`, y los otros dos quedan estables.
- **Skills de cuenta vs skills del repo:** el usuario eligió **repo**, igual que las de skills.sh, para que viajen versionadas y las use el subagente de Claude Code. No se crean versiones de cuenta (evita duplicar mantenimiento).
- **No se tocó `skills-lock.json`:** ese lockfile lo gestiona `npx skills` para skills descargados del marketplace. Estas tres son propias, así que **sí deben versionarse en git** — hay que sacarlas de la regla `.gitignore` de `.agents/skills` (ver Pendiente).

### Implicaciones
- Archivos escritos: `.agents/skills/fisica-transporte-sedimentos/SKILL.md`, `.agents/skills/modelo-rio-efc/SKILL.md`, `.agents/skills/calibracion-numerica-lagrangiana/SKILL.md`, `.agents/backend-expert.md` (versión nueva, en tránsito).
- `backend-expert.md` nuevo: agrega `Skill` al frontmatter `tools:`, instrucción de cuándo cargar cada una de las tres, la **regla de precedencia de diagnóstico** (masa → `dt` → ruido estadístico → casos analíticos → y solo entonces parámetro físico) y la obligación de clasificar toda constante nueva.
- **Limitación de la herramienta:** escribir dentro de `.claude/` está bloqueado para las herramientas remotas de Cowork. Por eso los archivos se dejaron en `.agents/` y las junctions + el `Move-Item` de `backend-expert.md` los ejecuta el usuario a mano en PowerShell.
- Sin cambios en código de la app (`src/**`, `api/**`).

### Pendiente
- Usuario: crear las 3 junctions en `.claude/skills/` y mover `.agents/backend-expert.md` → `.claude/agents/backend-expert.md`.
- Ajustar `.gitignore`: las tres skills propias deben versionarse (la regla actual ignora `.agents/skills` completo, pensada para las descargadas). Opción simple: excepciones `!.agents/skills/fisica-transporte-sedimentos/`, `!.agents/skills/modelo-rio-efc/`, `!.agents/skills/calibracion-numerica-lagrangiana/`.
- Considerar añadir a `sim.test.ts` el **test de buen mezclado** (w_s=0, sin deposición, histograma vertical plano dentro del ruido de Poisson): es barato y detecta la regresión más peligrosa del motor (perder el término `deps`).

### Verificación
Todos los valores de las tablas de `modelo-rio-efc` se recalcularon con un script Python que replica `physics.ts` (no se copiaron del código). Esquema de Visser y criterio de `dt` contrastados contra el PDF original (DTU) y la documentación de PyLag. Curva de Hjulström contrastada contra Wikipedia/literatura. Sin cambios en código de la app, así que `npm test` 39/39 y `npm run build` siguen válidos sin volver a correr.


## Tooling: instalación de skills externos (skills.sh) para potenciar subagentes
**Fecha:** 2026-09-20  **Impacto:** Medio  **Estado:** implementado — cambio de infraestructura de Claude Code, sin tocar código de la app

### Contexto
Decisión tomada directamente por el orquestador a pedido del usuario, en medio de la Fase 4 (no es un HANDOFF de un subagente de trabajo). El usuario pidió instalar "agent skills" externos desde el marketplace https://skills.sh para mejorar las capacidades de subagentes específicos del proyecto (`.claude/agents/**`). Se usó la CLI `npx skills` (skills.sh) para instalarlos como skills de proyecto en `D:\Proyectos\ExpoFisChino\app\.claude\skills\` (symlinks a `.agents\skills\`, gestionados por `skills-lock.json`, que sí se versiona por ser el lockfile reproducible; el contenido descargado en `.agents/skills` se agregó a `.gitignore`, igual que `node_modules`).

### Skills instalados y asignación
1. **`frontend-design`** (repo oficial `anthropics/skills`) → `frontend-expert`. Guía de dirección estética, tipografía, color, motion, composición espacial; evita lo genérico de IA.
2. **`design-taste-frontend`** (repo `leonxlnx/taste-skill`, v2) → `frontend-expert`. Inferencia de brief de diseño, anti-patrones de IA genérica, checklist de producción.
3. **`design-taste-frontend-v1`** (mismo repo, v1 preservado por compatibilidad) → `frontend-expert`.
4. **`find-skills`** (repo oficial `vercel-labs/skills`) → disponible a nivel de sesión/orquestador; meta-skill para buscar e instalar otros skills del marketplace.
5. **`deploy-to-vercel`** (repo oficial `vercel-labs/agent-skills`, 132.2K installs) → `vercel-deploy-expert`. Automatiza el flujo de vinculación/deploy a Vercel; por defecto SIEMPRE despliega preview, nunca producción salvo pedido explícito — consistente con la regla ya existente del proyecto (V4 requiere autorización explícita del usuario).
6. **`wcag-accessibility-audit`** (repo `mastepanoski/claude-skills`, 1.4K installs) → `uiux-reviewer`. Apoyo metodológico para auditorías WCAG 2.1/2.2 AA (4 principios POUR).

A cada uno de los 3 subagentes (`frontend-expert`, `vercel-deploy-expert`, `uiux-reviewer`) se le agregó la herramienta `Skill` en su frontmatter (`tools:`) más una instrucción explícita en el cuerpo del agente sobre qué skill usar y cuándo.

### Alternativas / decisiones de descarte
- **Colisión de nombres `frontend-design`:** se intentó también instalar `frontend-design` del repo `vercel-labs/agent-eval` (no oficial, 263 stars), pero al tener el MISMO nombre de skill que el de `anthropics/skills` (904.9K installs, 177.2K stars, oficial), el segundo instalador sobrescribió al primero. Se le preguntó al usuario y eligió quedarse con el oficial de `anthropics/skills`; se reinstaló ese encima para corregirlo.
- **Skill de "vitest setup" (`jezweb/claude-skills@vitest`) para `react-expert`/`backend-expert` — descartado:** es un skill de scaffolding/generación de config pensado para proyectos nuevos, y el proyecto YA tiene Vitest funcionando con 39 tests en verde; instalarlo hubiera arriesgado que un agente lo usara para regenerar `vitest.config.ts` y romper el setup existente. Regla general adoptada: no instalar skills que auto-generen configuración sobre un setup que ya funciona.
- **Skill de física/simulación numérica para `backend-expert` — no encontrado aplicable:** solo había opciones en Python (ej. FluidSim), no aplicable al stack TS puro del proyecto. Tampoco se encontró nada específico útil para `obsidian-registrar`. Se dejaron sin cambios en vez de forzar una instalación de bajo valor.
- **Refuerzo de higiene en `uiux-reviewer.md`:** se agregó instrucción explícita de NO escribir ningún archivo fuera de su carpeta de trabajo temporal (ni capturas ni scripts deben quedar en el repo ni en `D:\Proyectos\ExpoFisChino\`), a raíz del incidente previo de capturas PNG dejadas en `D:\Proyectos\ExpoFisChino\audit_shots\` (ya limpiado; ver [[../02-Contexto/preferencias]]).

### Implicaciones
- Archivos tocados: `.claude/agents/frontend-expert.md`, `.claude/agents/vercel-deploy-expert.md`, `.claude/agents/uiux-reviewer.md` (campo `tools:` + instrucción de uso del skill), `.gitignore` (+ `.agents/skills`), `skills-lock.json` (nuevo, versionado), `.claude/skills/**` (symlinks generados, no versionados directamente vía lockfile).
- Sin cambios en código de la app (`src/**`, `api/**`); Fase 4 sigue pendiente (falta autorización del usuario para deploy de producción).

### Verificación
`npm test`: 39/39 verde (sin cambios, no se tocó código de la app). `npm run build`: OK.

## Fase 3 completa: experimento guiado (R3), re-auditoría U2, correcciones N-10/N-11/N-12, y decisión de no-Worker/no-api (B5/B6)
**Fecha:** 2026-09-20  **Impacto:** Alto  **Estado:** implementado en `src/components/GuidedExperiments.tsx`, `src/App.tsx`, `src/styles.css`; sin cambios en `src/sim/**` ni `api/**`

### Contexto
Cierra la Fase 3 del prompt inicial ([[../03-Activos/prompt-inicial-claude-code]]): `react-expert` implementó el flujo didáctico guiado (R3, guion de 4 experimentos de [[informe-uiux-2026-09-19]]) resolviendo UX-08; `uiux-reviewer` hizo la re-auditoría completa (U2) contra los 9 hallazgos de la Fase 1; una ronda de correcciones cerró los 3 hallazgos nuevos que encontró U2 (N-10, N-11, N-12); y `backend-expert` cerró B5 (perfilado de rendimiento) y B6 (revisión de necesidad de `api/**`).

### Decisiones
1. **`GuidedExperiments.tsx` (react-expert, R3):** máquina de estados (selector → "Iniciar" → pregunta guía → "Ver conclusión"/temporizador → siguiente paso o salir) con los 4 experimentos y conclusiones literales del guion de [[informe-uiux-2026-09-19]]. Cada paso fija un patch completo de `SimParams` (U/depth/poolFactor/feedRate/mix) y dispara `reset()` explícito además del automático de `resetOnChange` (redundante pero inofensivo, `engine.reset()` es idempotente). La conclusión se auto-revela con temporizador (20-30 s) además del botón manual. El modo libre queda intacto: el experimento solo precarga sliders, el usuario los puede seguir ajustando (necesario para los experimentos 3 y 4). Integrado en `App.tsx` vía `applyExperimentParams` + `ensureRunning`.
2. **Re-auditoría U2 (uiux-reviewer):** probada en vivo con build+preview+Playwright a 1920×1080/1440×900/1024×768/390×844. Veredicto: UX-01 a UX-06 y UX-08 **Resueltos** con evidencia propia (capturas, medición de contraste WCAG AA ≥4.5:1 en todos los colores clave, petición de red del favicon, flujo end-to-end de los 4 experimentos probado). UX-07 y UX-09 quedan **Parciales (Baja, no bloqueantes)**: botones/thumb de slider en 40px/26px (no llegan a 44px aunque la pista sí), y el azul `--accent` sigue compartido en algunos usos residuales. **No quedan hallazgos Críticos ni Altos abiertos** — se cumple el criterio de "hecho" del proyecto. Tabla de estado completa actualizada en [[informe-uiux-2026-09-19]].
3. **N-10 (foco perdido tras transiciones, Media) — resuelto (react-expert):** un solo ref reutilizado (`focusTargetRef`) + contador `focusSignal`; un `useEffect` mueve el foco al elemento correcto tras cada transición iniciada por el usuario (iniciar/siguiente paso → título del nuevo paso; ver conclusión → párrafo de conclusión; salir/terminar → botón "Iniciar experimento"). Se prefirió un solo ref reutilizado en vez de 3 refs separados porque React desadjunta todos los refs viejos antes de adjuntar los nuevos en el mismo commit, así que no hay ventana de foco perdido a `null`. El auto-reveal por temporizador **no** mueve el foco (no es una acción del usuario), se apoya solo en `aria-live`.
4. **N-11 (falta `aria-live` en la pregunta de cada paso, Media) — resuelto (react-expert):** `aria-live="polite"` en el contenedor `.guided-step`, como refuerzo del `role="status"` que ya tenía la conclusión.
5. **N-12 (panel guiado empuja el canvas fuera del viewport en tablet 1024×768, Baja/Media) — resuelto (frontend-expert):** párrafo explicativo largo envuelto en `<details><summary>` nativo colapsado por defecto (sin estado React nuevo, sin tocar lógica/props/callbacks de `react-expert`), más reglas CSS `.panel.guided`/`.guided-intro`. Se descartó mover el panel a una columna lateral para no tocar el grid `.layout` de `App.tsx` (archivo de react-expert). Margen del canvas en 1024×768 pasó de 47px a 92px sobre 768; leyenda completa visible sin scroll.
6. **B5 (backend-expert) — NO se implementa Web Worker:** benchmark de `engine.advance()` con capacity=8000 (avg 1.24ms/frame, p95 1.95ms), capacity=20000 (avg 3.00ms/frame, p95 3.30ms) y capacity=50000 de referencia (avg 7.51ms/frame, p95 8.28ms). Todos muy por debajo del umbral de 8ms/frame del proyecto incluso a 20 000 partículas (2.5x el objetivo de 8 000). Migrar a Worker agregaría complejidad (serialización, protocolo de mensajes, romper la lectura directa de `engine` en `drawRiver`) sin beneficio medible. Reevaluar solo si el proyecto crece a >30-40k partículas objetivo, con el mismo patrón de benchmark (script temporal, borrado tras usarlo, no versionado).
7. **B6 (backend-expert) — NO se crea `api/**`:** revisó `urlParams.ts`, confirmó que el escenario compartible ya viaja 100% por query string sin servidor. No hay autenticación, persistencia server-side, ni cómputo pesado fuera del cliente que justifique funciones serverless — sería complejidad no solicitada, contraria al principio de "app estática" del proyecto (ver decisión de stack más abajo).

### Alternativas
- Reset solo automático (sin el explícito en `GuidedExperiments`): descartado por seguridad ante posibles cambios futuros en el orden de efectos; el costo es nulo porque `reset()` es idempotente.
- 3 refs de foco separados en `GuidedExperiments`: descartado, un solo ref reutilizado evita cualquier ventana de foco en `null` gracias al orden de adjunte/desadjunte de React en el mismo commit.
- Mover `GuidedExperiments` a columna lateral para resolver N-12: descartado para no invadir el grid `.layout` de `App.tsx` (propiedad de react-expert); se prefirió `<details>` nativo, accesible sin JS adicional.
- Web Worker para el motor de partículas: descartado por falta de necesidad medible (ver B5 arriba); queda en el roadmap como "Después/Ideas" condicionado a un umbral de partículas.
- Funciones serverless (`api/**`) para compartir escenarios: descartado, resuelto 100% client-side desde Fase 2 (R2, `urlParams.ts`).

### Implicaciones
- Con esto se cumple casi toda la "Definición de hecho" del prompt original: sin hallazgos Críticos/Altos abiertos, flujo didáctico completo, rendimiento con amplio margen, y confirmación explícita de que no hace falta backend/servidor.
- Quedan abiertos, no bloqueantes: UX-07/UX-09 parciales (tamaño táctil exacto y uso residual de `--accent`), y la confirmación de Node 22.x vs 24.x pendiente desde Fase 1.
- Siguiente paso: Fase 4 (`vercel-deploy-expert`, V2-V3: vincular Vercel y preview con prueba de humo). V4 (producción) requiere autorización explícita del usuario, que aún no se ha dado. Ver [[roadmap]].

### Verificación
`npm test`: 39/39 passed (37 tras R3 de react-expert, +2 tras la corrección N-10/N-11). `npm run build`: OK. Verificado repetidamente por el orquestador durante toda la fase, siempre en verde; última verificación combinada: 39/39 tests, build OK. Capturas Playwright de la re-auditoría U2 y de la corrección N-12 (1024×768/390×844/1920×1080) tomadas fuera del repo y borradas después por el orquestador (solo imágenes, sin secretos).

## frontend-expert Fase 2: integración de useSimulationLoop/drawRiver, modo proyector, correcciones UX-01/02/03/04/07/09
**Fecha:** 2026-09-20  **Impacto:** Alto  **Estado:** implementado en `src/render/**`, `src/components/**`, `src/styles.css`, `index.html`, `public/favicon.svg`

### Contexto
Cierra, dentro de la misma Fase 2, la integración pendiente entre el `useSimulationLoop`/contrato `DrawRiver`/`SimulationView` que dejó listo `react-expert` (ver entrada anterior) y el dibujo del río, más las victorias rápidas de UX-01/02/03/07/09 y el refuerzo de UX-06/04 de [[informe-uiux-2026-09-19]].

### Decisiones
1. **`draw()` extraído a `src/render/drawRiver.ts`** implementando `DrawRiver` de forma pura (sin mutar `engine` ni llamar `setState`). `RiverCanvas.tsx` reescrito sobre `useSimulationLoop` (con `ResizeObserver` propio y `ctx` cacheado en un ref; `onFrame` llama a `drawRiver`). Se aprovechó para mejorar el dibujo: franja visual del `ENTRY_BUFFER` (hachurado + línea punteada + etiqueta con halo blanco), capas de depósito con contorno por tamaño de grano, indicador de salida con 3 flechas fijas (en vez de 1 escalada con la velocidad) para que nunca se recorte fuera del canvas. El remanso se sigue viendo suave porque se muestrea `engine.hAt` (el *smootherstep* ya vive en el motor, sin geometría propia del frontend).
2. **Modo proyector:** `@media (min-width:1600px)` con tipografías/paddings mayores, más `@media (prefers-contrast: more)` y botones apilados en `<520px`; se conserva el layout base de 960/520px.
3. **UX-01:** etiqueta "TRANSPORTE" de `HjulstromChart.tsx` rotada -90° y con **posición fija** en el SVG (no relativa al valor de U), para que no se pegue a "U=0,60 m/s" ni a los puntos de arcilla/limo sin importar dónde esté el slider; márgenes de ambos gráficos SVG ampliados.
4. **UX-03:** `public/favicon.svg` nuevo (gota + partículas); `index.html` cambia `<link rel="icon">` de `.ico` a `.svg` (cambio trivial de extensión). Refuerzo de `prefers-reduced-motion` con `transition-duration:0.001ms!important` (no había `@keyframes`/transiciones previas que pudieran quedar corriendo).
5. **UX-02/UX-04/UX-07/UX-09:** ticks SVG 11→14px, eje→15px, notas/muted/kpi/tabla ≥0,85-0,92rem (resuelve UX-02 en modo proyector); divisor punteado + acento `--accent-2` morado (`variant="playback"`) en el slider de reproducción para separarlo visualmente de los parámetros físicos (resuelve UX-04 y UX-09 solo para ese control, no para todos los usos de `--accent`); `.btn.small` 34→40px de alto mínimo, thumbs de slider a 26px, pista de slider a 44px (resuelve UX-07, cumple objetivo táctil ≥44px); botón "Copiar enlace" con estilo `.btn.link` propio.

### Alternativas
- Indicador de salida con 1 flecha escalada según la velocidad: descartada, se recortaba fuera del canvas a velocidades altas; se prefirieron 3 flechas fijas.
- Etiqueta "TRANSPORTE" con posición relativa al valor de U: descartada por falta de robustez ante cualquier valor del slider; se fijó su posición en el SVG.

### Implicaciones
- Con esto queda cerrada la integración loop/dibujo que `react-expert` dejó explícitamente pendiente en la entrada anterior ("Pendiente para frontend-expert").
- Pendiente opcional: el aviso "Nuevo experimento" (de `react-expert`) sigue con la clase `.note.warn` (vive en `App.tsx`, fuera de la propiedad de `frontend-expert`); si se le pone una clase nueva (p.ej. `.note.info`), el CSS ya está listo para diferenciarlo.
- Ver estado detallado de cada hallazgo en la tabla actualizada de [[informe-uiux-2026-09-19]].

### Verificación
`npm test`: 32/32 verde (verificado también por el orquestador tras integrar con el trabajo de `react-expert`). `npm run build`: verde (también verificado por el orquestador). Capturas Playwright/Chromium en 1920×1080, 1280×800 y 390×844 revisadas visualmente por el propio agente. Chequeo de re-render (conteo manual con `console.log` temporal, ya retirado): `RiverCanvas` renderiza a ~4-6 Hz (igual al `setInterval` de métricas), no a 60 fps — confirma que no hay re-render de React por frame de `rAF` tras el refactor.

## react-expert Fase 2 (R1, R2, R4, R5, R6): useSimulationLoop, estado en la URL, resetOnChange, tests, getWindowStats en la UI
**Fecha:** 2026-09-19  **Impacto:** Alto  **Estado:** implementado en `App.tsx`/`src/hooks/**`/`src/state/**`/componentes; **pendiente de integración por `frontend-expert`** en `RiverCanvas.tsx`

### Contexto
Segunda pasada, consumiendo `getWindowStats`/`resetOnChange`/`ENTRY_BUFFER` que dejó `backend-expert` en Fase 1 (ver entrada anterior) y los hallazgos UX-04/05/06 de `uiux-reviewer` ronda 1 ([[informe-uiux-2026-09-19]]).

### Decisiones
1. **`useSimulationLoop(engine, {running, timeScale, ...})` extraído a `src/hooks/useSimulationLoop.ts`**, con `dt` real acotado (`maxRealDt`, default 0.05 s, igual al clamp que ya tenía el loop original) antes de escalar por `timeScale`, cleanup con `cancelAnimationFrame` y diseño explícitamente seguro con StrictMode (el efecto solo depende de `engine`; `running`/`timeScale`/`onFrame` se leen de refs para no reiniciar el reloj `last` en cada cambio de UI). **No se integró todavía en `RiverCanvas.tsx`** — ese archivo es frontera con `frontend-expert` y hoy sigue con su loop inline funcionando igual que antes (nada se rompió). El contrato de dibujo `DrawRiver = (ctx, engine, view) => void` y `SimulationView {width, height, dpr}` quedaron definidos en el mismo archivo del hook, para que `frontend-expert` los importe al mover el `draw()` actual a `src/render/drawRiver.ts`.
2. **UX-06 (prefers-reduced-motion):** en vez de que el hook fuerce la pausa (le quitaría al usuario la posibilidad de reanudar), se expone `prefersReducedMotion()` desde `useSimulationLoop.ts` y `App.tsx` la usa para el valor *inicial* de `running` (`useState(() => !prefersReducedMotion())`). Con el motion reducido, la simulación arranca en pausa pero el usuario puede darle play.
3. **R2 — estado en la URL (`src/state/urlParams.ts`):** query params cortos en español: `U`, `h`, `remanso`, `aporte`, `mezcla`, `t` (timeScale). Se usa **`history.replaceState`** (no `pushState`) con debounce de 500 ms, así ningún arrastre de slider satura el historial del navegador (de hecho no agrega ninguna entrada). `copyShareLink(params, timeScale)` arma la URL completa y usa `navigator.clipboard` con fallback a un `<textarea>` + `execCommand('copy')`. El botón visual "Copiar enlace" se agregó ya en `Controls.tsx` (reutilizando la clase `.btn` existente, sin CSS nuevo) porque el texto/lógica de qué hace vive del lado de react-expert.
4. **R4 — política de `resetOnChange`:** se decidió activarlo **siempre** (`engine.setParams({...params, resetOnChange: true})` en cada cambio), para que cambiar un parámetro clave a mitad de una corrida nunca mezcle conteos de dos regímenes distintos en el mismo % acumulado. `App.tsx` detecta el mismo cambio "clave" que ya detecta el motor (duplicando esa comparación pura, sin acceso a estado interno del motor) solo para mostrar un aviso "Nuevo experimento" 4 s (reutiliza la clase `.note.warn` ya existente).
5. **R6 / UX-05 — `getWindowStats` en la UI:** se agregó a `Metrics.tsx` un bloque "Régimen actual" con ventana fija de **20 s de simulación** (`WINDOW_SECONDS` en `App.tsx`) mostrando salida/aporte (part/s) y "capacidad de transporte relativa" (salida/aporte, ~100% = estacionario), más las mismas dos métricas por clase de grano en la tabla existente. Con el `timeScale` por defecto (15×) sin cambiar, una ventana de 20 s simulados se cubre en ~1,3 s reales, así que esta métrica reacciona mucho antes que el % acumulado histórico — se decidió resolver UX-05 así en vez de subir el `timeScale` por defecto (que hubiera sido un cambio de "sensación" de la simulación, más riesgoso). También se muestra un aviso si `actualWindowSeconds < 90% de requestedWindowSeconds` (ventana aún no cubierta del todo).
6. **UX-04 (dos sliders "Velocidad"):** el de reproducción se renombró a "Avance del tiempo (reproducción)" con un hint aclarando que no es la velocidad del agua; es un cambio de texto/copy dentro de `Controls.tsx`, autorizado explícitamente para esta ronda aunque ese archivo no es propiedad exclusiva de react-expert.
7. **Tests de componentes (R5):** se agregaron `@testing-library/react`, `@testing-library/jest-dom` y `@testing-library/user-event` como devDependencies, entorno Vitest cambiado de `node` a `jsdom` (único entorno para todo el proyecto, incluye `sim.test.ts` que sigue funcionando igual) y un `src/test/setup.ts` que registra `afterEach(cleanup)` manualmente porque el proyecto no usa `test.globals` de Vitest (los tests importan `describe/it/expect` explícitos). **Sin este cleanup manual los tests de componentes fallaban por contaminación cruzada entre `it()`** (el DOM de un render quedaba montado para el siguiente test) — documentado como advertencia para quien agregue más tests de componentes.

### Alternativas
- Integrar `useSimulationLoop` de una vez en `RiverCanvas.tsx` yo mismo: descartada, la frontera de ese archivo (loop vs. dibujo) es explícitamente compartida con `frontend-expert`; se prefirió dejar el hook listo, probado por tipos, y pedir la integración en el HANDOFF en vez de tocar el archivo de dibujo.
- Subir el `timeScale` por defecto para resolver UX-05: descartada por ahora a favor de `getWindowStats` (menos riesgo de cambiar la "sensación" ya calibrada de la simulación).
- `history.pushState` en vez de `replaceState` para el estado en la URL: descartada — un enlace compartible no necesita ensuciar el botón "atrás" del navegador por cada ajuste de slider.

### Implicaciones
- **Pendiente para `frontend-expert`:** mover el `draw()` de `RiverCanvas.tsx` a `src/render/drawRiver.ts` implementando `DrawRiver` (importar el tipo desde `src/hooks/useSimulationLoop.ts`), y reescribir `RiverCanvas.tsx` para usar `useSimulationLoop(engine, {running, timeScale, onFrame})` en vez de su loop inline. Verificar ahí con el Profiler que no hay re-renders de React por frame (la regla de oro se cumplió del lado de react-expert: nada de posiciones de partículas pasó por `useState`).
- Fase 3 (R3, explícitamente no tocada esta ronda) sigue pendiente.

### Verificación
`npm test`: 32/32 verde (16 previas de `sim.test.ts` + 9 de `Controls.test.tsx` + 7 de `Metrics.test.tsx`). `npm run build` (`tsc --noEmit && vite build`): verde.

## vercel-deploy-expert + uiux-reviewer Fase 1: config inicial de deploy (Node 22.x pineado) y auditoría UI/UX ronda 1
**Fecha:** 2026-09-19  **Impacto:** Alto  **Estado:** implementado (deploy) / hallazgos abiertos (UI/UX)

### Contexto
Cierre de la Fase 1 del prompt inicial (ver [[../03-Activos/prompt-inicial-claude-code]]): `vercel-deploy-expert` preparó el proyecto para deploy y `uiux-reviewer` hizo la primera auditoría de UI/UX sobre el build. Verificación combinada del orquestador tras las 3 tareas de Fase 1: `npm test` 16/16 verde, `npm run build` verde.

### Decisiones
1. **Repo git — corrección de dato:** el repo YA EXISTÍA (`D:\Proyectos\ExpoFisChino` toplevel, remoto `origin` → https://github.com/Scastanedad/ExpoFisChino.git, rama `main`, al día con el remoto). La bóveda decía "Repo: pendiente" en `README.md` y `urls.md` por error; no había que crearlo. Corregido en [[../00-Proyecto/README]] y [[../01-Referencias/urls]].
2. **Pin de Node 22.x pese a entorno local 24.x:** se creó `.nvmrc` (22) y `engines.node="22.x"` en `package.json`, aunque el entorno local real reporta `node -v` = v24.19.0 / `npm -v` = 11.17.0 (la bóveda decía antes "Node 22 + npm 10", tampoco exacto). Se prioriza compatibilidad conocida con Vercel sobre la versión detectada localmente.
3. **Config de deploy mínima:** `vercel.json` con cache `Cache-Control: public, max-age=31536000, immutable` para `/assets/(.*)`; `<head>` de `index.html` con título, meta description en español, Open Graph básico (`og:title`/`og:description`/`og:type`) y `<link rel="icon" href="/favicon.ico">` (el archivo del ícono todavía no existe); `.gitignore` con `.env`, `.env.*`, `!.env.example`. No se creó `.github/**` (sin necesidad de CI detectada aún). No se vinculó proyecto en Vercel — V2–V4 requieren autorización/login explícito del usuario y no se ejecutaron.

### Alternativas
- Usar la versión de Node detectada localmente (24.x) en vez de pinear 22.x — descartada por ahora, pendiente de confirmar si Vercel soporta 24.x oficialmente.

### Implicaciones
- **Pendiente de confirmación del usuario:** si se mantiene el pin a Node 22.x o se sube a 24.x antes de vincular el proyecto en Vercel. Ver [[../00-Proyecto/roadmap]].
- `frontend-expert` debe crear `public/favicon.ico` (o `.svg`) y opcionalmente una imagen `og:image`.
- Auditoría UI/UX completa (hallazgos, victorias rápidas y guion de 4 experimentos didácticos) en nota nueva: [[informe-uiux-2026-09-19]].

### Verificación
`vercel-deploy-expert`: `npm test` 10/10 (en su momento) y `npm run build` OK. `uiux-reviewer`: sin errores de consola JS en 1440×900 / 1024×768 / 390×844; favicon 404 confirmado por `curl`. Verificación combinada final del orquestador tras Fase 1: `npm test` 16/16 verde, `npm run build` verde.

## backend-expert Fase 1 (B1–B4): validación de física, ventana de estado estacionario, buffer de entrada
**Fecha:** 2026-09-19  **Impacto:** Alto  **Estado:** implementado en `src/sim/**`

### Contexto
Primera pasada del subagente `backend-expert` sobre el MVP v0.1 ya construido, siguiendo el backlog B1–B4 del prompt inicial.

### Decisiones
1. **Umbrales cohesivos (arcilla τce=1,0 Pa / limo τce=0,3 Pa):** se mantienen sin cambio, mal documentados antes de esta fase. Se documentaron como "valor pedagógico dentro de rango de literatura" citando Mehta & Partheniades (1982), Whitehouse et al. (2000) "Dynamics of Estuarine Muds" y una revisión reciente (Zhu et al. 2021, Frontiers in Marine Science) que reporta τce cohesivo típico en 0,1–5 Pa. No existe fórmula cerrada única para cohesión (a diferencia de Shields), así que no se "calibró" a un dato real, solo se verificó que caen en rango plausible. Detalle y cita completa en el comentario de cabecera de `physics.ts`.
2. **Test del perfil de Rouse (B2):** en vez de comparar magnitudes absolutas (ruidoso por el random walk), se hace regresión log-log de la concentración simulada (bins verticales de partículas suspendidas, lejos de inyección y salida) contra la forma analítica de Rouse, exigiendo pendiente ≈1 y R²>0,85. Caso elegido: arena fina, U=0,4 m/s, h=1 m (P≈1,05, suspensión parcial, τ≫τce así casi no hay depósito que contamine la muestra). Resultado obtenido en calibración: pendiente≈0,92–0,95, R²≈0,99.
3. **`getWindowStats(windowSeconds)` (B3):** nueva API que reemplaza el "% acumulado" por tasas de régimen en una ventana móvil (outflowRate, inflowRate, netDepositionRate, transportCapacity = salida/aporte, por clase y agregado). Implementado con un historial interno de snapshots de los contadores acumulados (muestreado cada 0,2 s de tiempo simulado, hasta 3000 muestras ≈10 min). Expone `actualWindowSeconds` porque la ventana pedida puede no estar disponible aún (simulación reciente) — la UI debe mostrar/considerar esto, no asumir que siempre se cumple. Contrato completo (tipos `WindowStats`) en `engine.ts`, documentado también en el informe HANDOFF de la fase para que `react-expert` lo consuma.
4. **Zona de entrada `ENTRY_BUFFER=10` m (B4):** en vez de desplazar la coordenada de inyección a negativo (que hubiera cambiado el dominio público `x` que consume el Canvas de React), se optó por **suprimir la deposición contable dentro de los primeros 10 m** del mismo dominio 0–100 existente. Partículas ahí no pueden asentarse (quedan en suspensión/rebotan) hasta pasar x=10, evitando el artefacto de depósito "instantáneo" de grava recién inyectada sin romper el contrato de coordenadas que ya usa la UI.
5. **Suavizado del remanso:** rampa de transición ampliada de 4 a 8 m por lado y cambiada de coseno alzado (C¹) a *smootherstep* de Perlin (C², sin curvatura en los extremos) — es una elección de suavizado numérico/geométrico, no física, para evitar picos artificiales en dτ/dx en los bordes 50/70 m.
6. **`resetOnChange` (mecanismo, no política):** se añadió como campo opcional en `SimParams`; si está en `true` y cambia un parámetro clave (velocity/depth/poolFactor/feedRate/mix) respecto al `setParams()` anterior, el motor llama a `reset()` automáticamente. El motor solo expone el mecanismo — la decisión de *cuándo* activarlo (p.ej. al mover el slider) queda para `react-expert` en la Fase 2.

### Verificación
`npm test`: 16/16 verde (10 previas + 6 nuevas). `npm run build` (`tsc --noEmit && vite build`): verde.

## Flujo de trabajo: orquestador + 6 subagentes en Claude Code (VS Code)
**Fecha:** 2026-09-19  **Impacto:** Alto

### Contexto
El usuario quiere continuar el MVP en Claude Code con roles especializados y un registro automático en la bóveda.

### Decisión
El primer prompt está en [[../03-Activos/prompt-inicial-claude-code]]. Define 6 subagentes: `frontend-expert`, `uiux-reviewer` (solo lectura), `react-expert`, `backend-expert` (motor de simulación; sin servidor por defecto), `vercel-deploy-expert` y `obsidian-registrar` (única vía de escritura en la bóveda).

### Razones
1. Propiedad de archivos disjunta por subagente para evitar conflictos.
2. Fases con puntos de registro obligatorios en Obsidian.
3. Deploy a producción solo con autorización explícita del usuario; sin guardar tokens.

### Implicaciones
- "Backend" = motor `src/sim/**`; `api/**` solo si hay necesidad real (por defecto la app es estática y se comparte por URL).
- Los subagentes se crean como archivos en `.claude/agents/` al ejecutar el prompt (no se crearon aún).

## Público objetivo: universidad
**Fecha:** 2026-09-19  **Impacto:** Medio

La interfaz muestra la física (Rouse, τ/τce, curva de Hjulström del modelo, ecuaciones y limitaciones) en lugar de ocultarla. Ver [[../00-Proyecto/README]].

## Parámetros del modelo del MVP v0.1
**Fecha:** 2026-09-19  **Impacto:** Medio

- Rugosidad fija z0 = 1 mm (lecho natural rugoso) → u* = U·κ/(ln(h/z0) − 1). Con esto la velocidad media crítica de la arena media (0,5 mm) es ≈ 0,3 m/s a h = 1 m; los valores de una estimación previa (≈ 0,35) usaban rugosidad de grano y son distintos.
- Clases: arcilla 2 µm, limo 20 µm, arena fina 0,125 mm, arena media 0,5 mm, grava 4 mm.
- Cohesión (valor **pedagógico**, no de literatura): τce arcilla 1,0 Pa, limo 0,3 Pa; deposición cohesiva τcd = 0,3·τce (histéresis).
- Deposición: al tocar el lecho, probabilidad 1 − τ/τcd; resuspensión con tasa 0,2·(τ/τce − 1) por segundo.
- Difusividad parabólica con corrección de gradiente (paso de Visser) en la caminata aleatoria; conocimiento propio, pendiente de validación (tarea B1/B2 en el prompt).
- Verificado: 10 pruebas Vitest (conservación de masa, más velocidad ⇒ más transporte, grava se deposita antes que arcilla, remanso aumenta depósito).

## Stack del MVP: Vite + React 18 + TypeScript + Canvas 2D
**Fecha:** 2026-09-19  **Impacto:** Alto

### Alternativas
- WebGL/WebGPU: innecesario para ~8 000 partículas 2D.
- Web Worker: no hace falta por ahora; se evaluará si el perfilado supera 8 ms/frame.
- Zustand/Redux: no necesarios; posiciones en typed arrays fuera de React (skill `arquitectura-simulaciones-web`).

### Decisión
Sitio estático, Canvas 2D, SVG para gráficos auxiliares, deploy en Vercel. Ver [[../01-Referencias/tech-stack]].

## Enfoque de simulación: partículas lagrangianas 2D (vista lateral) + panel Hjulström/Rouse
**Fecha:** 2026-09-19  **Impacto:** Alto  **Estado:** implementado en el MVP v0.1

### Contexto
Idea del proyecto: simular cómo un río transporta sedimentos; el usuario cambia la velocidad del agua y observa cuántos sedimentos se transportan vs. se depositan antes del final del río. Detalle en [[../01-Referencias/glosario]] y [[arquitectura]].

### Alternativas Consideradas
- **A. Curva de Hjulström directa (regla sí/no por velocidad):** simple, pero cualitativa y binaria.
- **B. Malla euleriana (tipo Webgl-Erosion):** no conserva masa exactamente, requiere GPU y es difícil de explicar.
- **C. Partículas lagrangianas con random walk turbulento + umbrales Shields/Rouse (elegida).**

### Razones
1. Las partículas se cuentan una a una (conservación de masa).
2. Umbral = Shields (Soulsby-Whitehouse 1997); caída = Soulsby 1997; modo = número de Rouse.
3. Funciona con Canvas 2D sin GPU.

### Implicaciones
- Limitación: Shields no modela cohesión (arcillas); aclarado en la UI.
