---
tipo: referencia
última-actualización: 2026-09-20
---

# Tech Stack — ExpoFisChino

Decisiones en [[../00-Proyecto/decisiones]]; estructura en [[../00-Proyecto/arquitectura]].

## Lenguajes
- TypeScript (estricto)

## Frameworks
- React 18 + Vite 5 (`@vitejs/plugin-react`)
- Canvas 2D para la simulación; SVG hecho a mano para Hjulström y depósito (sin librerías de gráficos)
- Simulación con `Float32Array` fuera del estado de React (skill `arquitectura-simulaciones-web`)
- Vitest 2 para pruebas
- `playwright-core` como devDependency (frontend-expert, Fase 2) solo para tomar capturas de verificación visual (1920×1080/1280×800/390×844); no instala navegadores nuevos ni se usa en producción

## Base de Datos
- Ninguna

## Deploy
- Vercel (sitio estático Vite). `vercel.json` incluido: `Cache-Control: public, max-age=31536000, immutable` para `/assets/(.*)`.
- Repo remoto: https://github.com/Scastanedad/ExpoFisChino.git (`origin`, rama `main`) — ya existía, no pendiente. Ver [[../01-Referencias/urls]].
- Proyecto en Vercel: **vinculado** (`dev-ia2/app`, 2026-09-20). Deploy y prueba de humo hechos (Fase 4, V2/V3) — Vercel marcó el deploy como "production" automáticamente por ser el primero del proyecto (decisión pendiente del usuario sobre esa etiqueta). V4 (producción explícita) no ejecutado. Ver [[../01-Referencias/urls]], [[../00-Proyecto/roadmap]] y [[../04-Sync/sesion-actual]].

## Herramientas CLI
- Node **pineado a 22.x** vía `.nvmrc` y `engines.node` en `package.json` (decisión de `vercel-deploy-expert`, por compatibilidad conocida con Vercel) — **pendiente de confirmación del usuario**.
- Entorno local real detectado: Node 24.19.0 / npm 11.17.0 (discrepancia con el pin de 22.x; la bóveda decía antes "Node 22 + npm 10", tampoco exacto). Ver [[../00-Proyecto/decisiones]].
- **`skills.sh` CLI (`npx skills`)** — gestor de "agent skills" externos para los subagentes de Claude Code (infraestructura, no dependencia de la app). Instala skills de proyecto en `.claude/skills/` (symlinks a `.agents/skills/`, contenido descargado no versionado vía `.gitignore`), con `skills-lock.json` como lockfile reproducible (sí versionado). Ver decisión completa en [[../00-Proyecto/decisiones]].
  - `frontend-design` (repo `anthropics/skills`, oficial) → `frontend-expert`
  - `design-taste-frontend` (repo `leonxlnx/taste-skill`, v2) → `frontend-expert`
  - `design-taste-frontend-v1` (repo `leonxlnx/taste-skill`, v1) → `frontend-expert`
  - `find-skills` (repo `vercel-labs/skills`, oficial) → sesión/orquestador
  - `deploy-to-vercel` (repo `vercel-labs/agent-skills`, oficial) → `vercel-deploy-expert`
  - `wcag-accessibility-audit` (repo `mastepanoski/claude-skills`) → `uiux-reviewer`
- **Skills propias del proyecto (locales, sin entrada en `skills-lock.json`)** → `backend-expert`, ahora confirmadas activas como symlinks en `.claude/skills/` (contenido en `.agents/skills/`): `fisica-transporte-sedimentos`, `modelo-rio-efc`, `calibracion-numerica-lagrangiana`. Ver [[../01-Referencias/glosario]] y [[../00-Proyecto/decisiones]]. Con los 6 externos suman 9 skills instalados en total en el proyecto.

## Configuraciones Importantes
- ENV vars clave: ninguna. `.gitignore` incluye `.env`, `.env.*`, `!.env.example`.
- Puertos por defecto: Vite dev 5173, preview 4173
- Entorno: Windows (`D:\Proyectos\ExpoFisChino\app`)
- `index.html` `<head>`: título, meta description (ES), Open Graph básico, `<link rel="icon" href="/favicon.ico">` (archivo del ícono aún no creado, pendiente de `frontend-expert`)
