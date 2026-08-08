# The API contract

Mirrored from **Blendn-Admin**, which holds the REST API, the Socket.io server
and the organiser dashboard. They are copies so you can read the contract
without a second checkout — **the sources are there, and edits belong there.**

Refresh, and see what changed on the server side since last time:

```bash
./scripts/sync-api-docs.sh ../blendn-admin
git diff docs/api/
```

That diff is the point. Run it before starting anything that touches the network
layer.

## What is here

| | |
|---|---|
| [`API.md`](API.md) | **Every endpoint, with payloads.** The reference. Start here |
| [`USER_JOURNEY.md`](USER_JOURNEY.md) | What a user does, in order, as **designed → built → served**. The contract between all three repos, and the one document that explains *why* the API is shaped this way |
| [`CHECKIN.md`](CHECKIN.md) | The geofence, and capacity vs occupancy vs attendance. Read before touching check-in |
| [`SOCKET_EVENTS.md`](SOCKET_EVENTS.md) | The realtime catalogue. `lib/socketClient.ts` currently matches it exactly — keep it that way |
| [`client-chat-moderation-guide.md`](client-chat-moderation-guide.md) | Written for this client: what moderation does to a message and what the app has to render |
| [`DESIGN_HANDOFF.md`](DESIGN_HANDOFF.md) | What the designer is being asked to change in `Blendn.fig`, and why. Read before building a screen from the deck |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | The web design system — the reference for the token work in `ROADMAP.md` §11 |

`../ROADMAP.md` is this repo's ledger of what to build against all of it.

## Live, always current

The spec is generated from the route handlers, so it cannot drift from the
routes the way a hand-written document can:

- Production — <https://api.blendn.app/api-docs> · [raw OpenAPI](https://api.blendn.app/api/docs)
- Staging — <https://blendn-admin-staging.up.railway.app/api-docs>

**Use Swagger UI to confirm a payload before writing the call.** It has been
wrong about *fields* before — `UpdateProfileRequest` had fallen six behind the
route — so that specific failure is now guarded by a test in Blendn-Admin, but
prefer a real response over any document, including this one.

## Two things that are easy to get wrong

**Auth is not the dashboard's auth.** Mobile routes take a bearer JWT from
`lib/mobile-auth.ts` — 15-minute access tokens, 30-day rotating refresh tokens.
The dashboard's NextAuth session is a separate system and mobile endpoints never
read it.

**`/api/mobile/v1/*` and `/api/mobile/*` are the same thing.** Middleware strips
the version and rewrites. Either works.
