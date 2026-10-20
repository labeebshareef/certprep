---
name: magic-ui
description: Use this skill when adding, customizing, or troubleshooting Magic UI components in React projects (Vite or Next.js) with Tailwind. Covers component selection, shadcn registry installation (`@magicui/*`), integration patterns, and quality checks. Use the FREE open-source components only (the registry list below); do not use Magic UI Pro blocks.
---

# Magic UI

Source: https://github.com/magicuidesign/magicui/blob/main/skills/magic-ui/SKILL.md (fetched 2026-10-20, references merged in).

Use this skill when the task involves Magic UI components, animated UI sections, or converting static sections into interactive UI using the Magic UI registry.

## When To Apply
- Add a Magic UI component (marquee, globe, blur-fade, shiny-button, ...)
- Build a section with Magic UI effects (hero, feature grid, CTA, dashboard cards)
- Replace custom animation code with Magic UI components
- Troubleshoot installation/import issues for `@magicui/*`

## Core Workflow
1. Define the UI outcome first: section type, tone, motion intensity, responsive behavior. Keep motion intentional; avoid stacking many high-motion effects in one viewport.
2. Prerequisites: React (Vite or Next.js) + Tailwind CSS. shadcn must be initialized once per project:
   ```
   npx shadcn@latest init
   ```
3. Install components from the registry:
   ```
   npx shadcn@latest add @magicui/<component-slug>
   # e.g.
   npx shadcn@latest add @magicui/magic-card
   ```
4. Integrate: import from the generated path (usually `@/components/ui/<component-slug>`). Keep component APIs intact; prefer prop/className customization over rewriting internals. Add any extra deps or CSS keyframes the component docs list.
5. Validate before finishing: accessibility (semantic HTML, keyboard access, labels), responsiveness (mobile layout, no horizontal overflow), performance (no stacked expensive animated backgrounds), maintainability (wrap heavy customizations in a local section component rather than editing registry output).

## Component Reference (free registry components)
Install contract: `npx shadcn@latest add @magicui/<slug>`; default import `import { ComponentName } from "@/components/ui/<slug>"`.

- Layout and social proof: `marquee`, `avatar-circles`, `bento-grid`
- Hero and visual anchors: `globe`, `warp-background`, `animated-grid-pattern`, `retro-grid` (one primary visual anchor per hero)
- Text motion: `blur-fade`, `text-animate`, `word-rotate`, `sparkles-text`, `typing-animation`
- Buttons and CTA emphasis: `shiny-button`, `shimmer-button`, `rainbow-button`, `ripple-button` (keep CTA style consistent within a section)
- Ambient effects: `particles`, `flickering-grid`, `dot-pattern`, `grid-pattern`, `light-rays` (supporting layers only)
- Other commonly used free components in the registry: `magic-card`, `number-ticker`, `animated-circular-progress-bar`, `border-beam`, `confetti`, `animated-list`, `orbiting-circles`, `shine-border`, `animated-beam`, `dock`, `pulsating-button`, `interactive-hover-button`, `cool-mode` — confirm slugs at https://magicui.design/docs/components before installing.

Integration notes: some components need extra deps (`cobe`, `motion` for `globe`); some need global CSS keyframes (`marquee` variants). Prefer prop-level customization before editing generated source.

Selection heuristics: start with 1 core component + 1 supporting effect, then expand only if needed.

## Recipes
1. Hero with visual depth: `warp-background` or `animated-grid-pattern` + `blur-fade` heading + `shiny-button` CTA. Max two high-motion effects; preserve text contrast.
   `npx shadcn@latest add @magicui/warp-background @magicui/blur-fade @magicui/shiny-button`
2. Trust rail: `marquee` (+ optional `avatar-circles`). Pause on hover/focus; keep moving text short.
   `npx shadcn@latest add @magicui/marquee @magicui/avatar-circles`
3. Feature grid with motion highlights: `bento-grid` + one text-motion component per card group. Consistent card heights; animate only 1–2 cards.
   `npx shadcn@latest add @magicui/bento-grid @magicui/text-animate`

## Study-app mapping (this repo)
- Streak / readiness / due-count stats: `number-ticker`, `animated-circular-progress-bar`
- Question card and section tiles: `magic-card`, `border-beam` (active card only), `bento-grid` for the course map
- Session complete / section passed: `confetti`, `sparkles-text`
- Primary action (Start session / Submit): `shimmer-button` or `shiny-button`; one style per screen
- Ambient background on home only: `dot-pattern` or `grid-pattern`, low opacity, never behind question text
- Respect `prefers-reduced-motion`; Malayalam text must stay readable over any effect.

## Troubleshooting
- `components.json` / registry init error → run `npx shadcn@latest init` in the project root.
- `@/` alias not configured → use the project's alias style or relative imports.
- Visual mismatch after install → check required global CSS/keyframes in the component docs.
- Missing package errors → install deps from the component's manual installation steps.

## Reference Links
- Docs: https://magicui.design/docs
- Components: https://magicui.design/docs/components
- Installation: https://magicui.design/docs/installation
- MCP setup (optional): https://magicui.design/docs/mcp
