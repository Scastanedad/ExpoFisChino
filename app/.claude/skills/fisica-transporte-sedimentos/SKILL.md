---
name: fisica-transporte-sedimentos
description: Marco teórico del transporte de sedimentos en ríos — perfil logarítmico y velocidad de corte, esfuerzo cortante, curva de Shields y su ajuste de Soulsby-Whitehouse, velocidad de caída, número de Rouse y modos de transporte, curva de Hjulström, y sedimento cohesivo (Krone/Partheniades). Úsala siempre que haya que elegir, revisar, derivar o justificar una fórmula o constante de física de sedimentos; cuando aparezcan los términos tau, tau crítico, Shields, Rouse, Hjulström, Soulsby, van Rijn, velocidad de caída, velocidad de corte, u*, D*, carga de fondo, suspensión, carga de lavado, floculación o cohesión; cuando haya que decidir si un número viene de la literatura o es un valor pedagógico; o cuando un resultado de la simulación "se ve raro" y hay que saber si la física predice eso.
---

# Física del transporte de sedimentos (teoría)

Esta skill es el **marco de referencia teórico**. Dice qué es verdad en la literatura y con qué
fuente se defiende. No describe el modelo concreto de EFC (eso es `modelo-rio-efc`) ni cómo
integrarlo numéricamente (eso es `calibracion-numerica-lagrangiana`).

## Regla de oro

Cada número que entre al código pertenece a exactamente una de tres categorías, y hay que
declararla explícitamente en el comentario del código y en el informe:

1. **Constante física** — universal y medida (g, ρ, ν, κ). No se ajusta nunca.
2. **Fórmula de literatura** — ajuste empírico publicado (Soulsby, Shields, Rouse). Se cita
   autor, año y obra; se valida contra un caso tabulado antes de confiar en ella.
3. **Valor pedagógico documentado** — elegido para que la demostración enseñe lo correcto,
   sin respaldo de un dataset específico. Se marca con esas palabras exactas, se explica el
   criterio de elección y se dice qué habría que medir para reemplazarlo.

Nunca presentar un valor de la categoría 3 como si fuera de la 2. Si la búsqueda web no
encuentra respaldo, la respuesta correcta es "valor pedagógico", no inventar una cita.

## 1. Hidráulica del flujo: del caudal al esfuerzo sobre el lecho

Toda la cadena causal del transporte empieza aquí. Un cambio en la velocidad del río **no**
actúa sobre el grano directamente: actúa sobre `u*`, que fija `τ`, que se compara contra `τc`.

**Perfil logarítmico (ley de la pared).** En flujo turbulento sobre lecho rugoso la velocidad
a altura `z` sobre el lecho es

    u(z) = (u*/κ) · ln(z/z₀)

con `κ = 0.41` (constante de von Kármán) y `z₀` la altura de rugosidad. Para lecho plano de
granos sueltos, la aproximación estándar es `z₀ ≈ k_s/30` con `k_s ≈ 2–3·d₉₀`; para un lecho
natural con formas de fondo (rizaduras, dunas) `z₀` es órdenes de magnitud mayor, típicamente
`10⁻³–10⁻² m`. **`z₀` es la perilla más influyente y menos observable del modelo**: cambiarla
mueve todas las velocidades críticas sin tocar ninguna fórmula de grano.

**Velocidad media promediada en profundidad.** Integrando el perfil de 0 a `h`:

    U = (u*/κ) · [ln(h/z₀) − 1]     ⟺     u* = U·κ / [ln(h/z₀) − 1]

Esta es la relación que convierte el control del usuario (`U`, una velocidad media observable)
en la variable física que manda (`u*`). El `−1` viene de la integral del logaritmo; omitirlo
es un error común que sobreestima `u*` en ~20 %.

**Esfuerzo cortante del lecho.**

    τ = ρ_w · u*²        [Pa]

Consecuencia importante para la intuición: `τ ∝ U²`. Duplicar la velocidad del río cuadruplica
el esfuerzo. Por eso la respuesta de la simulación al slider es fuertemente no lineal y por eso
un rango lineal de velocidades da una progresión visualmente "explosiva" de transporte.

**Continuidad.** Para un caudal por unidad de ancho `q = U·h` constante, un ensanchamiento o
profundización local (un remanso) **reduce** `U` porque `U = q/h`, y por tanto reduce `u*` y `τ`
más que proporcionalmente. Ése es el mecanismo físico por el que los remansos son trampas de
sedimento.

## 2. Tamaño adimensional y velocidad de caída

**Diámetro adimensional D\*** — Soulsby (1997), *Dynamics of Marine Sands*, Thomas Telford:

    D* = [ g(s−1) / ν² ]^(1/3) · d       con s = ρ_s/ρ_w ≈ 2.65

Es la variable natural del problema: agrupa gravedad, densidad relativa, viscosidad y tamaño.
Casi todas las fórmulas modernas se escriben en función de `D*` en vez de `d`.

**Velocidad de caída w_s** — fórmula de ajuste de Soulsby (1997), válida para granos naturales
en todo el rango (ley de Stokes en el límite fino, régimen inercial en el grueso):

    w_s = (ν/d) · [ √(10.36² + 1.049·D*³) − 10.36 ]

**Caso de validación obligatorio:** arena de 0.25 mm en agua a 20 °C debe dar
`w_s ≈ 33–39 mm/s`. Si una implementación no reproduce ese valor, está mal.

Límites que conviene tener en la cabeza:
- Stokes (`D* ≲ 1`, d ≲ 100 µm): `w_s ∝ d²`. Bajar el grano un factor 10 baja `w_s` un factor 100.
- Inercial (`D* ≳ 100`, grava): `w_s ∝ √d`.
Esa diferencia de pendiente es la razón física de que arcilla y limo prácticamente no sedimenten
en un tramo corto de río, mientras la grava cae casi instantáneamente.

## 3. Umbral de movimiento: Shields

El parámetro de Shields adimensionaliza el esfuerzo contra el peso sumergido del grano:

    θ = τ / [ (ρ_s − ρ_w)·g·d ]

El movimiento empieza cuando `θ > θ_cr`. La curva original de Shields (1936) es gráfica; para
código se usa el **ajuste de Soulsby & Whitehouse (1997)**:

    θ_cr = 0.3/(1 + 1.2·D*) + 0.055·[1 − exp(−0.02·D*)]

Comportamiento a verificar en cualquier implementación:
- `D* → ∞` (grava gruesa): `θ_cr → 0.055`, la meseta clásica de Shields (la literatura usa
  0.045–0.06 según el criterio de "inicio de movimiento"; 0.055 está dentro del rango).
- `D* → 0` (limo, arcilla): `θ_cr → 0.3` y crece; pero **ojo**: en este límite Shields ya no
  describe la física real, porque domina la cohesión, no el peso del grano. Ver §5.
- El mínimo de `θ_cr` está alrededor de `D* ≈ 10` (arena media), lo que corresponde al mínimo
  de la curva de Hjulström.

Y de vuelta a unidades físicas:

    τ_ce = θ_cr · (ρ_s − ρ_w)·g·d        [Pa]

## 4. Modo de transporte: número de Rouse

Una vez que el grano se mueve, `P` decide **cómo** se mueve: es la razón entre la tendencia a
caer (`w_s`) y la capacidad de la turbulencia de mantenerlo arriba (`κ·u*`).

    P = w_s / (κ · u*)                   (Rouse 1937)

| P | Modo | Qué se ve |
|---|------|-----------|
| > 2.5 | Carga de fondo | Rueda/salta pegado al lecho; avanza mucho más lento que el agua |
| 1.2 – 2.5 | Suspensión parcial | Nube concentrada en la mitad inferior de la columna |
| 0.8 – 1.2 | Suspensión total | Ocupa toda la columna con gradiente suave |
| < 0.8 | Carga de lavado | Prácticamente uniforme; atraviesa el tramo sin depositarse |

Los umbrales 2.5 / 1.2 / 0.8 son convención de textos de hidráulica fluvial (van Rijn); no son
constantes físicas, así que son legítimamente ajustables — pero se documentan como convención.

**Perfil de Rouse** (concentración de equilibrio en suspensión, referencia a altura `z_a`):

    c(z)/c(z_a) = [ (h−z)/z · z_a/(h−z_a) ]^P

Sirve como **caso de validación analítico**: una simulación lagrangiana correcta, corrida hasta
equilibrio con `u*` uniforme, debe reproducir este perfil. Si no lo hace, el problema es
numérico (ver `calibracion-numerica-lagrangiana`), no físico.

## 5. Sedimento cohesivo: donde Shields deja de servir

Por debajo de ~63 µm (limo y arcilla) las fuerzas electroquímicas entre partículas superan el
peso propio. Consecuencias:

- **`τ_ce` deja de bajar con `d` y empieza a subir.** Un lecho de arcilla consolidada resiste
  más que la arena. Éste es el brazo izquierdo ascendente de la curva de Hjulström.
- **No existe fórmula cerrada universal para `τ_ce` cohesivo.** Depende de densidad seca,
  grado de consolidación, mineralogía, contenido de materia orgánica y biofilm. La referencia
  estándar (Whitehouse, Soulsby, Roberts & Mitchener 2000, *Dynamics of Estuarine Muds*) da
  correlaciones `τ_ce = f(densidad seca)`, no un número. Los valores reportados en la
  literatura caen aproximadamente en **0.1 Pa < τ_ce < 5 Pa**
  (Zhu et al. 2021, *Frontiers in Marine Science*, doi:10.3389/fmars.2021.713039).
  → Cualquier valor único que se use es **pedagógico**, y así debe marcarse.
- **Histéresis erosión/deposición (Krone/Partheniades).** El esfuerzo bajo el cual una
  partícula cohesiva se deposita es *menor* que el que hace falta para re-erosionarla:
  `τ_cd < τ_ce` siempre. Modelo de Krone (deposición): tasa `∝ (1 − τ/τ_cd)` para `τ < τ_cd`;
  modelo de Partheniades (erosión): tasa `∝ (τ/τ_ce − 1)` para `τ > τ_ce`. Entre ambos umbrales
  no pasa nada: el sedimento ni se deposita ni se levanta. Esa banda muerta es física real y es
  lo que hace que un río "recuerde" su crecida anterior.
- La razón `τ_cd/τ_ce` típica es de orden 0.1–0.5; el valor exacto es pedagógico salvo que se
  mida.
- **Floculación:** en agua con sales o materia orgánica, las arcillas se agregan en flóculos de
  10–1000 µm con `w_s` efectiva 1–3 órdenes de magnitud mayor que la del grano individual.
  Si un modelo no incluye floculación, sus arcillas nunca sedimentarán — y eso es correcto
  *dentro del modelo*, pero hay que decirlo cuando alguien pregunte "¿por qué la arcilla nunca
  se deposita?".

## 6. Curva de Hjulström: la síntesis pedagógica

Hjulström (1935) grafica, contra el tamaño de grano, dos velocidades medias del flujo:
la **velocidad crítica de erosión** (arranca el grano del lecho) y la **velocidad crítica de
deposición** (por debajo, el grano en suspensión cae). Entre ambas está la zona de transporte.

Forma cualitativa que cualquier modelo decente debe reproducir:

- **Rama izquierda ascendente** (arcilla, limo fino): erosión más difícil cuanto más fino,
  por cohesión.
- **Mínimo en arena fina/media**, alrededor de 0.1–0.5 mm, con velocidad crítica de erosión de
  orden **0.2 m/s**. Es el grano más fácil de mover del planeta.
- **Rama derecha ascendente** (arena gruesa, grava): erosión más difícil cuanto más grueso,
  por peso.
- **Curva de deposición siempre por debajo** de la de erosión, y monótonamente decreciente al
  bajar el tamaño (porque sigue a `w_s`). El hueco entre ambas es enorme en el lado fino: un
  limo que se logró poner en suspensión viaja kilómetros.

Advertencias al usarla: la curva original es para un canal de laboratorio de ~1 m de
profundidad y lecho de sedimento uniforme, suelto y no consolidado. La velocidad media no es
una variable física fundamental (lo es `τ`), así que **una curva de Hjulström siempre depende
de la profundidad y de `z₀` supuestos**. Al graficarla desde un modelo hay que decir para qué
`h` y qué `z₀` se dibujó.

## 7. Protocolo de verificación física

Antes de aceptar cualquier cambio en las fórmulas:

1. **Análisis dimensional.** Cada término de cada ecuación en unidades SI. Un `τ` en Pa que
   salga de dividir por `d` en mm es el error más frecuente.
2. **Casos tabulados.** `w_s(0.25 mm) ≈ 36 mm/s`; `θ_cr` asintótico `≈ 0.055`;
   `D*(0.25 mm) ≈ 6.3`. Estos tres deben estar en los tests unitarios de forma permanente.
3. **Límites asintóticos.** Comprobar Stokes (`w_s ∝ d²`) e inercial (`w_s ∝ √d`) con dos
   puntos alejados en la escala.
4. **Monotonía y orden.** `τ_ce(arcilla) > τ_ce(limo) > τ_ce(arena fina)` y
   `τ_ce(grava) > τ_ce(arena media)`. `τ_cd ≤ τ_ce` para toda clase.
5. **Orden de magnitud contra la intuición del campo.** Un río de montaña tiene
   `u* ~ 0.1 m/s` y `τ ~ 10 Pa`; un río de llanura lento, `u* ~ 0.01 m/s` y `τ ~ 0.1 Pa`.
   Un `τ` de 1000 Pa en un río de 1 m/s significa que hay un error.
6. **Buscar en la web antes de afirmar.** Si se introduce una fórmula o constante nueva, se
   busca la fuente primaria, se cita en el comentario del código (autor, año, obra, DOI o URL)
   y se reproduce un valor tabulado en un test. Si no se encuentra respaldo: valor pedagógico.

## Fuentes de referencia

- Shields, A. (1936) — umbral de movimiento; curva original.
- Rouse, H. (1937) — perfil de concentración en suspensión, número de Rouse.
- Hjulström, F. (1935) — curva erosión/transporte/deposición.
- Soulsby, R. (1997) *Dynamics of Marine Sands*, Thomas Telford — `D*`, `w_s`, y (con
  Whitehouse) el ajuste de `θ_cr`. Fuente principal para fórmulas cerradas implementables.
- van Rijn, L. (1993) *Principles of Sediment Transport in Rivers, Estuaries and Coastal Seas*
  — umbrales de Rouse, rugosidad, formas de fondo.
- Whitehouse, Soulsby, Roberts & Mitchener (2000) *Dynamics of Estuarine Muds* — cohesivos.
- Mehta & Partheniades (1982); Krone — erosión/deposición de barros, histéresis.
- Zhu et al. (2021) *Frontiers in Marine Science*, doi:10.3389/fmars.2021.713039 — revisión de
  rangos reportados de `τ_ce` para mezclas arena-barro.

## Skills relacionadas

- `modelo-rio-efc` — cómo se instancia todo esto en el simulador concreto, con los valores
  numéricos ya calibrados y sus rangos válidos.
- `calibracion-numerica-lagrangiana` — cómo integrarlo sin que el método numérico contamine
  la física.
