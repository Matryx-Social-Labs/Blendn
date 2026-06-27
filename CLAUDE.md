# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start              # Start dev server (press i/a/w for iOS/Android/web)
npm run ios                 # Run on iOS simulator (requires Xcode)
npm run android             # Run on Android emulator
npm run build:ios           # EAS cloud build for iOS
npm run build:android       # EAS cloud build for Android
npm run lint                # ESLint
```

No test runner is configured — there are no unit tests.

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
