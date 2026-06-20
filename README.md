# Robin

Robin is an agent-led design memory partner. For each project it maintains a
single living `design.md` that captures design intent, tokens, and constraints,
so coding agents and people share one source of truth.

## Stack

- [Next.js](https://nextjs.org) web app with [Clerk](https://clerk.com) auth
- [Convex](https://convex.dev) backend (projects, messages, uploads)
- [Eve](https://eve.dev) AI agent framework for the Robin agent
- [Cloudflare R2](https://developers.cloudflare.com/r2/) for design file storage
- [shadcn/ui](https://ui.shadcn.com) component library
- [Turborepo](https://turbo.build) + [Bun](https://bun.sh) monorepo

## Structure

```
apps/
  web/      Next.js app (workspace UI, AI chat)
  agent/    Eve agent that maintains design.md
packages/
  convex/   Convex backend functions and schema
  ui/       Shared shadcn/ui components
  eslint-config/      Shared ESLint config
  typescript-config/  Shared TypeScript config
```

## Getting started

```bash
# install dependencies
bun install

# copy env vars and fill in values (see .env.example)
cp .env.example apps/web/.env.local
cp .env.example apps/agent/.env.local

# run everything
bun run dev
```

See `.env.example` for the full list of required environment variables and
where each one belongs.

## Scripts

- `bun run dev` — start all apps in dev mode
- `bun run build` — build all apps and packages
- `bun run lint` — lint the workspace
- `bun run typecheck` — type-check the workspace
- `bun run format` — format with Prettier

## License

[MIT](./LICENSE)
