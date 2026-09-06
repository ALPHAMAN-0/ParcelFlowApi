---
tags: [component, ParcelFlowApi]
---
- Path: `src/lib/prisma.js`
- Role: Prisma client instance, used for queries and `$disconnect()`/`$queryRaw` health check (see `src/app.js`, `src/server.js`)
- Talks to: [[Database]]
- Back: [[ARCHITECTURE]]
