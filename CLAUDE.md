# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository is a minimal React 19 + TypeScript + Vite app. It is still close to the starter template: there is a single top-level `App` component, no router, no data-fetching layer, and no test framework configured yet.

## Common Commands

- Install dependencies: `npm install`
- Start the dev server: `npm run dev`
- Build for production: `npm run build`
- Run ESLint: `npm run lint`
- Preview the production build: `npm run preview`

## Testing

- There is currently no test runner configured in `package.json`.
- There is no single-test command yet because the project does not include Vitest, Jest, or another test framework.
- If tests are added later, update this file with the exact commands for running the full suite and a single test.

## Architecture

- `index.html` is the Vite entry HTML and provides the `#root` mount point.
- `src/main.tsx` is the client entry; it imports global styles from `src/index.css`, creates the React root, and renders `App` inside `StrictMode`.
- `src/App.tsx` contains the entire current UI. It is a single presentational page composed of three main sections: the hero/counter area, the documentation/social links area, and a spacer footer section. The only React state is the local `count` state used by the demo button.
- `src/index.css` holds global design tokens and page-wide layout rules: color variables, typography, dark-mode variables, and the overall `#root` shell.
- `src/App.css` holds component/page-specific styling for the `App` markup, including the hero image composition, counter button styling, and responsive layout for the next-steps cards.

## Asset Conventions

- Files under `src/assets/` are bundled through Vite and imported directly into React components.
- Files under `public/` are served as static assets and referenced by root-relative URLs. In the current app, `public/icons.svg` is used as an SVG sprite via `<use href="/icons.svg#...">`.

## ESLint Setup

- Linting is configured through the flat-config file `eslint.config.js`.
- The current ruleset combines base JavaScript recommendations, TypeScript ESLint recommended rules, React Hooks rules, and Vite React Refresh rules.
- `dist/` is globally ignored.

## Practical Notes For Changes

- This codebase currently favors simple colocated code over abstraction. Unless the app grows, prefer extending the existing structure rather than introducing routing, global state, or a large component hierarchy prematurely.
- When modifying UI, check whether the change belongs in global layout/theme rules (`src/index.css`) or in page/component-specific rules (`src/App.css`).
- Because the app uses static imports for images in `src/App.tsx` and an SVG sprite from `public/`, keep the distinction between bundled assets and public assets intact when adding new media.
