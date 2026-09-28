---
name: calibracion-numerica-lagrangiana
description: Método numérico y protocolo de ajuste de simulaciones lagrangianas de partículas con caminata aleatoria — esquema de Visser corregido y condición de buen mezclado, criterios de estabilidad del paso de tiempo, condiciones de borde en lecho y superficie, determinismo y semilla, invariantes de masa, pruebas de convergencia y de perfil analítico, ruido estadístico y detección de estado estacionario. Úsala siempre que un resultado de la simulación se vea raro, sesgado, ruidoso o dependiente del dt; antes de cambiar un parámetro físico "porque el resultado no cuadra"; cuando haya que elegir o justificar un paso de tiempo, un número de partículas o una ventana de promediado; cuando se toque engine.step, la integración vertical, los rebotes o el RNG; o cuando haya que escribir tests de convergencia, de conservación de masa o de regresión numérica.
---

# Calibración numérica de la simulación lagrangiana

Esta skill responde a una sola pregunta, que es la que más tiempo hace perder en un simulador
de partículas: **¿lo que estoy viendo es física o es el método numérico?**

## Regla de precedencia (no negociable)

Cuando un resultado se ve mal, el orden de diagnóstico es:

1. ¿Se conserva la masa? *(bug de contabilidad)*
2. ¿El resultado cambia si reduzco `dt` a la mitad? *(error de integración)*
3. ¿El resultado cambia si duplico el número de partículas o cambio la semilla? *(ruido estadístico)*
4. ¿Los casos analíticos conocidos se reproducen? *(esquema mal implementado)*
5. **Sólo entonces:** ¿el parámetro físico está mal elegido?

**Ajustar un parámetro físico para tapar un artefacto numérico es el peor error posible en
este proyecto**, porque produce un modelo que da el número correcto por la razón equivocada —
exactamente lo contrario de lo que la simulación intenta enseñar. Si hay que ajustar física,
que sea después de descartar 1–4, y hay que decirlo en el informe.

## 1. El esquema: caminata aleatoria de Visser (1997)

La difusividad turbulenta vertical no es uniforme: con perfil parabólico
`K(z) = κ·u*·z·(1 − z/h)`, vale cero en el lecho y en la superficie y es máxima a media
columna. Una caminata aleatoria ingenua

    z ← z + √(2·K(z)·dt)·N(0,1)        ← MAL

**acumula partículas artificialmente en las zonas de baja difusividad**, es decir, contra el
lecho. Si el modelo usa eso, va a "depositar" de más por una razón puramente numérica y va a
parecer física.

El esquema correcto añade un término de deriva igual al gradiente de la difusividad y evalúa
`K` en una posición intermedia (Visser 1997, *MEPS* 158:275-281, Eq. 6):

    K'  = ∂K/∂z |_z
    z̃  = z + ½·K'·dt
    z ← z + K'·dt + √(2·K(z̃)·dt)·N(0,1)

Para `K = κ·u*·z·(1 − z/h)`:

    ∂K/∂z = κ·u*·(1 − 2z/h)

**El motor de EFC ya implementa exactamente este esquema** (`deps` es `K'`, `zm` es `z̃`,
`epsM` es `K(z̃)`), más el término de caída `−w_s·dt`. No "simplificar" quitando `deps`: ese
término es lo que hace que el modelo sea físicamente correcto.

### Condición de buen mezclado (well-mixed condition, WMC)

Criterio de validez universal, y el mejor test que existe para este tipo de esquema:
**si una nube está inicialmente bien mezclada en la vertical, debe seguir bien mezclada.**

Test ejecutable:
1. Poner `w_s = 0` (o usar una clase de prueba sin caída) y desactivar deposición/erosión.
2. Distribuir N partículas uniformemente en `z ∈ [0, h]`.
3. Correr muchos tiempos de mezcla (`t ≫ h/(κu*)`).
4. Histograma vertical: debe seguir plano dentro del ruido de Poisson (`±1/√n` por bin).

Si se curva hacia el lecho, falta el término de deriva o `dt` es muy grande. **Este test
debería estar en `sim.test.ts` de forma permanente**; es barato y detecta la regresión más
peligrosa del motor.

### Criterio de paso de tiempo de Visser

    dt ≪ 1 / max|∂²K/∂z²|

Para el perfil parabólico, `∂²K/∂z² = −2κu*/h`, luego

    dt ≪ h / (2·κ·u*)

En EFC con `h = 1 m`: `dt ≪ 29 s` a `U = 0.6 m/s`, `dt ≪ 12 s` a `U = 1.5 m/s`. Con
`maxStep = 0.05 s` el margen es de más de dos órdenes de magnitud. **Éste no es el criterio
que manda aquí.**

## 2. El criterio que sí manda: resolver la capa cerca del lecho

La deposición se decide en una capa de espesor `z_b = 0.02·h`. Para que esa decisión sea
física y no un artefacto, **ningún paso vertical debe saltarse esa capa entera**:

    w_s·dt ≪ z_b        y        √(2·K(z_b)·dt) ≲ z_b

Valores reales de EFC con `dt = 0.05 s`:

| | `z_b` | `w_s·dt` grava | paso difusivo en `z_b` |
|---|---|---|---|
| h = 0.5 m, U = 0.6 | 10 mm | **12.9 mm** ⚠ | 4.4 mm (44 %) |
| h = 0.5 m, U = 2.0 | 10 mm | **12.9 mm** ⚠ | 7.9 mm (79 %) ⚠ |
| h = 1.0 m, U = 0.6 | 20 mm | 12.9 mm (65 %) | 5.8 mm (29 %) |
| h = 2.0 m, U = 1.5 | 40 mm | 12.9 mm (32 %) | 12.2 mm (31 %) |

**Hallazgo concreto y accionable:** para `h ≲ 0.65 m`, la grava (`w_s = 258 mm/s`) recorre en
un solo paso más que el espesor de la capa de lecho. A profundidades bajas su deposición está
sub-resuelta. Si alguna vez se permite `depth < 0.65 m` en la UI, o se sube `w_s` de la clase
más gruesa, **hay que bajar `maxStep`** (a 0.02 s el paso de grava cae a 5.2 mm) o hacer
`maxStep` adaptativo: `maxStep = min(0.05, 0.2·z_b/w_s_max)`.

La advección horizontal no es restrictiva: `u(z_b)·dt ≤ 56 mm` en el peor caso, contra celdas
de 250 mm. Nunca se salta una celda del campo hidráulico.

**Decisión registrada (Paso 3, backend, sept. 2026): NO se aplicó `maxStep` adaptativo esta
ronda.** Se implementó y perfiló la fórmula literal `maxStep = min(maxStep recibido,
0.2·z_b/w_s_max)` dentro de `engine.advance()`. Dos hallazgos con datos:

1. **Convergencia:** a `depth = 0.5 m`, `velocity = 0.6 m/s` (el caso exacto de la fila de
   arriba), promediando 8 semillas sobre 90 s simulados, el depósito de grava fue
   105.5 ± 1.9 (SEM) partículas con `maxStep = 0.05` fijo vs. 112.9 ± 3.0 con el paso
   adaptativo (`≈0.0078 s` a esa profundidad) — una diferencia de ~7 %, del orden de 2–2.5
   SEM: un sesgo real pero pequeño, no dramático, y con más semillas haría falta para acotarlo
   mejor.
2. **Costo:** la fórmula `0.2·z_b/w_s_max` con `z_b = 0.02·h` es más estricta de lo que el
   propio hallazgo sugiere — a `h = 1 m` (caso ya calificado arriba como "65 %, sin alarma")
   igual fuerza `maxStep ≈ 0.0155 s`, es decir **~3.2× más sub-pasos que el default en el caso
   típico**, no solo en el caso límite `h ≲ 0.65 m`. Perfilado con `capacity = 8000` casi lleno
   (`performance.now()` alrededor de `engine.advance()`, réplica de la metodología de la
   tabla de benchmarks de la sección 9): a `depth = 1.0 m` el costo por frame subió ~3.2×
   (dentro de presupuesto, pero con mucho menos margen), a `depth = 0.5 m` subió ~6.4×
   (al borde del presupuesto de 8 ms/frame), y a `depth = 0.3 m` (extremo sensato del slider)
   subió ~11× (claramente por encima del presupuesto, jank visible).

**Conclusión:** la fórmula tal cual escrita corrige un sesgo real pero modesto a costa de un
gasto de cómputo que golpea casi todo el rango sensato de `depth` (0.3–3.2 m), no solo el caso
límite documentado (`h ≲ 0.65 m`). Aplicarla sin condición contradice el principio de "nunca
optimizar/penalizar por intuición" de esta misma skill. **No se aplicó.** Si en el futuro se
quiere resolver el caso límite sin pagar el costo en el resto del rango, la vía más prometedora
es condicionar el ajuste a la profundidad mínima real del campo (`min(hArr)`), activándolo solo
por debajo de ~0.65 m, y/o relajar el objetivo de resolución (p.ej. `0.5·z_b/w_s_max` en vez de
`0.2·z_b/w_s_max`, ya que `h = 1 m` con 65 % de cobertura se consideró aceptable) — pero eso es
trabajo pendiente, no implementado, y necesitaría su propio perfilado antes de aplicarse.

## 3. Condiciones de borde

- **Superficie** (`z > h − z_b`): reflexión especular, `z ← 2(h − z_b) − z`, con tope inferior
  en `z_b`. La reflexión es la condición correcta para flujo sin pérdida por la superficie;
  usar "clamp" (`z = h`) en vez de reflexión **acumula partículas en la superficie** y rompe
  el buen mezclado tanto como quitar el término de deriva.
- **Lecho** (`z < z_b`): condición mixta. Con probabilidad `1 − τ/τ_cd` absorbe (deposita); si
  no, refleja a `z_b + lift`. Nunca hacer `clamp` puro sin decidir, y nunca dejar `z < 0`.
- **Salida** (`x ≥ L`): absorbente, se contabiliza y se libera el slot.
- **Entrada**: la zona sin deposición (`ENTRY_BUFFER`) **es** una condición de borde
  disfrazada — existe porque la condición inicial (uniforme en la vertical) no es la solución
  de equilibrio. La alternativa "elegante" sería inyectar con perfil de Rouse; se eligió el
  buffer por simplicidad y transparencia. Si algún día se inyecta con perfil de equilibrio,
  `ENTRY_BUFFER` puede reducirse — pero hay que rehacer el test del histograma de depósito.

## 4. Determinismo y aleatoriedad

- **PRNG:** `mulberry32` con semilla explícita. Nunca `Math.random()` en el motor: rompe la
  reproducibilidad de los tests y la comparación entre corridas.
- **Gaussianas:** Box-Muller con `spare` cacheado. Cuidado: el `spare` guarda estado entre
  llamadas, así que **cambiar el orden o el número de llamadas al RNG cambia toda la
  trayectoria posterior**. Un cambio inocente (mover un `if`, añadir un sorteo) rompe los
  tests de regresión exacta aunque la física sea idéntica. Por eso los tests deben verificar
  **invariantes y estadísticos**, no valores exactos de posición, salvo un test de regresión
  explícitamente marcado como tal.
- **Reset:** `reset()` no reinicia el PRNG a propósito (corridas sucesivas no son idénticas).
  Si se necesita reproducibilidad estricta corrida a corrida, hay que reconstruir el motor con
  la misma semilla, no llamar `reset()`. Documentarlo si alguien pide "misma semilla, mismo
  resultado".

## 5. Invariantes que deben verificarse siempre

```
injected[c] === exited[c] + deposited[c] + suspended[c]     // por clase y en total
deposited[c] === Σ_bins depositBins[c·N_BINS + bin]         // histograma coherente
0 ≤ s[i] ≤ 1                para toda partícula no FREE
0 ≤ x[i] < RIVER_LENGTH     para toda partícula no FREE
deposited[c] ≥ 0            (la resuspensión no puede dejarlo negativo)
τ_cd ≤ τ_ce                 para toda clase
```

El invariante de masa es el más valioso: atrapa casi todos los bugs de contabilidad de
`step()`. Los errores típicos son un `continue` que se salta un contador, o un
`deposited[c]--` sin su `depositBins[...]--` en la rama de resuspensión.

## 6. Pruebas de convergencia y validación

**Convergencia en `dt`.** Correr el mismo escenario con `maxStep` = 0.05, 0.025, 0.0125 y
comparar `transportCapacity` total en estado estacionario. Si la diferencia entre 0.05 y 0.025
es mayor que el ruido estadístico, `dt` es demasiado grande. **Esta prueba es obligatoria
antes de cambiar `maxStep` o cualquier `w_s`.**

**Convergencia en N.** Duplicar `feedRate` (o `capacity`) y comprobar que las *tasas* y
*fracciones* no cambian, sólo baja el ruido. Si cambian, hay saturación (`saturated === true`)
o una no linealidad no intencionada.

**Caso analítico 1 — perfil de Rouse.** Con `u*` uniforme (sin remanso), sin deposición ni
erosión, y tras `t ≫ h/(κu*)`, el histograma vertical de una clase debe seguir

    c(z)/c(z_a) = [ (h−z)/z · z_a/(h−z_a) ]^P,    P = w_s/(κu*)

Ajustar el exponente por regresión log-log y comprobar que reproduce `P` dentro de ~5 %.
Es el test más fuerte de que la integración vertical es correcta.

**Caso analítico 2 — buen mezclado.** Ver §1.

**Caso analítico 3 — tiempo de tránsito.** Sin deposición, el tiempo medio de tránsito debe
ser `≈ L/U` (con la corrección de que las partículas bajas viajan más lento). Un sesgo grande
delata un error en la advección o en el perfil logarítmico.

**Regresión de valores físicos.** `w_s(0.25 mm) ≈ 36 mm/s`, `θ_cr(D*→∞) ≈ 0.055`,
`D*(0.25 mm) ≈ 6.3`. Siempre en los tests.

## 7. Ruido estadístico y estado estacionario

**Ruido.** Con `n` partículas contadas en una ventana, el error relativo es `≈ 1/√n`. Para
distinguir dos escenarios cuya `transportCapacity` difiere en un 5 %, hacen falta `n ≳ 1600`
eventos **en la ventana**, no en total. Con `feedRate = 20 part/s` eso son ~80 s de
simulación. **Antes de declarar que un cambio de parámetro tuvo efecto, comprobar que el
efecto supera `1/√n`.**

**Estacionario.** El tramo alcanza régimen tras aproximadamente el mayor de:
- tiempo de tránsito `L/U` (100 m a 0.6 m/s ≈ 170 s… pero las clases lentas tardan más),
- tiempo de mezcla vertical `h/(κu*)` (~1 min a `U = 0.6`),
- tiempo de llenado del depósito, que puede ser mucho mayor tras un cambio brusco.

Criterio práctico: `transportCapacity` estable dentro de `±1/√n` durante dos ventanas
consecutivas. **`WindowStats.actualWindowSeconds < requestedWindowSeconds` significa que aún
no hay historial suficiente** — nunca sacar conclusiones de una ventana incompleta.

**Trampa frecuente:** comparar `SimStats` acumulados entre dos corridas de distinta duración.
No son comparables. Para comparar regímenes, siempre `WindowStats`.

## 8. Protocolo de ajuste: síntoma → perilla

Aplicar **una perilla a la vez**, medir con la misma semilla y la misma ventana, y registrar
el cambio en la bóveda.

| Síntoma | Primero descartar (numérico) | Perilla física (si lo numérico está limpio) |
|---|---|---|
| Se deposita demasiado cerca del lecho, en todas partes | Falta el término `∂K/∂z`; `dt` grande; `clamp` en vez de reflexión | — |
| Barra de depósito justo en el borde del remanso | Pico de `dτ/dx`: verificar que el `smootherstep` esté activo y el `ramp` sea suficiente | Ampliar `ramp` |
| Depósito concentrado en los primeros metros | Artefacto de entrada: subir `ENTRY_BUFFER` o inyectar con perfil de Rouse | — |
| La grava "flota" o se deposita a saltos | `w_s·dt > z_b`: bajar `maxStep` o hacerlo adaptativo | — |
| Una clase nunca se deposita | Ninguno si `P < 0.8` y `τ > τ_cd`: es carga de lavado, es correcto | `tauCohesion`, `depFactor` de esa clase |
| Todo sale o todo se deposita en casi todo el slider | — | `Z0` (desplaza todas las `U` críticas); revisar rango del slider |
| El mínimo de Hjulström cae en el grano equivocado | — | Interpolación de `cohesionLevel()` |
| El depósito tarda demasiado en reaccionar a una crecida | Ventana de promediado muy larga | `E₀` (subirlo acelera la resuspensión) |
| Resultados ruidosos, saltan entre frames | `n` bajo en la ventana: subir `feedRate`, `capacity` o la ventana | — |
| `transportCapacity` no converge | No se alcanzó el estacionario; o `saturated === true` | — |
| Los resultados cambian mucho al cambiar la semilla | Ruido estadístico: subir N | — |

## 9. Rendimiento (medido, no estimado)

Presupuesto: **8 ms/frame** con 8 000 partículas (deja margen para render a 60 fps).

Benchmarks reales de `engine.advance()` (sesión B5):

| capacity | media | p95 |
|---|---|---|
| 8 000 | 1.24 ms | — |
| 20 000 | 3.00 ms | 3.30 ms |
| 50 000 | 7.51 ms | — |

**Decisión vigente: NO usar Web Worker.** A 2.5× el objetivo de partículas el motor sigue muy
por debajo del presupuesto; un Worker añadiría complejidad (buffers transferibles, protocolo
de mensajes, latencia de sincronización) sin beneficio medible. **Reevaluar sólo si se supera
~30–40 k partículas** o si el perfilado muestra >8 ms/frame con 8 000.

Reglas de rendimiento del motor, que también protegen la corrección:
- Estado de partículas en arrays tipados (`Float32Array`, `Uint8Array`), fuera del estado de React.
- Campo hidráulico precalculado por celda en `setParams()`, jamás por partícula por paso.
- Nada de asignaciones dentro del bucle de partículas (sin `new`, sin literales de array/objeto,
  sin closures). Una asignación por partícula por paso son 480 000 objetos/segundo.
- `getBinsSnapshot()` devuelve la vista sin copiar, para dibujar cada frame; `getStats()` sí
  copia y **no** debe llamarse cada frame.

**Antes de optimizar:** perfilar con `performance.now()` sobre `advance()` con capacity fija y
reportar media y p95. Nunca optimizar por intuición; nunca sacrificar el término de deriva,
el sub-stepping o la reflexión por velocidad.

## 10. Checklist antes de cerrar cualquier cambio en `src/sim/`

- [ ] Invariante de masa verificado en test, por clase y total.
- [ ] Test de buen mezclado en verde.
- [ ] Convergencia en `dt`: 0.05 vs 0.025 dentro del ruido.
- [ ] Convergencia en N: fracciones estables al duplicar partículas.
- [ ] Casos tabulados de física (`w_s`, `θ_cr`, `D*`) en verde.
- [ ] `saturated === false` en los escenarios de los experimentos guiados.
- [ ] Perfilado si se tocó el bucle de partículas; media y p95 reportadas.
- [ ] Toda constante nueva clasificada: física / literatura (con cita) / pedagógica.
- [ ] `npm test` y `npm run build` en verde.
- [ ] Decisión registrada en la bóveda de Obsidian.

## Fuentes

- Visser, A. W. (1997) "Using random walk models to simulate the vertical distribution of
  particles in a turbulent water column", *Marine Ecology Progress Series* 158:275-281.
  Esquema corregido (Eq. 6), condición de buen mezclado y criterio `δt ≤ min(1/K'')`.
  <https://www.int-res.com/abstracts/meps/v158/p275-281/>
- Thomson, D. J. (1987) "Criteria for the selection of stochastic models of particle
  trajectories in turbulent flows", *J. Fluid Mech.* 180:529-556. Origen de la condición de
  buen mezclado como criterio de selección de modelos.
- Rouse, H. (1937) — perfil analítico usado como caso de validación.

## Skills relacionadas

- `modelo-rio-efc` — los valores concretos, rangos y desviaciones conocidas de este modelo.
- `fisica-transporte-sedimentos` — la física que el método numérico debe reproducir sin
  contaminar.
