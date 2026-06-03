# Deployment Guide

## MongoDB Atlas

1. Create an Atlas cluster and database user.
2. Add the API host IP or `0.0.0.0/0` while testing.
3. Copy the connection string into `MONGODB_URI`.

## Backend on Render or Railway

Environment variables:

```bash
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=https://your-vercel-app.vercel.app
MONGODB_URI=mongodb+srv://...
JWT_SECRET=long-random-secret
GEMINI_API_KEY=...
REDIS_URL=rediss://...
```

Build command:

```bash
npm install
npm run build --workspace @drawhunt/shared
npm run build --workspace @drawhunt/api
```

Start command:

```bash
npm run start --workspace @drawhunt/api
```

## Frontend on Vercel

Set:

```bash
NEXT_PUBLIC_API_URL=https://your-api.example.com
```

Build command:

```bash
npm run build --workspace @drawhunt/shared
npm run build --workspace @drawhunt/web
```

Output is the normal Next.js deployment output.

## Production Checklist

- Enable HTTPS only.
- Configure CORS to the exact frontend origin.
- Use Redis when running more than one API process.
- Enable sticky sessions at the load balancer if the platform requires them for WebSockets.
- Add uptime checks against `/health`.
- Turn on MongoDB backups and alerts.
- Rotate `JWT_SECRET` through platform secret management.

