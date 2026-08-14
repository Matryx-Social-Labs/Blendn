# Figma Redesign — Mobile Backlog

Source design: Figma file `Zi2KcUzhEcLRdqyit22LdQ` (page "🕓 Updates"), ~30 screens. Backend-side
tracking lives in `blendn-admin/docs/FIGMA_REDESIGN_BACKLOG.md` (mirror of this doc — keep both
in sync). This file is the mobile-side view: exactly where each piece of mocked/placeholder data
lives today, and what changes once the corresponding backend field/endpoint ships.

Design-system foundation (`lib/theme.ts`, `lib/typography.ts`) was already sourced from this
Figma file before this pass started. Phase 1 added a small primitive library
(`components/ui/GlassSurface.tsx`, `Pill.tsx`, `Avatar.tsx`, `GradientButton.tsx`,
`SectionHeader.tsx`) plus a `glass` variant on `components/AppHeader.tsx`, and applied them to
two flagship screens: group + 1:1 chat, and the own-profile ("My Profile") screen.

---

## 1. Mocked / placeholder data in the current implementation

### 1.1 Profile "PRO" badge — `app/(tabs)/profile.tsx`
- **Where**: `isPro?: boolean` field on `UserProfileViewModel` (declared just above the interface,
  marked `TODO(figma-redesign)`); read via `(data as { isPro?: boolean }).isPro` in
  `getUserAndProfile`; rendered as a gradient "PRO" pill in the hero (`!!profile?.isPro && (...)`).
- **Current behavior**: the API never sends this field, so `isPro` is always `undefined` and the
  badge never renders — no fabricated data reaches real users.
- **What changes when the backend field ships**: nothing in the render logic. Once
  `GET .../profile` includes `isPro` (see admin backlog §1.1), the badge appears automatically
  for flagged users. Remove the `TODO` comments once that's live.

### 1.2 "Circle Presence" attended-events — `app/(tabs)/profile.tsx`
- **Where**: the "Circle Presence" card renders the existing real `profile.stats` counts
  (Attended / Favorited / Organized — unchanged, already backend-supported) plus a static
  `"Full event gallery — coming soon"` caption (`styles.circlePresenceNote`).
- **Current behavior**: no fake event cards are rendered — deliberately chose not to fabricate
  specific event titles/images for a section with no real data source, per engineering standards
  in `CLAUDE.md` ("No Laziness... senior developer standards"). Figma's version shows 3 photo
  event-cards; this is intentionally a lighter, honest placeholder instead.
- **What changes when the backend endpoint ships**: replace the stats row + caption with a
  horizontal/vertical list of event cards sourced from the new attended-events endpoint (admin
  backlog §1.2) — reuse `components/EventCard.tsx` or a smaller variant if the full card is too
  tall for this context.

### 1.3 Chat "ACTIVE NOW" presence — `app/chat/[id].tsx`, `app/private-chat/[conversationId].tsx`
- **Where**: `ChatHeader`'s `isOnline` prop in `private-chat/[conversationId].tsx` is currently
  passed `isOtherTyping` (the real, existing typing signal) — see the `TODO(figma-redesign)`
  comment directly above the `ChatHeader` function. `app/chat/[id].tsx` (group chat) doesn't
  render a per-user "ACTIVE NOW" state at all (group chats show typing-count instead, unchanged).
- **Current behavior**: the avatar status dot and "ACTIVE NOW" label only ever show while the
  other participant is actively typing — never a stale or incorrect "online" claim, just an
  under-reporting one (someone reading-but-not-typing shows as offline).
- **What changes when presence ships**: swap `isOnline={isOtherTyping}` for a real presence
  subscription (admin backlog §1.3) — likely a `usePresence(otherUserId)` hook mirroring the
  existing `subscribeToConversation` pattern in `lib/socketClient.ts`.

---

## 2. Design-system primitives added this pass (`components/ui/`)

Reusable across all future screens, not tied to any specific backlog item:

- `GlassSurface.tsx` — blurred "Liquid Glass" panel (BlurView + tint + hairline border).
- `Pill.tsx` — chip/tag, `glass` and `gradient` variants.
- `Avatar.tsx` — circular avatar, optional accent ring + presence status dot.
- `GradientButton.tsx` — gradient/flat CTA button (`primary`/`secondary`/`destructive`); also now
  used internally by `components/ActionTray.tsx` (refactored, no visual change).
- `SectionHeader.tsx` — icon + tracked uppercase heading, used in profile bento cards.
- `components/AppHeader.tsx` gained a `glass` variant (blurred top bar).

## 3. Deferred Figma flows (not touched in Phase 1)

See `blendn-admin/docs/FIGMA_REDESIGN_BACKLOG.md` §2 for the full list and backend implications.
On the mobile side, none of these screens have any implementation yet — routes don't exist for
Go Live, The Hotspot, The Venue, Live Discovery, Popup, Venue Members, The Pulse, The Scene, The
Grid, The Banter, Send Request, Connection Success, Attendee Profile (Figma variant), Bio, Event
Community Chat, or the phone/OTP onboarding sequence (Phone Number, Basic Information, OTP
Verification, Notifications, Location Access, Preferences, Professional Info, Interests & Bio,
Media Upload, Ready to Blend). Pick up from this file + the admin mirror in the next pass rather
than re-deriving scope from the Figma file.
