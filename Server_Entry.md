---
tags: [component, ParcelFlowApi]
---
- Path: `src/server.js`
- Role: Process entry point — binds `env.PORT`, handles `SIGTERM`/`SIGINT` graceful shutdown (closes server, disconnects Prisma, 10s hard exit deadline)
- Talks to: [[App]]
- Back: [[ARCHITECTURE]]
