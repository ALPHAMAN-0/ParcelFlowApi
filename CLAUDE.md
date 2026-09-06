- Build/run: `npm run dev` (node --watch --env-file=.env src/server.js), `npm start` (node src/server.js)
- Check/health: `npm run check` (bash scripts/check.sh) — verifies Docker daemon, containers, port, process, DB, login, authenticated read
- DB: `npm run db:up` / `db:down` (docker compose), `npm run db:migrate` (prisma migrate dev), `npm run db:deploy` (prisma migrate deploy), `npm run db:seed` (node prisma/seed.js), `npm run db:studio`
- Node >=22 required (package.json `engines`) — app reads `.env` via `process.loadEnvFile()`, not the `dotenv` package (README)
- Registration cannot create an admin: `auth` schema is a Zod `strictObject`, and the service hard-codes role to CUSTOMER (README) — do not add a `role` field to the register request
- Branch on `error.code`, never on `error.message`, when handling API errors (README) — messages get reworded, codes do not
- Files worth reading first:
  - src/app.js
  - src/server.js
  - README.md

Architecture: see ARCHITECTURE.md — read before structural changes
