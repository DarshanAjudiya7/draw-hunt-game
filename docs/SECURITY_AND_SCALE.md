# Security, Performance, and Future Work

## Security Hardening

- JWTs are signed server-side and accepted through Socket.io `handshake.auth`.
- REST APIs use Helmet, CORS, JSON body limits, and rate limiting.
- Chat messages and nicknames are sanitized and capped.
- Room joins enforce capacity and room existence checks.
- Host-only actions validate `hostId` before start, kick, end, or settings changes.
- Production should add stricter origin allowlists, audit logs, profanity moderation, and persistent ban lists.

## Real-Time Optimization

- Stroke batching: active pointer movement sends the last few points instead of every full stroke.
- Coordinate compression: points are normalized to four decimals and pressure to two decimals.
- Delta updates: `drawMove` sends only recent point deltas; `drawEnd` sends the full canonical stroke.
- `requestAnimationFrame`: incoming packets are drained on the render loop.
- Event throttling: Socket.io volatile packets can be dropped when the connection is saturated.
- Binary payload path: replace JSON `StrokePacket` with MessagePack or FlatBuffers for larger rooms.

## Scalability

Target per room is 2-10 players. Hundreds of active rooms are supported by horizontal API replicas when Redis Adapter is enabled.

Recommended production topology:

```text
Vercel CDN -> Next.js client
Load balancer -> API replicas
API replicas -> Redis pub/sub
API replicas -> MongoDB Atlas
```

Room memory should remain small:

- Keep recent stroke history for replay and undo.
- Store periodic compressed canvas snapshots.
- Persist completed matches to MongoDB.
- Move long-term replay storage to S3/R2 when drawings grow beyond Mongo document limits.

## Future Improvements

- Cursor ghosts and player presence trails.
- Server-authoritative score validation for all modes.
- Drawing replay scrubber on match end.
- Spectator mode and tournament brackets.
- Moderation queue for AI prompts and chat.
- WebRTC data-channel experiment for ultra-low-latency private rooms.
- Native-like PWA install, haptics, and offline practice mode.
