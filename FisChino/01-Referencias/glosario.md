---
tipo: referencia
última-actualización: 2026-09-20
---


# Glosario — ExpoFisChino

| Término | Significado |
|---------|-------------|
| ExpoFisChino | Nombre del proyecto: simulador web de transporte de sedimentos en un río (para universidad) |
| EFC | Sigla del proyecto; se usa en el nombre de la skill `efc-memoria` |
| FisChino | Nombre de la carpeta/bóveda: `D:\Proyectos\ExpoFisChino\FisChino` |
| app | Carpeta del código: `D:\Proyectos\ExpoFisChino\app` |
| Curva de Hjulström | Diagrama empírico velocidad vs tamaño de grano con zonas de erosión, transporte y deposición |
| Parámetro de Shields (θ) | τ / ((ρs−ρ)·g·d); el movimiento inicia cuando θ > θcr |
| τce / τcd | Esfuerzo cortante crítico de erosión / de deposición (Pa) |
| u* | Velocidad de corte (shear velocity) = √(τ/ρ) |
| ws | Velocidad de caída (settling velocity) de la partícula |
| Número de Rouse (P) | ws / (κ·u*), κ=0.41. >2.5 carga de fondo; 1.2–2.5 suspensión parcial; 0.8–1.2 suspensión total; <0.8 carga de lavado |
| D* | Tamaño de grano adimensional = [(s−1)·g·d³/ν²]^(1/3) |
| Carga de fondo / suspendida / de lavado | Bed load / suspended load / wash load: modos de transporte |
| Remanso | Tramo (50–70 m) donde el cauce se profundiza y U = q/h baja |
| Lagrangiano | Modelo que sigue partículas individuales (vs. malla euleriana) |
| Orquestador | El Claude Code principal que reparte tareas a los subagentes |
| HANDOFF | Bloque de informe que cada subagente entrega al `obsidian-registrar` |
| ENTRY_BUFFER | Zona de 0-10 m del tramo donde no se cuenta ni ocurre depósito contable (evita el artefacto de "depósito instantáneo" de grava recién inyectada) |
| WindowStats / `getWindowStats` | API del motor (`engine.ts`) que da tasas de régimen (salida, aporte, depósito neto, capacidad de transporte relativa = salida/aporte) en una ventana móvil, en vez del "% acumulado" |
| smootherstep | Interpolación C² (de Perlin) usada para suavizar la geometría del remanso; es una elección numérica/geométrica, no física |
| `useSimulationLoop` | Hook de React (`src/hooks/useSimulationLoop.ts`) que corre el bucle `requestAnimationFrame` de la simulación (dt acotado, seguro con StrictMode), separado del dibujo |
| `DrawRiver` / `SimulationView` | Contrato TypeScript (`ctx, engine, view`) que define react-expert para que frontend-expert implemente el dibujo del río en `src/render/drawRiver.ts` |
| `resetOnChange` (política) | Decisión de UI (Fase 2, react-expert): activar siempre el mecanismo del motor para que cambiar un parámetro clave reinicie el conteo y no mezcle regímenes |
| "Nuevo experimento" | Aviso que muestra `App.tsx` cuando un cambio de parámetro clave dispara un `resetOnChange` |
| Enlace compartible | URL con query params `U/h/remanso/aporte/mezcla/t` (`src/state/urlParams.ts`) que reproduce un escenario exacto; se escribe con `history.replaceState` + debounce |
| `drawRiver` (implementación) | Función en `src/render/drawRiver.ts` (frontend-expert, Fase 2) que implementa el contrato `DrawRiver` definido por react-expert: dibuja el río, la franja del `ENTRY_BUFFER`, los depósitos y el indicador de salida, sin mutar `engine` ni llamar `setState` |
| Modo proyector | Estilos con `@media (min-width:1600px)` (tipografías/paddings mayores) pensados para proyección en aula (resuelve UX-02) |
| `variant="playback"` | Prop de `Controls.tsx` que aplica el acento visual `--accent-2` (morado) al slider de "Avance del tiempo (reproducción)" para diferenciarlo de los sliders de parámetros físicos del río (resuelve UX-04/UX-09 para ese control) |
| `GuidedExperiments` | Componente (`src/components/GuidedExperiments.tsx`, react-expert, Fase 3) con el flujo didáctico de 4 experimentos guiados (selector → iniciar → pregunta → conclusión → siguiente paso); resuelve UX-08 |
| `focusTargetRef` / `focusSignal` | Mecanismo de accesibilidad de teclado en `GuidedExperiments.tsx` (Fase 3-correcciones): un único ref reutilizado (`focusTargetRef`) más un contador (`focusSignal`) que dispara un `useEffect` para mover el foco al elemento correcto tras cada transición iniciada por el usuario; resuelve N-10 |
| N-10 / N-11 / N-12 | Hallazgos nuevos de la re-auditoría U2 (Fase 3, `uiux-reviewer`) sobre `GuidedExperiments`: N-10 = foco perdido a `<body>` tras transiciones (resuelto con `focusTargetRef`/`focusSignal`); N-11 = falta `aria-live` en la pregunta de cada paso (resuelto con `aria-live="polite"` en `.guided-step`); N-12 = el panel empujaba el canvas fuera del viewport en tablet 1024×768 (resuelto con `<details>` colapsado por defecto). Detalle en [[../00-Proyecto/informe-uiux-2026-09-19]] |
| skill (agent skill) | En el contexto de Claude Code: paquete instalable de instrucciones/guía especializada para un subagente (p.ej. dirección de diseño, flujo de deploy, metodología de auditoría), obtenido del marketplace skills.sh vía la CLI `npx skills` e instalado como skill de proyecto en `.claude/skills/`. No es código de la app; se referencia en el frontmatter (`tools: Skill`) y en el cuerpo del subagente que lo usa |
| `skills-lock.json` | Lockfile generado por la CLI `npx skills` (skills.sh) que fija qué skills están instalados, de qué repo/versión, y en qué subagentes están disponibles; se versiona en git (a diferencia del contenido descargado en `.agents/skills`, que va en `.gitignore`) |
| `fisica-transporte-sedimentos` (skill) | Skill propia de `backend-expert` (activa en `.claude/skills/`, sin entrada en `skills-lock.json` por ser local): marco teórico citable del transporte de sedimentos (ley de la pared, Shields/Soulsby, Rouse, Hjulström, cohesivos). Detalle en [[../00-Proyecto/decisiones]] |
| `modelo-rio-efc` (skill) | Skill propia de `backend-expert`: el modelo concreto del río EFC (geometría, remanso, clases de grano verificadas contra el código, reglas de depósito/resuspensión, contrato de `WindowStats`, literatura vs. pedagógico); "si el código cambia, esta skill se actualiza en el mismo commit". Detalle en [[../00-Proyecto/decisiones]] |
| `calibracion-numerica-lagrangiana` (skill) | Skill propia de `backend-expert`: esquema de Visser, estabilidad de `dt`, condiciones de borde, invariantes, convergencia, protocolo síntoma→perilla para distinguir artefacto numérico de física real. Detalle en [[../00-Proyecto/decisiones]] |
