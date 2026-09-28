---
name: modelo-rio-efc
description: El modelo físico concreto del simulador de río de ExpoFisChino — geometría del tramo, campo hidráulico y remanso, las cinco clases de grano con sus valores ya calibrados y verificados, las reglas de deposición y resuspensión, la zona de entrada, y el contrato de métricas de ventana móvil. Úsala siempre que se vaya a tocar src/sim/engine.ts o src/sim/physics.ts; cuando haya que responder "¿por qué la arcilla nunca se deposita?", "¿por qué el remanso atrapa sedimento?", "¿este resultado es correcto?"; cuando haya que cambiar un parámetro de grano, del remanso, de la mezcla o de la tasa de aporte; o cuando haya que saber qué valores son de literatura y cuáles son pedagógicos antes de ajustarlos.
---

# El modelo del río de EFC

Instancia concreta de `fisica-transporte-sedimentos` en el simulador. Todo lo que está aquí
está verificado contra el código real de `src/sim/`. **Si el código cambia, esta skill se
actualiza en el mismo commit.**

## Qué representa el modelo

Un tramo recto de río de 100 m visto de perfil, con partículas lagrangianas individuales.
El usuario fija la velocidad media aguas arriba y observa cuántas partículas llegan al final y
cuántas se depositan antes. No es un modelo predictivo de un río real: es un modelo
mecanísticamente honesto cuyo propósito es que se vea *por qué* pasa lo que pasa.

## Geometría y discretización

| Constante | Valor | Significado |
|---|---|---|
| `RIVER_LENGTH` | 100 m | Largo del tramo |
| `NX` | 400 | Celdas del campo hidráulico → 0.25 m/celda |
| `N_BINS` | 50 | Bins del histograma de depósito → 2 m/bin |
| `POOL_START` / `POOL_END` | 0.5 / 0.7 | Remanso entre 50 m y 70 m |
| `ramp` | 0.08 | 8 m de transición suave a cada lado del remanso |
| `ENTRY_BUFFER` | 10 m | Zona donde no se permite depositar |

La transición de profundidad en los bordes del remanso usa `smootherstep` (6t⁵−15t⁴+10t³,
Perlin). Es **suavizado geométrico, no física de flujo**: evita un pico artificial en `dh/dx`
y por tanto en `dτ/dx` en 50 m y 70 m, que produciría una barra de depósito espuria justo en
el borde. No confundirlo con un remanso hidráulicamente calculado (no hay curva de remanso
M1/M2 resuelta; la geometría se impone).

## Campo hidráulico

Se recalcula entero (`updateHydraulics()`) en `setParams()`, en `reset()` y al inicio de cada
`step()` si el lecho cambió desde el paso anterior (400 celdas, barato), nunca por partícula.

```
q = velocity · depth                        // caudal por unidad de ancho, constante en x
h₀(x) = depth · (1 + (poolFactor − 1)·w(x))  // geometría base; w = 0 fuera del remanso, 1 dentro
h(x) = max(h₀(x) − η(x), h_min)              // η = espesor del depósito (Exner), h_min = 0.1·depth
U(x) = q / h(x)                              // continuidad
u*(x) = U(x)·κ / max(ln(h/z₀) − 1, 0.5)      // ley de la pared
τ(x) = ρ_w · u*(x)²
```

**El mecanismo central del proyecto está en estas cuatro líneas.** En el remanso `h` sube, por
continuidad `U` baja, `u*` baja, y `τ ∝ u*²` baja *más* que proporcionalmente. El remanso es
una trampa de sedimento por continuidad, no porque se le haya programado que atrape.

## Lecho evolutivo (Exner) — desde sept. 2026

Cada partícula es una parcela de volumen fijo. Depositarse suma `BED_DZ_PER_PARTICLE = 0.005 m`
al espesor `η` de su bin (2 m); resuspenderse lo resta: `∂η/∂t = (D − E)·V/(Δx(1−λ))`, con el
volumen de parcela y la porosidad absorbidos en esa constante. `η` se interpola linealmente
entre centros de bin para obtener `h(x)` por celda (evita escalones de τ cada 2 m).

Consecuencia: un depósito reduce `h`, sube `U` y `τ`, y deja de crecer cuando `τ ≈ τ_ce`. A
partir de ahí el frente de la barra **prograda** aguas abajo (delta). Altura de equilibrio
analítica: la `h_eq` que cumple `q = h_eq·(u*c/κ)(ln(h_eq/z₀) − 1)` con `u*c = √(τ_ce/ρ)`; p.ej.
grava con `q = 6 m²/s` → `h_eq ≈ 5.7 m` (verificado en simulación).

- **Ángulo de reposo** (`REPOSE_TAN = tan 32°`): si la cota del lecho (`η − h₀`) de un bin supera
  a la de un vecino en más de `Δx·tanφ`, sus parcelas avalanchan a ese vecino (cara de avalancha
  del delta). No se avalancha hacia la zona de entrada.
- **Lámina mínima** (`MIN_WATER_FRACTION = 0.1`): un bin con `η ≥ h₀ − 0.1·depth` no acepta más
  depósito; el sedimento pasa por encima como carga de fondo.
- `BED_DZ_PER_PARTICLE` es un **factor de aceleración morfológica** (morfac, Roelvink 2006):
  la concentración implícita es muy superior a la de un río real para que el remanso se colmate
  en minutos de simulación y no en años. Es pedagógico; lo físico es el mecanismo, no la escala
  de tiempo.

`max(..., 0.5)` es un guardarraíl numérico: evita división por cero o `u*` absurdo cuando
`h → z₀` (profundidades menores a ~3 mm). No tiene significado físico; solo impide que la
simulación explote en un extremo del slider que igual no es realista.

## Las cinco clases de grano

Valores calculados con las fórmulas de `physics.ts` a **h = 1 m, z₀ = 0.001 m**:

| Clase | d | D\* | w_s | θ_cr | τ_ce (Pa) | τ_cd (Pa) | U_erosión | U_deposición |
|---|---|---|---|---|---|---|---|---|
| Arcilla | 2 µm | 0.051 | 0.0033 mm/s | 0.283 | 1.000 ᴾ | 0.300 ᴾ | 0.456 m/s | 0.250 m/s |
| Limo | 20 µm | 0.506 | 0.328 mm/s | 0.187 | 0.300 ᴾ | 0.090 ᴾ | 0.250 m/s | 0.137 m/s |
| Arena fina | 125 µm | 3.16 | 11.94 mm/s | 0.066 | 0.133 | 0.133 | 0.166 m/s | 0.166 m/s |
| Arena media | 500 µm | 12.65 | 73.72 mm/s | 0.031 | 0.250 | 0.250 | 0.228 m/s | 0.228 m/s |
| Grava | 4 mm | 101.2 | 258.0 mm/s | 0.050 | 3.249 | 3.249 | 0.821 m/s | 0.821 m/s |

ᴾ = valor pedagógico documentado (ver §"Qué es pedagógico"). El resto sale de Soulsby (1997)
y Soulsby & Whitehouse (1997).

Mezcla por defecto: arcilla 15 %, limo 20 %, arena fina 30 %, arena media 25 %, grava 10 %.

**Lectura de la tabla — esto es lo que hay que poder explicar en la expo:**

- El **mínimo de `U_erosión` está en arena fina (0.166 m/s)**, no en arcilla ni en grava. Ése
  es el mínimo de Hjulström reproducido por el modelo, y es el resultado contraintuitivo que
  vale la pena mostrar: *lo más fino no es lo más fácil de mover*.
- Arcilla y limo tienen `τ_cd < τ_ce` (factor 0.3): una vez levantados, hace falta bajar mucho
  más la velocidad para que vuelvan a depositarse. Es la histéresis de Krone/Partheniades.
- Arenas y grava tienen `τ_cd = τ_ce` (no cohesivas, `depFactor = 1`): sin histéresis.
- `w_s` de la arcilla es 0.0033 mm/s: recorrer 1 m de columna de agua le toma ~84 horas. En un
  tramo de 100 m que se atraviesa en minutos, **la arcilla jamás sedimenta por caída**. Sólo
  se "deposita" por la regla de contacto con el lecho cuando `τ < τ_cd`.

## Números de Rouse del modelo (h = 1 m)

| U | u\* | τ (Pa) | Arcilla | Limo | Arena fina | Arena media | Grava |
|---|---|---|---|---|---|---|---|
| 0.2 | 0.0139 | 0.19 | 0.00 | 0.06 | 2.10 | 12.95 | 45.3 |
| 0.6 | 0.0416 | 1.73 | 0.00 | 0.02 | 0.70 | 4.32 | 15.1 |
| 1.2 | 0.0833 | 6.94 | 0.00 | 0.01 | 0.35 | 2.16 | 7.56 |
| 2.0 | 0.1388 | 19.3 | 0.00 | 0.01 | 0.21 | 1.30 | 4.53 |

Arcilla y limo son **carga de lavado (P < 0.8) en todo el rango de la app**. La grava es
**carga de fondo (P > 2.5) en todo el rango**. La transición interesante ocurre en arena
fina y arena media entre 0.2 y 1.2 m/s — es ahí donde el slider produce el cambio didáctico
que el proyecto quiere mostrar, y por eso ese rango debe quedar bien cubierto por los
experimentos guiados.

## Reglas por partícula (`engine.step`)

Estado de cada partícula: `FREE` (slot libre) / `SUSPENDED` / `DEPOSITED`.
Posición: `x` en metros, `s = z/h` en coordenada sigma ∈ [0,1].

**Inyección.** `feedRate` partículas/s, acumulador fraccionario, clase sorteada por CDF de la
mezcla, `x = 0`, `s = 0.02 + 0.96·rand()` (**uniforme en la vertical**). No se inyecta con
perfil de Rouse de equilibrio: la nube tarda un tiempo de mezcla `~h/(κu*)` en desarrollarlo.
Ésa es la razón de `ENTRY_BUFFER`.

**Altura de referencia del lecho.** `z_b = 0.02·h`. Es la altura donde se considera que hay
"contacto" con el lecho. Valor pedagógico/ingenieril; en la literatura la altura de referencia
de van Rijn es del orden de `k_s` o `0.01·h`.

**Deposición** (al tocar `z < z_b`, y sólo si `x ≥ ENTRY_BUFFER`):

    p_dep = 1 − τ/τ_cd        (si τ < τ_cd; si no, 0)

Probabilidad por evento de contacto, no por segundo. Si no se deposita, rebota: sube a
`z_b + lift`.

**Resuspensión** (partícula `DEPOSITED`, por paso de tiempo):

    ex = τ/τ_ce
    p_res = min(1, E₀·(ex − 1)) · dt      con E₀ = 0.2 s⁻¹, sólo si ex > 1

Es la forma de Partheniades (tasa proporcional al exceso de esfuerzo). `E₀ = 0.2 s⁻¹` es
**valor pedagógico**: fija cuán rápido "revive" un depósito cuando sube la velocidad. Subirlo
hace la respuesta a una crecida más inmediata; bajarlo deja rastros históricos más largos.

**Levantamiento tras erosión o rebote.**

    lift = min(0.3·h, h·0.03·√(ex − 1)·rand())

Valor pedagógico: reparte las partículas recién levantadas cerca del lecho en vez de teletrans-
portarlas a media columna. No corresponde a una fórmula publicada.

**Salida.** `x ≥ 100 m` → `state = FREE`, `exited[clase]++`. El slot se recicla.

**Saturación.** Si no hay slot libre, `saturated = true`. Es una **señal de que las métricas
dejaron de ser confiables** (se está perdiendo aporte), no un detalle cosmético: si aparece,
hay que subir `capacity` o bajar `feedRate` antes de sacar conclusiones físicas.

## Zona de entrada (`ENTRY_BUFFER = 10 m`)

Sin ella, una partícula inyectada cerca del lecho con `s ≈ 0.02` puede depositarse en el primer
paso de tiempo, antes de que el perfil vertical se desarrolle. Eso contaminaría el conteo de
depósito con un **artefacto numérico de borde** en vez de física de transporte. 10 m cubre
varios tiempos de mezcla vertical `h/(κu*)` a las velocidades de la app. Valor
pedagógico/ingenieril, no de literatura.

**Consecuencia que hay que recordar al interpretar el histograma:** los primeros 5 bins
(0–10 m) siempre están vacíos por construcción. No es que ahí no se deposite: es que ahí no
se *deja* depositar.

## Contrato de métricas: `SimStats` vs `WindowStats`

- **`SimStats`** son contadores **acumulados desde t = 0**. Dependen de cuánto lleva corriendo
  la simulación. Sirven para el balance de masa, **no** para comparar regímenes.
- **`WindowStats`** son **tasas sobre una ventana móvil** de los últimos N segundos. Reflejan el
  régimen actual y sí son comparables entre corridas de distinta duración. Es el contrato que
  consume la UI de resultados.

`transportCapacity = salida/aporte` en la ventana: ≈1 es estacionario, <1 el tramo retiene,
>1 el tramo libera un remanente acumulado antes. Si no hubo aporte se define 0 (no NaN).

**`actualWindowSeconds` puede ser menor que `requestedWindowSeconds`** si la simulación lleva
poco tiempo o si el historial acotado ya no retiene una muestra tan antigua. La UI debe
mostrarlo o avisar; nunca asumir que la ventana pedida se cumplió. Historial por defecto:
muestra cada 0.2 s, máximo 3000 muestras ≈ 10 min de simulación.

## Invariante de masa

En todo momento y por clase:

    injected[c] = exited[c] + deposited[c] + suspended[c]

Debe verificarse en tests y tras cualquier cambio en `step()`. Si se rompe, el bug está casi
siempre en: (a) `deposited[c]--` sin el `depositBins--` correspondiente en la resuspensión,
(b) un `continue` que salta la contabilidad, o (c) reciclado de slot sin contar la salida.

## Qué es pedagógico y qué es literatura

**Literatura (no tocar sin cambiar la fuente):** `D*`, `w_s`, `θ_cr`, la ley de la pared,
`τ = ρu*²`, `P = w_s/(κu*)`, continuidad `q = Uh`.

**Convención de textos (ajustable, documentar):** umbrales de Rouse 2.5 / 1.2 / 0.8.

**Valor pedagógico documentado (ajustable con criterio, hay que decir que lo es):**

| Parámetro | Valor | Qué controla |
|---|---|---|
| `tauCohesion` arcilla / limo | 1.0 / 0.3 Pa | Altura de la rama izquierda de Hjulström |
| `depFactor` cohesivos | 0.3 | Ancho de la banda de histéresis |
| `E₀` | 0.2 s⁻¹ | Velocidad de respuesta de un depósito a una crecida |
| `ENTRY_BUFFER` | 10 m | Cuánto del tramo se sacrifica al artefacto de entrada |
| `z_b` | 0.02·h | Qué cuenta como "tocar el lecho" |
| `lift` | 0.03·h·√(ex−1) | Altura típica tras levantarse |
| `Z0` | 0.001 m | **La perilla más influyente**: desplaza *todas* las velocidades críticas |
| `cohesionLevel()` | interpolación log-lineal | Forma continua de la curva de Hjulström dibujada |
| `BED_DZ_PER_PARTICLE` | 0.005 m | Velocidad de colmatación (aceleración morfológica) |
| `REPOSE_TAN` | tan 32° | Pendiente máxima de la cara de una barra (literatura: 30–35° sumergido) |
| `MIN_WATER_FRACTION` | 0.1 | Lámina de agua mínima sobre un depósito colmatado |

## Desviaciones conocidas respecto a la literatura

1. **El mínimo de la curva de Hjulström del modelo cae en d ≈ 0.067 mm con U ≈ 0.151 m/s**
   (calculado a h = 1 m barriendo `makeCurveClass`). La curva clásica lo pone en 0.1–0.5 mm y
   ~0.2 m/s. El modelo está desplazado hacia grano más fino y velocidad algo menor. Las
   perillas para corregirlo, si alguna vez se quiere, son `Z0` (sube todas las velocidades
   críticas) y la interpolación de `cohesionLevel()` (mueve la posición del mínimo). **No
   corregirlo sin pedirlo:** la forma cualitativa —que es lo que se enseña— ya es correcta, y
   la curva clásica tampoco es universal (depende de `h` y `z₀`).
2. **Sin floculación.** Las arcillas se tratan como granos individuales de 2 µm. En un río real
   con sales o materia orgánica flocularían y sedimentarían mucho más. Es la respuesta honesta
   a "¿por qué la arcilla nunca se deposita?": *en este modelo* no flocula.
3. **Lecho evolutivo simplificado.** Desde sept. 2026 el depósito sí realimenta la hidráulica
   (Exner + ángulo de reposo, ver §"Lecho evolutivo"), lo que corrigió la acumulación
   "infinita" de grava en un solo bin (remanso profundo `velocity=2, depth=3, poolFactor=3.8`, y
   el pico en x=10 m a velocidad baja). Sigue sin haber acorazamiento, formas de fondo ni cambio
   de `z₀`; la escala de tiempo morfológica está acelerada (ver morfac arriba); cada parcela
   depositada puede resuspenderse aunque esté enterrada (no hay capas).
4. **Sin curva de remanso resuelta.** La geometría del remanso se impone; no sale de resolver
   flujo gradualmente variado.
5. **2D vertical (x, z).** No hay ancho ni flujo secundario ni meandros.

Estas cinco son **limitaciones legítimas y declarables**, no bugs. Ante una pregunta del tipo
"pero en un río real…", la respuesta correcta es nombrar la limitación, no cambiar el modelo.

## Rangos de parámetros con sentido físico

| Parámetro | Rango sensato | Por qué |
|---|---|---|
| `velocity` | 0.1 – 2.0 m/s | Bajo 0.1 no hay transporte visible; sobre 2.0 todo sale y la lección se pierde |
| `depth` | 0.3 – 3 m | Bajo ~0.3 m la ley de la pared con `z₀=1 mm` pierde validez (pocas rugosidades) |
| `poolFactor` | 1.0 – 4.0 | 1 = sin remanso; sobre ~4 el remanso es un lago y `U` cae al ruido |
| `poolFactor` × `depth` altos juntos (p.ej. `poolFactor≥3` con `depth≥2`, `h_remanso≥6 m`) | válido, tarda | El remanso se colmata hasta `h_eq` de la grava; con pocos miles de parcelas puede aparecer `saturated` antes de llenarse |
| `feedRate` | 5 – 200 part/s | Sobre `capacity/tiempo_de_tránsito` aparece `saturated` |
| `mix` | suma > 0 | Si suma 0 no se inyecta nada (comportamiento definido, no error) |

## Preguntas frecuentes de la expo, con la respuesta física correcta

- *¿Por qué al bajar la velocidad se deposita más?* → `τ ∝ U²` baja; cuando `τ < τ_cd` de una
  clase, esa clase empieza a depositarse al tocar el lecho. Es un umbral por clase, no un
  continuo: el gráfico de depósito por clase muestra las clases "apagándose" una a una.
- *¿Por qué se deposita justo en el remanso?* → Continuidad: `h` sube ⇒ `U = q/h` baja ⇒ `u*`
  baja ⇒ `τ = ρu*²` baja al cuadrado. El remanso no atrae sedimento; deja de poder cargarlo.
- *¿Por qué la grava no llega al final?* → `P > 2.5` en todo el rango: es carga de fondo,
  avanza pegada al lecho donde `u(z)` es mínima, y tiene `τ_ce = 3.2 Pa`, que sólo se supera
  sobre ~0.82 m/s.
- *¿Por qué la arcilla llega toda?* → `w_s = 0.0033 mm/s`, `P ≈ 0`: carga de lavado. Además no
  flocula en este modelo.
- *¿Por qué al subir la velocidad de golpe sale más de lo que entra?* → Resuspensión: el tramo
  libera el depósito acumulado antes. Se ve como `transportCapacity > 1` en la ventana móvil.
  Es física real (histéresis), no un bug.
- *¿Por qué la barra de grava deja de crecer hacia arriba y empieza a avanzar?* → El depósito
  sube el lecho, la sección se achica, por continuidad el agua se acelera y `τ` sobre la barra
  vuelve a `τ_ce`: ahí ya no se deposita más encima, y la grava que llega se deposita en el
  frente, que avanza aguas abajo. Es cómo crece un delta en la cabecera de un embalse.

## Skills relacionadas

- `fisica-transporte-sedimentos` — de dónde salen las fórmulas y cómo defenderlas.
- `calibracion-numerica-lagrangiana` — antes de cambiar un parámetro físico porque "el
  resultado se ve mal", descartar que sea un artefacto numérico.
