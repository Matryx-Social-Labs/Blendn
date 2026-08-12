# Blendn Mobile App — Codebase Overview

> Living reference document. Update when architecture changes.

---

## Table of Contents

1. [Project Identity](#1-project-identity)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Routing & Navigation](#4-routing--navigation)
5. [Auth System](#5-auth-system)
6. [API Client](#6-api-client)
7. [Real-time Layer](#7-real-time-layer)
8. [Live Sync Hook](#8-live-sync-hook)
9. [Theme System](#9-theme-system)
10. [Key Components](#10-key-components)
11. [Utility Libraries](#11-utility-libraries)
12. [Environment & Config](#12-environment--config)
13. [Build & Deploy](#13-build--deploy)
14. [Patterns & Conventions](#14-patterns--conventions)
15. [Mobile API Endpoints](#15-mobile-api-endpoints)

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| App name | Blendn |
| Bundle ID (iOS) | `com.matryxsociallabs.blendn` |
| Package (Android) | `com.matryxsociallabs.blendn` |
| EAS project ID | `9fbe009f-ee8b-4d9b-8837-aba0223864d5` |
| EAS owner | `matrixsociallabs` |
| Deep-link scheme | `blendn://` |
| Expo SDK | ~53 |
| React Native | 0.79.6 |
| New Architecture | enabled |

Blendn is an **event networking app** — users discover events nearby, GPS-validate on-site check-ins, and connect with other attendees via group chat and private DMs.

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Expo 53 (managed workflow with prebuild) |
| Language | TypeScript 5.8 |
| Navigation | Expo Router 5 (file-based) |
| Styling | `StyleSheet.create` + `lib/theme.ts` tokens; NativeWind v4 also available |
| Animations | `react-native-reanimated` ~3.17, custom motion utilities in `lib/motion.ts` |
| Auth | JWT via custom REST API; Google OAuth via `@react-native-google-signin/google-signin` |
| Token storage | `expo-secure-store` (keychain), with `AsyncStorage` fallback |
| Real-time | `socket.io-client` ^4.7 |
| HTTP client | Custom `ApiClientClass` in `lib/apiClient.ts` |
| Images | `expo-image` with `OptimizedImage` wrapper |
| Push notifications | `expo-notifications` + Expo push service |
| Location | `expo-location` (GPS check-in) |
| Media pick | `expo-image-picker` + `expo-image-manipulator` |
| Logging | Structured logger in `lib/logger.ts` |

---

## 3. Directory Structure

```
blendn/
├── app/                        # Expo Router screens (file = route)
│   ├── _layout.tsx             # Root layout — auth guard, socket lifecycle
│   ├── index.tsx               # Login screen (unauthenticated entry)
│   ├── (tabs)/                 # Main tab group
│   │   ├── _layout.tsx         # Tab bar config
│   │   ├── events.tsx          # Events feed
│   │   ├── match.tsx           # People discovery / match
│   │   ├── chat.tsx            # Chat list (groups + DMs)
│   │   └── profile.tsx         # Own profile
│   ├── onboarding/             # Multi-step onboarding flow
│   │   ├── welcome.tsx
│   │   ├── basic-info.tsx
│   │   ├── interests.tsx
│   │   ├── goals.tsx
│   │   ├── preferences.tsx
│   │   ├── location.tsx
│   │   ├── photos.tsx
│   │   └── complete.tsx
│   ├── event/[id].tsx          # Event detail modal (slide_from_bottom)
│   ├── chat/[id].tsx           # Group chat screen
│   ├── private-chat/[conversationId].tsx  # 1-on-1 DM screen
│   ├── user/[id].tsx           # Public user profile
│   ├── edit-profile.tsx
│   ├── settings.tsx
│   ├── blocked-users.tsx
│   ├── interested.tsx          # Users interested in an event
│   └── nearby-events.tsx
│
├── components/
│   ├── screens/
│   │   ├── EventDetailScreen.tsx   # Full event detail (inside modal)
│   │   └── MatchScreen.tsx
│   ├── motion/
│   │   ├── ScalePress.tsx          # Haptic pressable with scale anim
│   │   └── FadeInUp.tsx
│   ├── ActionTray.tsx
│   ├── AppHeader.tsx
│   ├── ErrorBoundary.tsx
│   ├── EventCard.tsx
│   ├── LazyWrapper.tsx
│   ├── NearbyEventCard.tsx
│   ├── OnboardingProgressBar.tsx
│   ├── OptimizedImage.tsx          # expo-image wrapper
│   ├── PhotoLightbox.tsx
│   ├── PhotoManager.tsx
│   ├── RealtimeStatusBanner.tsx
│   ├── Skeleton.tsx                # Loading shimmer
│   ├── Toast.tsx
│   ├── Typography.tsx
│   └── VirtualizedList.tsx
│
├── lib/
│   ├── apiClient.ts            # Core HTTP client (see §6)
│   ├── api.ts                  # Thin wrappers + camelCase→snake_case transform
│   ├── useAuth.ts              # Global auth state + hooks (see §5)
│   ├── socketClient.ts         # Socket.io client (see §7)
│   ├── useLiveSync.ts          # Data freshness hook (see §8)
│   ├── liveSyncState.ts        # Dirty-domain pub/sub
│   ├── theme.ts                # Design tokens (see §9)
│   ├── queryCache.ts           # In-memory TTL/LRU cache
│   ├── eventDetailCache.ts     # Event detail specific cache
│   ├── chatListUpdates.ts      # Chat list update helpers
│   ├── subscriptionManager.ts  # Socket subscription cleanup helper
│   ├── notifications.ts        # Push notification setup
│   ├── photoUtils.ts           # Image resize/upload helpers
│   ├── networkStatus.ts        # Online/offline state
│   ├── globalText.ts           # Global Text component overrides
│   ├── gradientOverlay.tsx     # Gradient context provider
│   ├── logger.ts               # Structured logger
│   ├── motion.ts               # Animation presets
│   ├── safetyUtils.ts          # User blocking/safety helpers
│   ├── supabase.ts             # Supabase client (legacy, largely superseded by apiClient)
│   ├── time.ts                 # Date/time formatting helpers
│   ├── typography.ts           # Font scale constants
│   ├── unread.ts               # Unread count tracking
│   ├── useInteractionFeedback.ts
│   ├── useMinimumVisible.ts
│   └── uxStandards.ts          # UX guideline constants
│
├── assets/
│   ├── fonts/SpaceMono-Regular.ttf
│   ├── images/                 # icons, splash
│   └── logo/                   # icon-ios.png, adaptive-*.png, monogram-*.png
│
├── docs/                       # Reference documentation
├── scripts/                    # Dev/seed scripts
├── app.json                    # Expo app config
├── eas.json                    # EAS build profiles
├── package.json
└── tsconfig.json
```

---

## 4. Routing & Navigation

Expo Router creates routes from file paths. The auth guard lives **entirely in `app/_layout.tsx`**.

### Auth guard logic

```
loading=true  →  show splash / nothing
user=null     →  router.replace('/')         (login screen)
user + !onboarded  →  router.replace('/onboarding/welcome')
user + onboarded   →  router.replace('/(tabs)/events')
```

Onboarding status is cached in `AsyncStorage` (`user_onboarded_status_<userId>`) to avoid an extra API call on every cold start. A background refresh updates the cache without blocking navigation.

### Screen transitions

| Route | Transition |
|-------|-----------|
| `(tabs)` | `none` (tab switch) |
| `onboarding` | `none` + `gestureEnabled: false` |
| `event/[id]` | `slide_from_bottom` (modal sheet) |
| `chat`, `private-chat`, `user/[id]`, etc. | `ios_from_right` / `slide_from_right` |

### Android back-button

Hardware back is intercepted in `_layout.tsx` — blocked on login, onboarding, and tabs root to prevent navigating behind the app shell.

---

## 5. Auth System

**File:** `lib/useAuth.ts`

Auth is a **global singleton** (not React context). A single in-memory `globalAuthState` object is shared across all components; listeners are updated via a subscriber array.

### State shape

```ts
interface AuthState {
  session: { user: AuthUser } | null
  user: AuthUser | null
  loading: boolean
  initialized: boolean
}
```

### Initialization flow

1. App starts → `initializeAuth()` called once.
2. Reads `blendn_access_token` from SecureStore.
3. If token exists → `GET /api/mobile/auth/session` to validate.
4. If 401 → attempt `POST /api/mobile/auth/refresh`.
5. If refresh fails → clear tokens, user=null → redirect to login.

Session is refreshed **every 10 minutes** via `setInterval` while the app is active. The interval is paused when the app is backgrounded and resumed on foreground.

### Auth actions

| Export | Purpose |
|--------|---------|
| `useAuth()` | React hook — returns current `AuthState` |
| `signInWithGoogle(idToken)` | Google OAuth sign-in |
| `signInWithEmail(email, pass)` | Email/password sign-in |
| `signUp(email, pass, name)` | Registration |
| `signOut(revokeAll?)` | Clears tokens + socket disconnect |
| `getCurrentUser()` | Async helper (no hook required) |
| `isAuthenticated()` | Synchronous check |
| `reinitializeAuth()` | Force re-check (e.g. after deep link) |

### Token storage

Keys stored in SecureStore under keychain service `blendn.api.auth` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`):

| Key | Contents |
|-----|---------|
| `blendn_access_token` | Short-lived JWT |
| `blendn_refresh_token` | Long-lived refresh token |
| `blendn_user` | Serialized `AuthUser` JSON |

---

## 6. API Client

**File:** `lib/apiClient.ts`  
**Export:** `apiClient` (singleton `ApiClientClass`)

### Request queue

All requests go through `RequestQueue` — a priority-based concurrency limiter (max 6 concurrent). Priorities:

| Type | Priority value |
|------|---------------|
| Auth operations | 1 (highest) |
| Message send | 1 |
| Mutations (check-in, RSVP) | 2–3 |
| Batch/queries | 4–5 (lowest) |

The queue prevents connection pool exhaustion on app open (dozens of simultaneous requests).

### SWR-style caching

`cachedRequest()` implements stale-while-revalidate:
- Fresh cache → return immediately, no network.
- Stale cache → return immediately, kick off background refresh.
- No cache → await network, then cache.

Cache TTLs per endpoint type:

| Endpoint type | TTL |
|--------------|-----|
| Events list | 60 s |
| Chat groups / conversations | 30 s |
| Check-ins | 30 s |
| Event check-ins | 30 s |
| Interested users | 30 s |
| Chat participants | 30 s |
| Message requests | 30 s |
| Categories | 10 min |
| Profile (ProfileCache) | 60 s |

### In-flight dedup

GET requests with identical URL+auth are deduplicated — concurrent callers share one in-flight `Promise`.

### Error handling

- `GET` requests retry up to 2× with exponential backoff (800 ms base, max 6 s).
- Mutations do not retry.
- 401 → attempt single token refresh → retry once → if still 401, clear tokens.
- Network error → `markOffline()`, return `{ success: false, error: 'No internet...' }`.

### Key exported types

```ts
ApiResponse<T>        // { success, data?, error?, errors? }
AuthUser              // user object with nested profile
EventApiItem          // single event (both camelCase and snake_case aliases)
UserProfileData       // profile with nested profile sub-object
CheckInResult
EventChatData
AuthResult
PaginationMeta
```

### App state integration

When the app goes to background, the request queue is cleared to avoid stale requests replaying when the app resumes. When app returns to active, `queryCache.clear()` and `apiClient.clearResponseCache()` are called from `_layout.tsx` to force fresh data.

---

## 7. Real-time Layer

**File:** `lib/socketClient.ts`

Connects to the same server URL as the REST API (`EXPO_PUBLIC_API_BASE_URL`). Authentication uses the JWT access token passed in `socket.auth`.

### Connection lifecycle

- **Connect:** called when user authenticates (`initSocketWithAppState()` from `_layout.tsx`).
- **Disconnect:** called on sign-out.
- **App foreground:** reconnects if not already connected.
- **Reconnect backoff:** exponential, base 1 s, max 5 attempts.
- **Room rejoin:** on every (re)connect, `rejoinAllRooms()` restores all subscribed rooms so no events are missed.

### Server → Client events

| Event | Payload |
|-------|---------|
| `event:checkin` | `{ eventId, userId, userName, userImage?, checkInTime }` |
| `event:checkout` | `{ eventId, userId, checkOutTime }` |
| `event:interestUpdate` | `{ eventId, interested, interestCount, userId }` |
| `chat:message` | `{ chatGroupId, message }` |
| `chat:typing` | `{ chatGroupId, userId, userName, isTyping }` |
| `chat:reaction` | `{ chatGroupId, messageId, userId, emoji, action }` |
| `chat:messageDeleted` | `{ chatGroupId, messageId }` |
| `chat:memberBanned` | `{ chatGroupId, userId, banned }` |
| `private:message` | `{ conversationId, message }` |
| `private:typing` | `{ conversationId, userId, userName, isTyping }` |
| `private:read` | `{ conversationId, messageIds, readBy }` |
| `connected` | `{ userId }` |
| `error` | `{ message, code? }` |

### Subscription API

```ts
// Event rooms
subscribeToEventCheckIn(eventId, cb)    → unsubscribe fn
subscribeToEventCheckOut(eventId, cb)   → unsubscribe fn
subscribeToEventInterest(eventId, cb)   → unsubscribe fn

// Chat rooms
subscribeToChatMessage(chatGroupId, cb)    → unsubscribe fn
subscribeToChatTyping(chatGroupId, cb)     → unsubscribe fn
subscribeToChatReaction(chatGroupId, cb)   → unsubscribe fn
subscribeToChatModeration(chatGroupId, cb) → unsubscribe fn

// Private conversations
subscribeToConversation(conversationId, cb) → unsubscribe fn

// User-level (for chat list badge updates)
subscribeToUserNotifications(userId, cb) → unsubscribe fn
```

All subscriptions track room membership — last unsubscribe from a room emits `leave:event/chat/conversation`.

### Dirty domains

On every socket event the corresponding data domain is flagged dirty via `markDomainsDirty()`:

| Event | Dirty domains |
|-------|-------------|
| Check-in / checkout / interest | `['events', 'match']` |
| Chat message | `['chat']` |
| Private message | `['chat', 'match']` |

Screens using `useLiveSync` react to these flags (see §8).

---

## 8. Live Sync Hook

**File:** `lib/useLiveSync.ts`

Combines socket events + polling fallback to keep screen data fresh without manual refresh.

```ts
useLiveSync({
  onSync: fetchData,            // called to refresh data
  domains: ['events'],          // domains that trigger a sync
  syncOnFocus: true,            // sync when screen gains focus
  syncOnReconnect: true,        // sync after socket reconnects
  disconnectedIntervalMs: 15000, // polling interval when socket offline
  connectedIntervalMs: 0,       // polling interval when connected (0 = off)
  maxDisconnectedIntervalMs: 60000, // cap on backoff
})
```

When connected: syncs on domain dirty signal only (no polling by default).  
When disconnected: falls back to exponential-backoff polling starting from `disconnectedIntervalMs`.  
In-flight dedup prevents overlapping fetches.

---

## 9. Theme System

**File:** `lib/theme.ts`

All colors, spacing, radius, shadows, motion, and CTA styles are exported as `const` objects. **Never use raw hex values in components.**

### Colors (`APP_COLORS`)

| Token | Value | Use |
|-------|-------|-----|
| `backgroundBase` | `#000000` | Screen background |
| `backgroundElevated` | `#1C1C1E` | Cards, modals |
| `backgroundCard` | `#2C2C2E` | List items |
| `separator` | `rgba(255,255,255,0.14)` | Dividers |
| `textPrimary` | `#FFFFFF` | Main text |
| `textSecondary` | `#EBEBF599` | Secondary text |
| `textTertiary` | `#EBEBF54D` | Placeholder, hints |
| `accent` | `#0A84FF` | Primary CTA, links |
| `accentPressed` | `#0060DF` | Pressed state |
| `destructive` | `#FF3B30` | Delete, errors |
| `success` | `#34C759` | Confirmations |

### Spacing (`APP_SPACING`)
`xxs=4, xs=8, sm=12, md=16, lg=20, xl=24, 2xl=32, 3xl=40, 4xl=48`

### Border radius (`APP_RADIUS`)
`xs=8, sm=12, md=16, lg=20, xl=24, pill=999`

### Sizes (`APP_SIZE`)
`touchTarget=44px, iconSm=16, iconMd=20, iconLg=24`

### Motion (`APP_MOTION`)
Durations: `instant=90ms, fast=160ms, normal=220ms, slow=300ms`  
Easings: `entrance`, `exit`, `standard` (cubic-bezier arrays)

### CTA styles (`APP_CTA`)
`primary`, `secondary`, `destructive` — each has `background`, `text`, `pressed`, `disabled`.

---

## 10. Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `EventDetailScreen` | `components/screens/EventDetailScreen.tsx` | Full event detail rendered inside `event/[id]` modal |
| `MatchScreen` | `components/screens/MatchScreen.tsx` | People discovery UI |
| `EventCard` | `components/EventCard.tsx` | Event list item |
| `NearbyEventCard` | `components/NearbyEventCard.tsx` | Compact nearby event card |
| `OptimizedImage` | `components/OptimizedImage.tsx` | `expo-image` wrapper with placeholder/fallback |
| `ScalePress` | `components/motion/ScalePress.tsx` | Pressable with haptic feedback + scale animation |
| `FadeInUp` | `components/motion/FadeInUp.tsx` | Animated entrance wrapper |
| `Skeleton` | `components/Skeleton.tsx` | Loading shimmer placeholder |
| `Toast` | `components/Toast.tsx` | Global toast notification system |
| `AppHeader` | `components/AppHeader.tsx` | Reusable screen header |
| `RealtimeStatusBanner` | `components/RealtimeStatusBanner.tsx` | Socket connection status indicator |
| `PhotoManager` | `components/PhotoManager.tsx` | Photo upload/manage UI |
| `PhotoLightbox` | `components/PhotoLightbox.tsx` | Full-screen photo viewer |
| `ActionTray` | `components/ActionTray.tsx` | Bottom action sheet |
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | React error boundary at root |
| `VirtualizedList` | `components/VirtualizedList.tsx` | Performance-optimized list wrapper |
| `LazyWrapper` | `components/LazyWrapper.tsx` | Deferred render wrapper |
| `OnboardingProgressBar` | `components/OnboardingProgressBar.tsx` | Onboarding step indicator |
| `Typography` | `components/Typography.tsx` | Text component variants |

---

## 11. Utility Libraries

| File | Purpose |
|------|---------|
| `lib/queryCache.ts` | In-memory TTL+LRU cache (max 500 entries, default 5 min TTL). Used independently of `apiClient`'s response cache. |
| `lib/eventDetailCache.ts` | Dedicated cache for event detail data to prevent re-fetches when opening/closing the modal. |
| `lib/chatListUpdates.ts` | Helpers for updating the chat list (group + DM) in response to socket messages without full refetch. |
| `lib/subscriptionManager.ts` | Collects socket subscription cleanup functions and disposes them as a group (useful in `useEffect` returns). |
| `lib/notifications.ts` | Expo push token registration, notification listeners, and deep-link handling from notification taps. |
| `lib/photoUtils.ts` | Resize images with `expo-image-manipulator`, get presigned S3 URLs, and upload via PUT. |
| `lib/networkStatus.ts` | Lightweight `isOnline` flag with `markOnline()` / `markOffline()` and subscriber callbacks. |
| `lib/globalText.ts` | Imported once in `_layout.tsx` — monkey-patches the global `Text` component for font overrides and disables font scaling. |
| `lib/logger.ts` | `Logger.debug/info/warn/error('module', 'message', data?)` — structured, filterable logging. |
| `lib/motion.ts` | Animation utility functions wrapping Reanimated (timing helpers, spring configs). |
| `lib/safetyUtils.ts` | Block/unblock user helpers and blocked-user list management. |
| `lib/unread.ts` | Unread message/notification count tracking across chat groups and conversations. |
| `lib/time.ts` | `formatRelativeTime`, `formatEventDate`, and other date helpers. |
| `lib/typography.ts` | Font size scale constants used across `Typography` component. |
| `lib/uxStandards.ts` | UX guideline constants (min tap targets, animation thresholds, etc). |
| `lib/supabase.ts` | Legacy Supabase client — retained but mostly superseded by `apiClient`. |

---

## 12. Environment & Config

### `.env` (blendn/ root)

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000   # blendn-admin server URL
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
```

`EXPO_PUBLIC_API_BASE_URL` is required at build time — `apiClient.ts` throws on startup if missing.

The socket client also reads `EXPO_PUBLIC_API_BASE_URL` for its WebSocket URL.

### `app.json` notable settings

- `newArchEnabled: true` — React Native New Architecture is on.
- `scheme: "blendn"` — deep link scheme.
- `userInterfaceStyle: "automatic"` — respects system dark/light mode (UI is dark by default).
- iOS `GIDClientID` injected from env for Google Sign-In.

### `eas.json` build profiles

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  }
}
```

---

## 13. Build & Deploy

### Development

```bash
npm install
npx expo start          # Metro bundler — press i/a/w
npm run ios             # iOS simulator
npm run android         # Android emulator
```

### EAS Cloud Builds

```bash
npm run build:ios       # eas build --platform ios
npm run build:android   # eas build --platform android
npm run build:all       # both platforms

npm run submit:ios      # submit to TestFlight
npm run submit:android  # submit to Play Store
```

### GitHub Actions CI

Configured to trigger on version tags (`v*`) and manual dispatch for iOS builds → TestFlight.

---

## 14. Patterns & Conventions

### Data fetching

```ts
// In a screen component
const [data, setData] = useState(null)

const fetchData = useCallback(async () => {
  const result = await apiClient.getEvents()
  if (result.success) setData(result.data)
}, [])

const socketStatus = useLiveSync({
  onSync: fetchData,
  domains: ['events'],
  syncOnFocus: true,
  disconnectedIntervalMs: 15_000,
})
```

### API response check

Always check `result.success` before using `result.data`. The client never throws — it always returns `ApiResponse<T>`.

### Logging

```ts
import { Logger } from '../lib/logger'
Logger.info('screen', 'Event loaded', { eventId })
Logger.error('screen', 'Fetch failed', { error })
```

Module name (first arg) is used for filtering. Never use `console.log`.

### Image display

Use `OptimizedImage` instead of `<Image>` for automatic placeholder and fallback handling.

### Pressables

Use `ScalePress` from `components/motion/ScalePress.tsx` for any tappable element that should have haptic feedback and a scale animation.

### No test runner

There are no unit tests. Verification is done manually via simulator/device.

### snake_case vs camelCase

The REST API returns camelCase. `lib/api.ts` wraps `apiClient` and also adds snake_case aliases for historical consumers. Prefer camelCase for new code; the `EventApiItem` type documents both forms.

---

## 15. Mobile API Endpoints

All under `/api/mobile/*` — JWT Bearer auth required unless noted.

### Auth

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/mobile/auth/google` | No |
| POST | `/api/mobile/auth/signin` | No |
| POST | `/api/mobile/auth/signup` | No |
| POST | `/api/mobile/auth/signout` | Yes |
| POST | `/api/mobile/auth/refresh` | No |
| GET | `/api/mobile/auth/session` | Yes |

### Events

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/mobile/events` | List + filters + pagination |
| GET | `/api/mobile/events/:id` | Single event detail |
| PATCH | `/api/mobile/events/:id` | Organizer update |
| DELETE | `/api/mobile/events/:id` | Organizer delete |
| POST | `/api/mobile/events/:id/checkin` | GPS check-in |
| POST | `/api/mobile/events/:id/checkout` | Check-out |
| GET | `/api/mobile/events/:id/checkins` | Attendee list |
| POST | `/api/mobile/events/:id/favorite` | Toggle favorite |
| POST | `/api/mobile/events/:id/interest` | Toggle interest |
| POST | `/api/mobile/events/:id/rsvp` | RSVP |
| DELETE | `/api/mobile/events/:id/rsvp` | Cancel RSVP |
| POST | `/api/mobile/events/:id/rating` | Rate event |
| POST | `/api/mobile/events/:id/announce` | Send announcement |
| GET | `/api/mobile/events/:id/chat` | Event chat group info |
| GET | `/api/mobile/events/:id/interested-users` | Interested users list |
| POST | `/api/mobile/events/checkins/batch` | Batch check-in status |
| POST | `/api/mobile/events/interests/batch` | Batch interest status |
| POST | `/api/mobile/events/interest-counts/batch` | Batch interest counts |
| GET | `/api/mobile/checkins/active` | Current user's active check-ins |

### Profiles

| Method | Path |
|--------|------|
| GET | `/api/mobile/profiles/:userId` |
| PUT | `/api/mobile/profiles/:userId` |
| GET | `/api/mobile/profiles/:userId/interests` |
| POST | `/api/mobile/profiles/:userId/interests` |
| DELETE | `/api/mobile/profiles/:userId/interests/:categoryId` |

### Users

| Method | Path |
|--------|------|
| GET | `/api/mobile/users/:userId` |
| GET | `/api/mobile/users/:userId/favorites` |

### Chat

| Method | Path |
|--------|------|
| GET | `/api/mobile/chat/groups` |
| GET | `/api/mobile/chat/groups/:id/messages` |
| POST | `/api/mobile/chat/groups/:id/messages` |
| GET | `/api/mobile/chat/groups/:id/participants` |

### Private Conversations

| Method | Path |
|--------|------|
| GET | `/api/mobile/conversations` |
| POST | `/api/mobile/conversations` |
| GET | `/api/mobile/conversations/:id` |
| DELETE | `/api/mobile/conversations/:id` |
| GET | `/api/mobile/conversations/:id/messages` |
| POST | `/api/mobile/conversations/:id/messages` |

### Message Requests

| Method | Path |
|--------|------|
| POST | `/api/mobile/message-requests` |
| GET | `/api/mobile/message-requests` |
| POST | `/api/mobile/message-requests/:id/respond` |

### Uploads

| Method | Path |
|--------|------|
| POST | `/api/mobile/uploads/presigned-url` |
| DELETE | `/api/mobile/uploads/delete` |

### Misc

| Method | Path |
|--------|------|
| GET | `/api/mobile/categories` |
| POST | `/api/mobile/notifications/token` |
| DELETE | `/api/mobile/notifications/token` |
