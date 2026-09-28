---
tipo: informe-uiux
última-actualización: 2026-09-20
tags: [expofischino, efc, uiux]
---

# Informe UI/UX — ExpoFisChino (ronda 1: 2026-09-19; ronda 2/U2: 2026-09-20; ronda 3/revamp: 2026-09-20)

Auditoría de `uiux-reviewer` (Fase 1, solo lectura) sobre el MVP v0.1 construido por `frontend-expert`/`react-expert`, más la re-auditoría de Fase 3 (U2) tras el experimento guiado y las correcciones. Ver [[decisiones]] y [[roadmap]].

**Nota importante sobre criterios (para que las tres rondas no se lean como contradictorias):** las rondas 1 y 2/U2 auditaron **accesibilidad/usabilidad** — heurísticas de Nielsen y WCAG 2.1 AA — y dieron correctamente "sin hallazgos Críticos/Altos" para ese criterio. La ronda 3, a pedido explícito del usuario tras probar la app y no quedar conforme "ni en física ni en visual", auditó un criterio **distinto**: juicio de diseño/estética (paleta, tipografía, composición, plausibilidad visual del río) y plausibilidad del comportamiento físico observado en movimiento, algo que las rondas 1/2 nunca evaluaron. Son varas distintas, no un cambio de opinión sobre el mismo criterio. Detalle completo de por qué en [[decisiones]] (entrada "Revamp visual + comportamiento").

## Método
Build + preview levantados (`npm run build`, `npm run preview`); capturas con Playwright/Chromium en 1440×900, 1024×768 y 390×844; captura de zoom del diagrama de Hjulström; captura de foco por teclado; verificación directa de favicon 404 vía `curl http://localhost:4173/favicon.ico`; lectura de componentes y estilos; revisión contra heurísticas de Nielsen y WCAG 2.1 AA; evaluación de claridad didáctica y coherencia terminológica en español.

**Verificación:** sin errores de consola JS en ninguna resolución. Capturas guardadas en el scratchpad de la sesión (no en el repo).

## Hallazgos (sin críticos)

| # | Severidad | Hallazgo | Asignado a | Estado (tras Fase 2, 2026-09-20) |
|---|-----------|----------|------------|-----------------------------------|
| UX-01 | Alta | Etiqueta "TRANSPORTE" solapada con puntos en `HjulstromChart.tsx` (L75-77) | frontend-expert | ✅ Resuelto: etiqueta rotada -90° con posición fija (no relativa a U) |
| UX-02 | Alta | Tipografía no apta para "modo proyector" (ticks SVG, notas) | frontend-expert | ✅ Resuelto: ticks 11→14px, eje→15px, notas/muted/kpi/tabla ≥0.85-0.92rem + modo proyector `@media (min-width:1600px)` |
| UX-03 | Alta | Favicon 404 confirmado; falta `public/favicon.svg` y `<link rel="icon">` | frontend-expert | ✅ Resuelto: `public/favicon.svg` nuevo + `<link rel="icon">` actualizado |
| UX-04 | Media | Dos sliders llamados "Velocidad" (U física vs. `timeScale` de reproducción) pueden confundirse | react-expert (copy/estructura) + frontend-expert (separación visual) | ✅ Resuelto: rename "Avance del tiempo (reproducción)" (react-expert) + divisor punteado y acento morado `variant="playback"` (frontend-expert) |
| UX-05 | Media/Alta | KPI "Transportado hasta la salida" se queda en 0% varios segundos a U bajas/medias con `timeScale=15×`, se lee como "no pasa nada" | backend-expert (motor/parámetros por defecto) o ajustar `timeScale` por defecto | ✅ Resuelto: bloque "Régimen actual" con `getWindowStats(20)` en `Metrics.tsx` (react-expert), sin subir `timeScale` por defecto |
| UX-06 | Media | `prefers-reduced-motion` no respetado en `RiverCanvas` (el `rAF` no chequea `matchMedia`) | react-expert | ✅ Resuelto: `prefersReducedMotion()` decide el `running` inicial (react-expert) + refuerzo CSS `transition-duration:0.001ms!important` (frontend-expert) |
| UX-07 | Baja | Botones/thumb de slider bajo 44px táctiles | frontend-expert | 🟡 Parcial (Baja, no bloqueante — confirmado en U2): `.btn.small` 34→40px, thumbs 26px, pista de slider 44px; el botón/thumb en sí no llega a 44px aunque la pista sí |
| UX-08 | Baja (ya conocido) | Sin flujo didáctico guiado | react-expert, Fase 3 | ✅ Resuelto (R3, Fase 3): `GuidedExperiments.tsx` con los 4 experimentos del guion de abajo; flujo end-to-end probado en U2 |
| UX-09 | Baja | Azul `--accent` sobrecargado semánticamente | frontend-expert (opcional) | 🟡 Parcial (Baja, no bloqueante — confirmado en U2): acento morado `--accent-2` distinto para el slider de reproducción vs. parámetros físicos; el azul `--accent` sigue compartido en algunos usos residuales |

## Victorias rápidas sugeridas
1. Favicon (UX-03).
2. Subir `timeScale` por defecto de 15× a ~25-30× (mitiga UX-05).
3. Reposicionar el texto "TRANSPORTE" (UX-01).

## Guion didáctico de 4 experimentos guiados (para react-expert, Fase 3)

### 1. De crecida a sequía
**Pasos:** fijar U=1,5 m/s (preset "Crecida"), Reiniciar, observar 15-20 s; luego U=0,15 m/s (preset "Sequía"), Reiniciar, observar de nuevo.
**Conclusión esperada:** a mayor U incluso la grava llega a la salida; al bajar U, grava y arena media se depositan casi de inmediato cerca del origen mientras arcilla/limo siguen viajando — la capacidad de transporte del río depende de la velocidad.

### 2. Clasificación granulométrica
**Pasos:** U=0,5 m/s ("Caudal normal"), dejar correr 20-30 s mirando el gráfico "Dónde se deposita".
**Conclusión esperada:** granos gruesos se apilan cerca de 0-10 m; arcilla/limo casi no aparecen ahí — el río clasifica el sedimento por tamaño a lo largo de su curso.

### 3. Umbral de Hjulström/Shields
**Pasos:** mover el slider U lentamente de 0,05 a 2,0 m/s observando la línea U en el diagrama de Hjulström y la columna τ/τce de la tabla.
**Conclusión esperada:** cuando la línea U cruza bajo la curva roja para un grano, τ/τce cae bajo 1 y ese grano deja de poder erosionarse — conecta el diagrama empírico con el modelo físico.

### 4. Efecto del remanso
**Pasos:** U=0,6 m/s constante, subir "Remanso (profundización)" de 1× a 3-4× y observar el tramo 50-70 m.
**Conclusión esperada:** aunque el caudal de entrada no cambia, al profundizarse el cauce (U=q/h) el agua se frena localmente y allí se deposita sedimento que no se habría sedimentado en un tramo uniforme — la geometría del cauce, no solo el caudal, controla dónde se sedimenta.

## Ronda 2 (U2) — re-auditoría, 2026-09-20

`uiux-reviewer` re-auditó los 9 hallazgos de la ronda 1 en vivo (build + preview + Playwright) a 1920×1080/1440×900/1024×768/390×844, tras el experimento guiado R3 de `react-expert` (ver [[decisiones]]).

**Veredicto:** UX-01, UX-02, UX-03, UX-04, UX-05, UX-06 y UX-08 **Resueltos**, con evidencia propia (capturas, medición de contraste, petición de red del favicon, flujo end-to-end de los 4 experimentos guiados probado). UX-07 y UX-09 **Parciales (Baja, no bloqueantes)**. Contraste medido: todos los colores clave pasan WCAG AA (≥4.5:1). **No quedan hallazgos Críticos ni Altos abiertos** — se cumple el criterio de "hecho" del proyecto.

### Hallazgos nuevos de U2 (todos ya resueltos en la ronda de correcciones)

| # | Severidad | Hallazgo | Asignado a | Estado |
|---|-----------|----------|------------|--------|
| N-10 | Media | Tras cada transición en `GuidedExperiments` (iniciar/ver conclusión/siguiente paso), el foco caía a `<body>` — mala accesibilidad de teclado/lector de pantalla | react-expert | ✅ Resuelto: `focusTargetRef` + `focusSignal`, foco movido al elemento correcto tras cada transición iniciada por el usuario (ver [[decisiones]]) |
| N-11 | Media | La pregunta de cada paso no tenía `aria-live`, solo la conclusión | react-expert | ✅ Resuelto: `aria-live="polite"` en `.guided-step` |
| N-12 | Baja/Media | En tablet 1024×768, el panel `GuidedExperiments` empujaba el canvas del río fuera del viewport inicial (~40px visibles) | frontend-expert | ✅ Resuelto: `<details><summary>` colapsado por defecto; margen del canvas pasó de 47px a 92px sobre 768 |

**Verificación de U2 y de las correcciones:** capturas tomadas (luego borradas por el orquestador, quedaron fuera del repo, sin secretos); 39/39 tests Vitest en verde tras las correcciones; `npm run build` sin errores; favicon confirmado HTTP 200.

## Ronda 3 (revamp visual+comportamiento) — 2026-09-20

Ejecución del prompt de rediseño ([[../03-Activos/prompt-revamp-2026-09-20]]) tras el feedback directo del usuario ("no quedó bien ni en física ni en visual"). `uiux-reviewer` re-diagnosticó (Paso 1) con criterio de **diseño/estética**, no el checklist de accesibilidad ya superado en U2, viendo la app correr en movimiento (secuencia de frames, arrastre de sliders sin soltar). En paralelo, `backend-expert` auditó comportamiento observable del motor (ver causa raíz del bug de reset y hallazgos numéricos en [[decisiones]]). Tras la dirección visual "instrumento de campo" aprobada por el usuario y la implementación (Paso 3), se re-auditó (Paso 4) con el mismo criterio nuevo.

### Hallazgos de diseño (D1-D10): Paso 1 (diagnóstico) vs. Paso 4 (re-auditoría)

| # | Severidad | Hallazgo (Paso 1) | Asignado a | Estado (Paso 4, re-auditoría) |
|---|-----------|--------------------|------------|-------------------------------|
| D1 | Alta | Agua/lecho sin textura ni movimiento, partículas sin profundidad — lee como scatter-plot sobre fondo de color, no como río | frontend-expert | ✅ Resuelto: `drawRiver.ts` reescrito, agua con gradiente de 4 paradas, líneas de flujo animadas atadas a la velocidad real del motor (`performance.now()`), overlay sutil de remanso |
| D2 | Alta | Depósito de grava renderizado como bloque sólido opaco, parecía bug de render, no banco de grava (el momento más "vistoso" de la demo) | frontend-expert | ✅ Resuelto: contorno suavizado + patrón de textura granulada cacheado en vez de relleno plano |
| D3 | Alta | Sin jerarquía visual — 6-7 secciones en cards blancas idénticas, el río competía en igualdad de peso con un `<select>`; en móvil el canvas quedaba ~4 pantallas de scroll por debajo de todos los controles | frontend-expert | ✅ Resuelto: canvas sin marco de "card genérica", ocupa toda su columna; orden móvil corregido (quitó `order:-1` de `.col-side`), canvas visible antes que los controles |
| D4 | Media/Alta | Paleta "SaaS dashboard genérico" sin intención de río/geociencia | frontend-expert | ✅ Resuelto: paleta "instrumento de campo", chrome oscuro (`--bg #10161c`, `--accent #2fb8c4`, `--accent-2 #e8a23d`) |
| D5 | Media/Alta | Los 5 colores de clase de grano eran una selección arbitraria del círculo cromático (la grava era morada) | backend-expert (campo `color`) | ✅ Resuelto: escala tierra→piedra coherente con el diámetro físico — arcilla `#3a2a1e` → limo `#7d5a35` → arena fina `#c08a3f` → arena media `#e0a95c` → grava `#d6cdbd` |
| D6 | Media | Panel de Resultados sobrecargado — se leía como hoja de cálculo, no como tablero de expo | frontend-expert | 🟡 Resuelto con un matiz: escalonado en 2 niveles con `<details>` colapsado |
| D7 | Media | Gráficos SVG (`HjulstromChart`, `DepositChart`) desentonaban visualmente con el canvas | frontend-expert | ✅ Resuelto: gráficos SVG heredan la paleta oscura |
| D8 | Baja/Media | Botones sin diferenciar por categoría | frontend-expert | ✅ Resuelto: botones diferenciados por categoría |
| D9 | Baja/Media | Sin identidad visual (favicon genérico, sin acento de marca) | frontend-expert | ✅ Resuelto: identidad visual mínima en el header, favicon actualizado |
| D10 | Baja | Jerarquía tipográfica floja dentro del canvas (etiquetas, KPIs) | frontend-expert | ✅ Resuelto: tipografía monoespaciada del sistema con `tabular-nums` para todo dato numérico |

### Hallazgos nuevos de la re-auditoría Paso 4 (N1/N2), resueltos en ronda corta

| # | Severidad | Hallazgo | Asignado a | Estado |
|---|-----------|----------|------------|--------|
| N1 | Media | El CSS de "modo proyector" (≥1600px) no forzaba pintar el panel nivel 2 (`<details>`) en Chromium, por `content-visibility:hidden` del pseudo-elemento interno `::details-content` | frontend-expert | ✅ Resuelto: regla CSS apuntada al pseudo-elemento real `::details-content`, no a los hijos de autor |
| N2 | Media | Contraste de `--danger` sobre `--surface` en 4.31:1, bajo el umbral AA 4.5:1, afectando la celda de tabla `td.neg` | frontend-expert | ✅ Resuelto: token nuevo `--danger-text:#e87869` aplicado solo en `td.neg` (5.60:1 sobre `--surface`), sin tocar `--danger` global (ya cumplía en el KPI grande) |

**Veredicto final de `uiux-reviewer` (Paso 4):** la app ya no se ve como dashboard genérico ni como bug visual — se ve como un instrumento científico legible y con identidad propia. Confirmó en vivo que el fix del reset-en-tick funciona: arrastrando el slider sin soltar, los conteos evolucionan coherentemente y solo resetean al soltar. El fotorrealismo de agua se descartó explícitamente como esfuerzo desperdiciado para una app didáctica — el objetivo era legibilidad de instrumento, no realismo.

**Verificación de la ronda 3:** capturas Playwright en 3 resoluciones + secuencia de movimiento + arrastre de slider sin soltar (fuera del repo, sin secretos). `npm test` 43/43 verde (39 base + 4 tests de regresión nuevos del fix de reset en `App.test.tsx`). `npm run build` limpio, sin warnings. Sin errores de consola en ninguna auditoría (Paso 1 ni Paso 4). Detalle técnico completo (causa raíz del bug, decisiones de cada subagente, alternativas descartadas) en [[decisiones]] (entrada "Revamp visual + comportamiento (ejecución completa)").

## Relacionado
- [[decisiones]]
- [[roadmap]]
- [[../03-Activos/prompt-inicial-claude-code]]
