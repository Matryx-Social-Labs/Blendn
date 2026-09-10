# AGENTS.md

Guidance for any coding agent (Claude Code, Codex, or other) working in this repository. This is the source of truth — `CLAUDE.md` just points here.

## Running the app — no local Xcode/Simulator

This machine does not keep Xcode/iOS Simulator installed (disk space). Do not run `npm run ios`, `xcodebuild`, or `xcrun simctl`/`devicectl` commands — they will fail or are not the intended workflow here.

```bash
npx expo start --dev-client   # start Metro; connect from the dev-client binary already installed on a physical iPhone
npm run android                # Android emulator is fine locally if configured
npm run lint                   # ESLint
```

No test runner is configured — there are no unit tests.

The native shell (Google Sign-In, Apple Authentication, Sentry native modules) only needs rebuilding when a native dependency changes or `app.json` plugin config changes:

```bash
eas build --profile development --platform ios   # cloud build (macos-sequoia-15.6-xcode-26.0), installs via QR to a physical device
eas build --profile production --platform ios    # release build
eas update                                        # OTA push of JS-only changes to an existing build, no App Store review
```

For cross-device/OS QA before a release (devices/OS versions not owned locally): push to `stage` — `.eas/workflows/stage-testflight.yml` already builds and submits to TestFlight automatically, free (covered by the existing Apple Developer account, EAS free build tier). Install the TestFlight build on any device via the TestFlight app; no local Xcode, no paid device-farm service needed. `.github/workflows/ci.yml` also runs typecheck/test/lint on `ubuntu-latest`, free GitHub Actions minutes, before any of that.

## Concurrent agents / worktrees (cmux)

Multiple agent sessions may run against different worktrees of this repo simultaneously. `npx expo start` binds a fixed Metro port (default 8081). If two worktrees run a dev server at the same time, pass `--port <n>` to avoid a collision, or coordinate so only one worktree runs a dev server at a time.

## Environment

Create a `.env` file in this directory:
```
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000   # blendn-admin server URL
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...            # injected into app.json as GIDClientID
```

`EXPO_PUBLIC_API_BASE_URL` is required at startup — `apiClient.ts` throws immediately if it's missing.

## Architecture Overview

> For exhaustive API tables, socket event payloads, and full component listings see `docs/CODEBASE_OVERVIEW.md`.

### Routing (Expo Router, file-based)

```
app/
  index.tsx                         # Login screen (unauthenticated entry point)
  _layout.tsx                       # Root layout — auth guard, socket lifecycle, push notifications
  (tabs)/                           # Main tab screens (Events, Match, Chat, Profile)
  onboarding/                       # Multi-step onboarding flow (8 screens)
  event/[id].tsx                    # Event detail modal (slide_from_bottom)
  chat/[id].tsx                     # Group chat screen
  private-chat/[conversationId].tsx # 1-on-1 DM screen
  user/[id].tsx                     # Public user profile
```

**Auth guard logic** lives entirely in `app/_layout.tsx`:
- unauthenticated → `/`
- authenticated + not onboarded → `/onboarding/welcome`
- authenticated + onboarded → `/(tabs)/events`

Onboarding status is cached in `AsyncStorage` under `user_onboarded_status_<userId>` so the guard doesn't block the UI on every cold start. A background fetch keeps the cache fresh.

### API Layer (`lib/`)

| File | Purpose |
|------|---------|
| `apiClient.ts` | Core HTTP client — JWT auth, token refresh, priority request queue, SWR-style response cache |
| `api.ts` | Legacy wrappers over `apiClient` with camelCase→snake_case transform; prefer `apiClient` directly for new code |
| `socketClient.ts` | Socket.io client — typed events, room-based subscriptions, reconnect with exponential backoff |
| `useAuth.ts` | Global auth state **singleton** (not React context) + `useAuth()` hook |
| `queryCache.ts` | In-memory TTL/LRU cache (max 500 entries, 5 min default TTL) |

**API response format**: every `apiClient` method returns `{ success: boolean, data?: T, error?: string }`. Never throws — always check `result.success`.

**Token storage keys** (SecureStore, keychain service `blendn.api.auth`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`):
- `blendn_access_token`, `blendn_refresh_token`, `blendn_user`

**Request queue priorities** (lower = higher priority):

| Value | Used for |
|-------|---------|
| 1 | Auth, sending messages |
| 2 | Mutations (check-in, RSVP, announce) |
| 3 | Toggles (favorite, interest) |
| 4 | Batch reads |
| 5 | General queries |

GET requests retry 2× with exponential backoff. Mutations do not retry. On 401, a single token refresh is attempted; if that fails, tokens are cleared.

### Real-time Data Sync

Two layers work together:

1. **Socket.io** (`lib/socketClient.ts`) — on each socket event, calls `markDomainsDirty(['chat' | 'events' | 'match'])`.
2. **`useLiveSync` hook** (`lib/useLiveSync.ts`) — screens subscribe to dirty domains. When a domain is dirtied while connected, `onSync` fires immediately. When disconnected, falls back to exponential-backoff polling.

Standard usage pattern in screens:
```ts
useLiveSync({
  onSync: fetchData,
  domains: ['events'],           // refetch when socket pushes these
  syncOnFocus: true,             // also refetch on screen focus
  disconnectedIntervalMs: 15000, // poll when offline
})
```

On every app foreground, `_layout.tsx` calls `queryCache.clear()` and `apiClient.clearResponseCache()` to force fresh data.

### Theme System (`lib/theme.ts`)

All styling uses constants from `lib/theme.ts` — **do not use raw hex values**:
- `APP_COLORS` — background (`#000`), elevated (`#1C1C1E`), card (`#2C2C2E`), accent (`#0A84FF`), destructive, success
- `APP_SPACING` — xxs/xs/sm/md/lg/xl/2xl/3xl/4xl (4–48 px)
- `APP_RADIUS` — xs/sm/md/lg/xl/pill
- `APP_SIZE` — touch target (44 px), icon sizes
- `APP_ELEVATION` — low/medium/high shadow presets
- `APP_MOTION` — duration (instant/fast/normal/slow) + easing (entrance/exit/standard)
- `APP_CTA` — primary/secondary/destructive button style objects

NativeWind (Tailwind) is configured but UI code predominantly uses `StyleSheet.create` with theme tokens.

### Key Components

- `components/screens/EventDetailScreen.tsx` — full event detail rendered inside the `event/[id]` modal sheet
- `components/screens/MatchScreen.tsx` — people discovery UI
- `components/OptimizedImage.tsx` — `expo-image` wrapper with placeholder and fallback
- `components/motion/ScalePress.tsx` — use this for all tappable elements (haptic feedback + scale animation)
- `components/Skeleton.tsx` — loading shimmer placeholder
- `components/Toast.tsx` — global toast system (provider in `_layout.tsx`)
- `components/RealtimeStatusBanner.tsx` — surfaces socket connection state

### Important Patterns

- **Logging**: use `Logger.info/warn/error('module', 'message', data)` from `lib/logger.ts` — never `console.log`.
- **Auth singleton**: `useAuth.ts` stores state in a module-level variable, not React context. All components share one instance; calling `useAuth()` subscribes to updates.
- **Socket lifecycle**: managed in `_layout.tsx` — connects on login via `initSocketWithAppState()`, disconnects on logout, auto-reconnects on foreground. Rooms are automatically rejoined after every reconnect.
- **`lib/globalText.ts`**: imported once in `_layout.tsx` to patch the global `Text` component (font family, disable font scaling).
- **camelCase vs snake_case**: the REST API returns camelCase. `EventApiItem` in `apiClient.ts` documents both forms for historical compatibility — use camelCase in new code.
