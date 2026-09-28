---
tipo: referencia
última-actualización: 2026-09-20
---

# Comandos — ExpoFisChino

Todos desde `D:\Proyectos\ExpoFisChino\app`.

## Setup
- `npm install`

## Desarrollo
- `npm run dev` — servidor de desarrollo (http://localhost:5173)

## Build / Deploy
- `npm run build` — tipado (`tsc --noEmit`) + build de producción en `dist/`
- `npm run preview` — sirve `dist/` (http://localhost:4173)
- Deploy: ver [[../03-Activos/prompt-inicial-claude-code]] (subagente `vercel-deploy-expert`)

## Tests
- `npm test` — Vitest (entorno jsdom): física/motor (`src/sim/sim.test.ts`) + componentes con Testing Library (`Controls.test.tsx`, `Metrics.test.tsx`)

## Verificación visual
- `npm install -D playwright-core` — dependencia usada por `frontend-expert` para tomar capturas de verificación (1920×1080/1280×800/390×844); no agrega navegadores nuevos al proyecto

## Skills de agente (skills.sh)
- `npx skills add <repo> --skill <nombre>` — instala un skill específico de un repo del marketplace como skill de proyecto (`.claude/skills/`)
- `npx skills find <query>` — busca skills disponibles en el marketplace de skills.sh
- `npx skills list` — lista los skills instalados en el proyecto (ver también `skills-lock.json`)
