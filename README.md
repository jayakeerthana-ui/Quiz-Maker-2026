# AISprints Starter

A starter template for AISprints. It is aimed at experienced developers who want to use
AI agents effectively for building and maintaining real software, rather than as an
autocomplete.

New here? Follow [SETUP.md](./SETUP.md) first.

## What this gives you

Two things, beyond a working application skeleton:

- **A configured agent context.** `AGENTS.md`, scoped rules in `.cursor/rules/`, on-demand
  skills in `.cursor/skills/`, and PR review rules in `.cursor/BUGBOT.md`. Together these
  constrain the agent to this project's stack and conventions instead of generic defaults.
- **A technical PRD template.** `ai-workspace/TEMPLATE_TECHNICAL_PRD.md` structures a
  feature into scope, phases, and acceptance criteria that both you and the agent work from.

## Stack

- [Next.js 16](https://nextjs.org) with the App Router and React 19
- [Cloudflare Workers](https://workers.cloudflare.com) via [OpenNext](https://opennext.js.org/cloudflare)
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) on Base UI
- TypeScript in strict mode

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on Node at [localhost:3000](http://localhost:3000) |
| `npm run preview` | Build and run on the local Cloudflare Workers runtime |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate Cloudflare binding types |

`npm run dev` runs on Node, so it will not catch Workers-specific problems. Use
`npm run preview` before deploying.

## How the agent context fits together

| Path | Loaded | Purpose |
|---|---|---|
| `AGENTS.md` | Every conversation | Stack, layout, commands, working agreements |
| `.cursor/rules/*.mdc` | When matching files are touched | Conventions for Next.js, Cloudflare, D1, Tailwind, shadcn |
| `.cursor/skills/*/SKILL.md` | When the agent judges them relevant | Deeper guidance for the AI SDK and testing |
| `.cursor/BUGBOT.md` | Bugbot PR reviews | Review checklist (project rules do **not** reach Bugbot) |
| `.cursorignore` | Always | Hides `.dev.vars` and local Wrangler state from the agent |

Keep these current as your project grows. Stale instructions are worse than none, because
the agent follows them confidently.

## Adding UI components

shadcn/ui is already initialized. Add components with the `@shadcn/` namespace:

```bash
npx shadcn@latest add @shadcn/select
```

Already installed: `badge` `button` `card` `dialog` `field` `input` `label` `separator` `table`
