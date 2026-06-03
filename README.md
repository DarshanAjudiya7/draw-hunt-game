# DrawHunt

Premium mobile-first multiplayer drawing game built with Next.js, Express, Socket.io, MongoDB, and Gemini.

## Quick Start

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run build
npm run dev --workspace @drawhunt/api
npm run dev --workspace @drawhunt/web
```

Open `http://localhost:3000`. The API runs on `http://localhost:4000`.

## Deliverables

- Architecture and data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Deployment guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Security and scaling notes: [docs/SECURITY_AND_SCALE.md](docs/SECURITY_AND_SCALE.md)

