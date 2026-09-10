# Blend'n — the Expo app

The client for Blend'n, an event networking app. The API and the organiser
dashboard live in **`blendn-admin`**; the contract between them is mirrored into
[`docs/api/`](docs/api/) so you can read it without a second checkout.

**New here?** Go straight to
[**Second developer, from zero**](docs/RELEASING.md#second-developer-from-zero).
It is the only page you need to get a build on a device, and it names the two
things that will otherwise waste your morning.

## Get started

```bash
npm install
cp .env.example .env      # then set EXPO_PUBLIC_API_BASE_URL — see below
npx expo start
```

> **`.env` is not optional.** Without `EXPO_PUBLIC_API_BASE_URL` the app
> **crashes before the first screen** — `lib/apiClient.ts` throws at module
> scope. It does not degrade and it does not show an error, so a missing line in
> a gitignored file looks exactly like a broken build.

To run on a real device or emulator — which is the only way to test push, GPS
check-in or Google Sign-In:

```bash
npx expo run:android      # emulator or USB device
npx expo run:ios --device
```

These compile locally, cost nothing, and are unlimited. The native directories
are committed, so a local build is not a rehearsal for an EAS one — it is the
same binary shape. **EAS builds are for handing something to someone else**, not
for checking your own work; see
[Releasing](docs/RELEASING.md#testing-does-not-need-eas-at-all-and-this-is-the-part-that-protects-the-quota).

## Where things are

| | |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | The working ledger. Nothing ships without this file moving |
| [`docs/RELEASING.md`](docs/RELEASING.md) | Local builds, EAS, credentials, environment variables, the stores |
| [`docs/api/USER_JOURNEY.md`](docs/api/USER_JOURNEY.md) | What a user does, in order, as designed → built → served |
| [`docs/api/`](docs/api/) | The API contract, mirrored from `blendn-admin` |
| `app/` | Routes. [File-based routing](https://docs.expo.dev/router/introduction) |
| `components/`, `lib/` | Presentation and logic |
| `docs/` | One file per screen — `PULSE.md`, `SCENE.md`, `CHAT.md`, `PROFILE.md`, `BANTER.md` |

Screen docs are worth reading before changing a screen. Each records the Figma
frame it was built from, where the build deliberately departs from it, and what
is still an open question for the designer.

## Tests

```bash
npm test
./scripts/typecheck.sh
```

Both run on EAS before any build, in the same checkout moments before it — not
read off a GitHub check, because a green check is a fact about *a commit* and
gating on one means trusting it is the commit about to be built.
