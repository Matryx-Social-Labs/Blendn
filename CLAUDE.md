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
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000  # blendn-admin server URL
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
```

## Architecture Overview

### Routing (Expo Router, file-based)

```
app/
  index.tsx               # Login screen (unauthenticated entry point)
  _layout.tsx             # Root layout — auth guard, socket lifecycle, push notifications
  (tabs)/                 # Main tab screens (Events, Match, Chat, Profile)
  onboarding/             # Multi-step onboarding flow
  event/[id].tsx          # Event detail modal
  chat/[id].tsx           # Group chat screen
  private-chat/[conversationId].tsx  # 1-on-1 DM screen
  user/[id].tsx           # User profile view
```

**Auth guard logic** lives entirely in `app/_layout.tsx`: unauthenticated → `/`, not onboarded → `/onboarding/welcome`, onboarded → `/(tabs)/events`.

### API Layer (`lib/`)

| File | Purpose |
|------|---------|
| `apiClient.ts` | Core HTTP client — JWT auth, token refresh, priority request queue, SWR-style response cache |
| `api.ts` | Thin wrappers over `apiClient` that also transform camelCase API responses → snake_case for legacy consumers |
| `socketClient.ts` | Socket.io client — typed events, room-based subscriptions, reconnect with exponential backoff |
| `useAuth.ts` | Global auth state singleton + `useAuth()` hook; tokens stored in `expo-secure-store` |
| `queryCache.ts` | In-memory TTL cache with LRU eviction (max 500 entries, 5 min default TTL) |

**API response format**: `apiClient` methods return `{ success: boolean, data?: T, error?: string }`.

**Token storage keys** (SecureStore, keychain service `blendn.api.auth`):
- `blendn_access_token`, `blendn_refresh_token`, `blendn_user`

### Real-time Data Sync

Two layers work together:

1. **Socket.io** (`lib/socketClient.ts`) — pushes live events (check-ins, chat messages, etc.). On each socket event, calls `markDomainsDirty(['chat' | 'events' | 'match'])`.

2. **`useLiveSync` hook** (`lib/useLiveSync.ts`) — each screen subscribes to dirty domains. When a domain is marked dirty while the socket is connected, `onSync` fires immediately. When disconnected, it falls back to exponential-backoff polling.

Usage pattern in screens:
```ts
useLiveSync({
  onSync: fetchData,
  domains: ['events'],           // refetch when socket pushes these
  syncOnFocus: true,             // also refetch on screen focus
  disconnectedIntervalMs: 15000, // poll when offline
})
```

### Theme System (`lib/theme.ts`)

All styling uses constants from `lib/theme.ts` — **do not use raw hex values**:
- `APP_COLORS` — background, text, accent (#0A84FF), destructive, success
- `APP_SPACING` — xxs/xs/sm/md/lg/xl/2xl/3xl/4xl (px)
- `APP_RADIUS` — xs/sm/md/lg/xl/pill
- `APP_SIZE` — touch target (44px), icon sizes
- `APP_ELEVATION` — low/medium/high shadow presets
- `APP_MOTION` — animation duration/easing presets
- `APP_CTA` — primary/secondary/destructive button styles

NativeWind (Tailwind) is also configured but most UI code uses `StyleSheet.create` with theme tokens directly.

### Key Components

- `components/screens/EventDetailScreen.tsx` — full event detail rendered inside a modal sheet
- `components/ModernChat.tsx` — group chat UI with reactions, threading, typing indicators
- `components/OptimizedImage.tsx` — expo-image wrapper with placeholder/fallback
- `components/motion/ScalePress.tsx` — haptic-feedback pressable with scale animation
- `components/Skeleton.tsx` — loading skeleton shimmer

### Important Patterns

- **App state management**: When the app returns from background, `_layout.tsx` calls `queryCache.clear()` and `apiClient.clearResponseCache()` to force fresh data on next focus.
- **Socket lifecycle**: Socket connects on user login (managed in `_layout.tsx`), disconnects on logout, and reconnects on app foreground.
- **Request queue**: `apiClient` has a priority queue (max 6 concurrent) to prevent connection pool exhaustion on app open.
- **`lib/globalText.ts`**: Imported once in `_layout.tsx` to apply global `Text` component overrides (font, scaling).
- **`lib/logger.ts`**: Structured logger used throughout — prefer `Logger.info/warn/error('module', 'message', data)` over `console.log`.
