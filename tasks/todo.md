# Blend'n centre redesign (2026-09-28)

Decided with the user: **one screen, two modes** (Tonight → Room), **chat docked in the Room**, **mobile + small backend adds**, **full-screen, opens out of the centre button**.
Research: Refero (X Spaces roster, amo dwell time, Bump time ring, Luma LIVE/IN 2H + check-in sheet, 222 blank matches, TikTok LIVE podium + "next update", Around reactions, Telegram polls) and 60fps (Opal hold-to-commit, Trackables card→screen, Habitastic digit roll, Airbnb add-guests, Eimi pull-to-star, Honk heart arcs, Grok pull-down-back).
Rules: tokens only (lib/theme, lib/motion), flat, no glow/blur/loops, accent once per screen, transform/opacity only, interruptible, haptics on real events, Reduce Motion → fades.

## Route
The Blend'n screen is an **overlay hosted by the tab layout** (a modal route put pushed screens underneath it on iOS). `/room` only opens the overlay. `nearby-events` stays as "See everything nearby" from Tonight.

## Backend (blendn-admin) — contract
- [x] `event:checkin`, `event:room:checkin`, `event:checkout` payloads gain `hereCount`
- [x] mutual like emits `room:match` to `user:{A}` and `user:{B}`: `{ eventId, otherUserId, conversationId, name }` (name = how the other appears to you)
- [x] `GET /api/mobile/events/[eventId]/room-preview` → `{ hereCount, tasteMatchCount|null }` (null under 3 here; blocked excluded)
- [x] `POST /api/mobile/events/[eventId]/waves` `{ toUserId }` → both checked in, not blocked, 1 per pair / 10 min; emits `room:wave` to `user:{to}` `{ eventId, fromUserId, fromName }`
- [x] tests

## Mobile data
- [x] `lib/useRoom.ts`: roster, live arrivals/checkouts, hereCount, like/connect/safety, wave, match events — lifted from MatchScreen
- [x] `lib/roomMoments.ts` (pure, tested): meet-next picks + 15-min shuffle window, reason line, time-here label, arrivals queue
- [x] `lib/useCheckInFlow.ts`: the event screen's check-in flow (rules, location, refusals, reveal, intent) shared with Tonight
- [x] apiClient + socketClient for the new endpoints/events; polls + chat reactions clients

## Screen
- [x] Centre button: squash on press, container-transform open (accent disc → page)
- [ ] Centre button: real unread badge (roomUnread is still never passed)
- [x] Tonight mode: LIVE / IN 2H list with rolling counts, taste-match teaser (blank faces), venue pass docked + **hold to check in** → pass grows into the Room
- [x] Room mode: status strip (● LIVE · rolling count · title), time-here ring on your avatar, arrivals row (faces spring in), Meet next top 3 + "Next shuffle" countdown, 3-column face grid w/ one reason each
- [x] Person card: expands from face, pull down to close, double-tap / pull to like, wave, connect, safety
- [x] Match moment: hearts arc your face → theirs, avatar bump, success haptic, "Say hi" opener
- [x] Chat dock: last 2 messages + composer, arrivals/waves/matches as system lines, drag up → full chat
- [ ] Polls + reactions UI (API clients exist: votePoll, reactToChatMessage)
- [x] Swipe down to close

## Verify
- [ ] Rewrite the source-grepping room/MatchScreen tests as behaviour tests
- [ ] jest + lint + lint:design, admin tests
- [x] Simulator: Room mode against staging (seeded live account) — screenshot
- [ ] Simulator: Tonight deck (fixture `preview/tonight`), hold-to-check-in, match moment, drag-to-close
- [x] Tonight cards → swipeable deck like the Me tab photo stack (user ask, mid-build); PhotoStack now shares `SwipeDeck`

# Bengaluru scenario reseed (2026-09-28)

Script: `blendn-admin/scripts/seed-blr-scenarios.ts` (+ `seed-blr-photos.json`). Dry run by default, `--apply` writes, staging/localhost only.

- [x] Soft-delete every other Bangalore/Bengaluru event (QA world included — re-running seed:qa brings its events back)
- [x] 26 events (`blr-*`): upcoming, tomorrow, tonight, check-in open, reminder due, just started, live+busy, ending soon, locked room, multi-day w/ cancelled day, ended <24h (rate), ended >24h (archived room), ended last week, cancelled, almost full, full→waitlist, 21+ guest list, 18+ members-only, curated unclaimed, curated claimed, video, recurring/uncapped; negatives: draft, private, unlisted, deleted
- [x] Every event: 4 verified Unsplash photos (cover + 3 gallery), full copy, event_details (all fields), categories, amenities, linked venue + geofence, occurrences; RSVPs/interest/check-ins/presence/ratings/rooms/announcements/feedback/sponsors where the scenario needs them
- [x] Tested on a throwaway local Postgres (migrations + seed-categories + seed-qa, then this script, twice)
- [x] Applied to staging 2026-09-28 ~02:40 IST: 35 events soft-deleted, 26 seeded; staging-api feed shows the 18 visible blr- events, nothing else

- [x] Crowd: 48 non-login profiles (`scripts/seed-blr-crowd.ts`, `@crowd.blendn.invalid`), full profiles + age-matched Unsplash portraits, spread across events within capacity; applied to staging
- [x] Fixed: purge had hidden 12 `me-demo-*` Me-tab events another session seeded — restored, and `me-demo-` is now excluded

- [x] `scripts/seed-blr-my-banter.ts`: hemanth@unbothered.studio live at the AI meetup, 3 attended, 3 rooms w/ unread, 5 matches (via openConversation), 2 incoming likes, 1 outgoing, 2 message requests — applied to staging. Run after seed-blr-scenarios.

## Review
- Idempotent: second `--apply` left identical row counts
- Feed as Ananya: 18 events, no negatives, all with cover + gallery. Teen tester: 13 (5 age-gated hidden)
- Detail: unlisted 200, private/draft/deleted 404, cancelled 200
- Going: cancelled + waitlisted RSVPs; attendance: 3 past events
- Check-in: too early refused, 653m out refused, live at pin OK, pre-start in 90-min window OK
- Known app gaps (not seeded wrong): doorPolicy not passed to the detail hero, no 18+/completed UI, is_featured unused

# Motion: Pulse + event screens (2026-09-28)

Inspiration: 60fps.design (Airbnb tactile tab button, Wabi fade reveal, Moods pills). Glow/bloom shots excluded per lessons.md.
Rules: lib/motion.ts tokens, components/motion primitives, useReducedMotion, no layout transitions on blur/shadow views, no glows/pulses.

## Pulse (`app/(tabs)/events.tsx`, `components/pulse/*`, `EventCard`)
- [x] Card presses scale instead of dimming: FeaturedCard, UpcomingCard, EventCard (ScalePress, no haptic — navigation)
- [x] Header controls scale: city chip, filter button, section-header actions, bell
- [x] FeedMedia crossfades between playlist frames instead of cutting
- [x] First screenful of list rows fades up in a stagger after the skeleton (once, not on every refetch)
- [x] Search: clear button and refine spinner fade in/out
- [x] EventCard: checked-in/distance badges pop in; button spinner swap fades

## Scene (`EventDetailScreen`, `components/scene/*`)
- [x] Sections below the hero fade up once on load
- [x] CTA icon (spinner → icon, radio → check) enters with a pop
- [x] Interest count rolls (keyed rise) when it changes
- [x] FAQ: chevron rotates, answer fades in, row gets press feedback
- [x] Map fades in instead of popping

## Nearby events + Going
- [x] Nearby: skeleton instead of spinner; rows and empty/error states fade up in a stagger
- [x] Going: fade from skeleton into the list (comment promises it); next-up card + actions scale on press

## Verify
- [x] tsc, lint, lint:design, full jest after the last edit (1114/1114)
- [ ] Device feel-check of every item (computer use unavailable; Metro bundle builds, 1114/1114 tests)

# Design system + Pulse layout fix

## Why
- 304 hard-coded `fontSize` values in 62 files, 24 different sizes; only 103 uses of the `EMBER_TYPE` tokens.
- 15 different horizontal paddings, 15 different gaps.
- Two type systems: `EMBER_TYPE` in `lib/theme.ts` and the older `lib/typography.ts` + `components/Typography.tsx` (3 users).
- Nothing stops a new screen from adding a 25th size.

## Phase 1: Tokens (`lib/theme.ts`)
- [x] `SPACE`: 4 / 8 / 12 / 16 / 24 / 32 / 48. `GUTTER = 24` (screen side margin, one value).
- [x] `TYPE`: 8 roles, each font + size + line height + tracking.
      display 34/38 · title 24/30 · heading 20/26 · body 16/24 · bodyStrong 16/24 ·
      meta 13/18 · label 12/16 caps · tab 11/14
- [x] `ICON`: 16 inline, 20 in controls, 24 navigation.
- [x] `CONTROL`: one height for fields and pills (48), one pill fill.
- [x] Accent rule written down: one accent element per screen, plus the active tab.

## Phase 2: Primitives (`components/ui/`)
- [x] `<Text variant="heading">`: the only way to set type. Replaces `Typography.tsx` and `...EMBER_TYPE.x` spreads.
- [ ] `<Screen>` — skipped: screens' scroll structures differ too much; `GUTTER` constant used instead.
- [ ] `<Section>` — skipped: existing `SectionHeader` retokenised instead.
- [ ] `<Pill>` / `<Field>` — not built; `CONTROL` heights + `EMBER.surface` fill applied per call site. Worth extracting next.

## Phase 3: Enforcement
- [x] Jest test `__tests__/designTokens.test.ts` (same pattern as `fonts.test.ts`): fails on raw
      `fontSize` / off-scale `padding`/`gap` in any file not on a shrinking legacy allowlist.
      New files must use tokens; migrated files come off the list.
- [x] `docs/DESIGN_SYSTEM.md` + a pointer in `AGENTS.md` so agents use tokens.

## Phase 4: Pulse screen (first migration)
- [x] Featured card left-aligned to the gutter, not centered (`featuredCardLayout`); fix `snapToInterval`.
- [x] Vertical rhythm: bar→title 16, title→search 16, search→section 32, heading→content 16, card→tab bar 24.
- [x] Header: title 34, city chip + search + filter one height and one fill; right edges aligned (bell).
- [x] FILTER becomes a pill/icon button; tag becomes a small label (12 caps) on a readable backing.
- [x] Card title 24/30, 2 lines; details 13 meta; card keeps its bottom edge (hairline + lighter scrim).
- [ ] Duplicated venue text (title and place both name the venue) — data, not layout; not changed.
- [x] Orange only on "Pulse" in the title (or the active tab) — logo, FILTER, tag go neutral.
- [x] Tab labels 11, icons 24, one stroke style.

## Phase 5: Roll out
- [x] Migrated everything in one pass (user chose "everything at once"); 5 parallel subagents on disjoint file sets.

## Verify
- [x] `npm test`, `npm run lint`, typecheck.
- [ ] Screenshot Pulse on a device — BLOCKED: no iOS simulator runtime installed; web build fails on react-native-maps.

## Open decisions
- Figma frame `1141:*` specifies the 48pt title and 16pt everywhere. This plan departs from it —
  record the departures in `docs/PULSE.md` for the designer.

## Review (2026-09-27)
- Violations: 807 in 71 files → 0. 13 `design-exception`s (emoji/glyph sizes, 21pt Google/email labels matching Apple's button, ring centring, one CTA padding to land on 56).
- Tests: 1030/1030 pass. tsc clean. Lint: only the 3 pre-existing warnings in EventDetailScreen.
- Removed: `components/Typography.tsx`, `lib/typography.ts`, 3 unused font weights (PJ 400/600, Manrope 500), `PROFILE_GUTTER`/`PROFILE_SECTION_GAP`.
- Tests that pinned Figma values updated: pulseCardGeometry, pulseNav, gridFilters, sceneCta, profileScreen, meAndSettings.
- Not verified visually. Risks flagged by agents: Going action chips may wrap to 2 rows; 24pt titles on fixed-height Going/Nearby covers; AppHeader `display` title may truncate beside back + Save; edit-profile inputs ~279pt wide on SE.
- Follow-ups: some tests still pin frame values that keep things off-scale (matchOpener minHeight 68, sceneCta amenity 126 / Like gradient, profile bio lineHeight 26); `APP_*` still exported for `lib/uxStandards.ts`; extract Pill/Field primitives.

---

# Add to calendar after "I'm going"

## Goal
When someone taps **I'm going** on an event and the RSVP succeeds, offer to put the event in their calendar
(iPhone Calendar, Google Calendar, Outlook, whatever the phone uses). Always optional, never automatic.

## Where it hooks in
- Only RSVP path: `handleToggleRsvp` in `components/screens/EventDetailScreen.tsx:445`, success branch after
  `setRsvpStatus(result.data.rsvpStatus)`.
- Prompt UI: the existing `showTray` / `ActionTray` (no new modal component).
- Event data already on screen: `title`, `startTime`, `endTime`, `timezone`, `venueName`, `address`, `city`, `slug`.

## Approach
1. **Device calendar (main option):** `expo-calendar`'s `createEventInCalendarAsync` opens the OS "New Event" sheet
   already filled in. The user picks the calendar and taps Add. That covers iPhone Calendar and, on Android, the
   default calendar app (usually Google Calendar). We never read their calendars.
2. **Google Calendar link (second option, mainly for iPhone users who live in Google):**
   `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…&location=…`
   opened with `Linking.openURL`. No SDK, no auth.
3. Fallback if the native call throws: fall back to the Google link.

## Tasks
- [ ] `npx expo install expo-calendar`; add its config plugin to `app.json` with calendar permission strings.
      Confirm on a device whether the system sheet needs a permission prompt on iOS 17+ (expected: no).
- [ ] `lib/calendarEvent.ts` (pure, no RN imports): `toCalendarEvent(event)` → `{ title, startDate, endDate, location, notes, url }`
      and `googleCalendarUrl(event)`. Rules:
      - End time missing or before the start → start + 2h.
      - Dates as UTC (`YYYYMMDDTHHmmssZ` for Google), so the phone's time zone cannot shift them.
      - Location = venue name + address + city. Notes = short description + deep link to the event.
- [ ] `lib/addToCalendar.ts`: `addToDeviceCalendar(event)` and `openGoogleCalendar(event)`. Handle cancel quietly,
      show a toast on save, log failures to `Logger`.
- [ ] `EventDetailScreen`: after a successful RSVP with status `going`, show a tray:
      "You're going 🎉 / Add it to your calendar?" → **Add to calendar** (primary) · **Google Calendar** · **Not now**.
      - `waitlisted`: keep the waitlist tray, no calendar prompt. Offer it later if they are moved to going.
      - Undoing the RSVP: no prompt, and we don't touch their calendar.
- [ ] Lasting entry point: tapping "You're going" cancels the RSVP, so add a small **Add to calendar** row/icon on the
      event detail screen while status is `going` (for people who tapped Not now or want it later).
- [ ] Tests (`__tests__/calendarEvent.test.ts`): date formatting, missing/invalid end time, location assembly,
      URL encoding of special characters, timezone correctness (UTC output for a non-UTC event).
- [ ] Verify on a device: iOS (Calendar sheet + Google link) and Android (intent). Needs a new dev/EAS build because
      `expo-calendar` is native code, so it can't ship over the air.

## Out of scope (possible follow-ups)
- Auto-updating the calendar entry when the organiser changes the time. Would need a subscribable `.ics` feed from
  blendn-admin (`GET /api/mobile/events/[eventId]/ics` or a per-user feed).
- Removing the entry when the RSVP is cancelled.
- Prompting on "save"/favourite (`/favorite`, `/interest`). Only the RSVP asks.

## Open questions
- Ask on every RSVP, or offer "Don't ask again"? Suggestion: ask every time (RSVPs are rare) and rely on the lasting button.
- Should the notes link be an https universal link to the event, or the app's deep-link scheme?

---

# Flow fixes — the 9 problems from the flow audit (2026-09-27)

Branch: `fix/flow-audit` off `dev` (app). Admin change on its own branch in `blendn-admin`.
One commit per fix. Full `npm test` + `./scripts/typecheck.sh` + `npm run lint` after the **last** edit (lessons.md).

## Findings that changed the plan
- `profiles.onboarded` is `false` for nearly every account made before 2026-08-10 (never backfilled). Gating on it alone would drag long-time users into onboarding.
- No API lists a user's RSVPs. Favorites == "interest" (same `event_favorites` table). `GET /me/attendance` exists but the app never calls it.
- The Rate screen rates *people* (mutual likes) after an event, via `peer-ratings`.
- Settings deliberately has no About-you link (`meAndSettings.test.ts` "leaves no second door"); edit-profile already renders the same `MatchingFields`.
- `getActiveCheckins` is SWR-cached 30s and `checkIn`/`checkOut` never invalidate it; `fetchPolicy.test.ts` forbids new `force: true` call sites.

## Tasks
- [x] 1+3 **Going tab shows what you're going to, and past events to rate**
  - [x] admin: `GET /api/mobile/me/rsvps` — caller's upcoming `going`/`waitlisted` RSVPs, scoped by construction like `/me/attendance`
  - [x] app: `apiClient.getMyRsvps()`, `apiClient.getMyAttendance()`
  - [x] going.tsx: sections Going (RSVPs, waitlist label) · Saved (favorites) · Past (attendance → "Rate people" → `/rate/[eventId]`); a 404 from an old server hides the section, it does not fail the tab
  - [x] docs/NAVIGATION.md: drop the stale "rate linked from nowhere"
- [x] 2 **Reminders follow RSVP and interest everywhere** — `lib/eventReminder.ts` `syncEventReminder(event, on)`; call from Pulse interest, detail interest, detail RSVP (on for going/waitlisted, off on cancel)
- [x] 4 **About-you** — remove the orphaned route (edit-profile covers editing; onboarding covers first run); move its source-grep tests to edit-profile / onboarding
- [x] 5 **Onboarding resume survives reinstall** — pass `finishedOnServer: user.profile?.onboarded === true`; treat `!onboarded && createdAt >= ONBOARDING_LAUNCH (2026-08-10)` as a new account; unit tests in onboarding.test.ts
- [x] 6 **One check-in** — `lib/checkIn.ts` owns the API call, timeout, refusal mapping (`checkInRefusal`), and the post-check-in decisions (askIntent, reveal warning); both screens keep their own trays. Pulse gains the real refusal copy + Open Maps. Update source-grep tests to point at the helper.
- [x] 7 **One check-out** — `lib/checkOut.ts` `checkOutOf(eventId)`: API call + cache invalidation + room-change signal; used by room, Pulse, PresenceMonitor; delete the dead `lib/api.ts` helpers
- [x] 8 **Room button updates at once** — apiClient invalidates `/checkins/active` on check-in/out success; `roomSignal` gains a `checkInChanged` publish the tab bar subscribes to; also re-read on app foreground
- [x] 9 **Notification taps survive sign-in** — `lib/pendingRoute.ts`: signed out/loading → store the target; guard sends there after sign-in (after onboarding if resuming). Fix the cold-start race: a stale guard `run()` must not replace a screen pushed during its await.

## Out of scope
- Push prompt to rate after an event (server job) — follow-up.
- Merging the two check-in *trays* into one component.

## Review (2026-09-27)

App `fix/flow-audit` (6 commits): ea3966b onboarding resume · eb04d08 notification taps · 4432989 reminders · b1cbc14 About-you removed · 69a2492 one check-in/out + room button · c672f86 Going tab.
Admin `feat/me-rsvps` (1 commit): a9b321a `GET /api/mobile/me/rsvps`.

Verified: app `npm test` 88 suites / 1061 tests, `./scripts/typecheck.sh` OK, lint 0 errors (3 warnings already on dev). Admin unit suite 237 suites / 2847 tests, tsc clean; `me-rsvps` + `me-attendance` integration tests pass on a throwaway local Postgres built with `migrate deploy` (not the Railway DB in .env), with a negative control recorded in the commit.

Not verified: nothing driven on a simulator or device.

Changes from the plan:
- Fix 5 mirrors the server's `mayParticipate` (onboarded OR adult age), not a sign-up date cutoff.
- Fixes 6–8 are one commit; they share `lib/checkIn.ts`.
- Extra: tapping the `event_reminder` push opened nothing (fixed in 9); the Google Maps opener was extracted to `lib/openInMaps.ts`.

Follow-ups:
- Un-hearting on the Pulse cancels the reminder even if you are going; the event screen restores it on open.
- If a notification is tapped while signed out, it opens after whoever signs in next; the server still gates it.
- Ship admin before, or with, the app; the app tolerates a 404.

---

# Design-system conformance (2026-09-27)

Audit found ~225 departures from docs/DESIGN_SYSTEM.md that `lint:design` didn't check.

## Phase 1 — tokens, glows, enforcement
- [x] New tokens: `EMBER.scrim/backdrop/bgClear/skeleton/warning/violet/onViolet`, `tint()`, `CONTROL.badge`
- [x] Retire `EMBER_GLOW`, `EMBER_ATMOSPHERE`, `EMBER_RADIUS.input`
- [x] `lib/uxStandards.ts` off `APP_*`
- [x] Checker: raw colour, raw radius, raw lineHeight, textTransform, shadows, BlurView, retired tokens, custom `*Icon` sizes, `APP_*` in lib/ (321 violations / 60 files)
- [x] Fix: auth + onboarding
- [x] Fix: main tabs
- [x] Fix: event screens + preview
- [x] Fix: chat, profile, settings
- [x] Remove `EMBER_TYPE`, `EMBER_GRADIENT`, `EMBER_CONTROL_HEIGHT` from theme; update docs
- [ ] `lint:design` clean, full jest, tsc, eslint

## Phase 2 — one accent per screen
- [x] Rules table in docs/DESIGN_SYSTEM.md (one neutral treatment per element kind); `SWITCH_COLORS`
- [x] Keeper per screen decided (user: "do not ask for inputs")
- [x] Apply across all four areas
- [x] Drop `gradientFrom/gradientTo/onGradientChip` from theme; ban them in the checker
- [x] Independent review of every screen → 30+ follow-ups (Room had 2 accents; Liked button, off switches, Room segment, shared chips vanished; stale comments) → fixed
- [x] Full verification after the last edit: lint:design clean, tsc clean, jest 88/88 · 1063/1063, eslint 0 errors
- [ ] Simulator look-over

## Review
- Checker now also fails on raw colours, raw radii, raw lineHeight, textTransform, shadows, BlurView, retired tokens (EMBER_TYPE, EMBER_GRADIENT, gradientFrom/To, EMBER_CONTROL_HEIGHT, EMBER_RADIUS.input), off-scale `*Icon` sizes, and `APP_*` in lib/.
- Tokens added: EMBER.scrim/bgClear/backdrop/skeleton/warning/violet/onViolet, tint(), CONTROL.badge, SWITCH_COLORS. Removed: EMBER_GLOW, EMBER_ATMOSPHERE, EMBER_GRADIENT, EMBER_TYPE, EMBER_CONTROL_HEIGHT, EMBER_RADIUS.input, gradientFrom/To, onGradientChip, docs/DESIGN_TOKENS.md.
- All surfaces flat: tab bar, Pulse top bar, notification sheet and chat composer lost their blur; tab bar and own chat bubbles lost their orange glow; onboarding lost its atmosphere blobs; every gradient fill is flat accent.
- Accent: at most one per screen (doc table gives one neutral treatment per element kind). Tab-bar disc kept as the brand mark.
- Not checkable by the linter: accent count, one-row-one-fill. Those stay review items.

---

# Tab redesigns after Refero research (2026-09-28)

- [x] Pulse: Upcoming grouped by day, row cards (words left, 96pt photo right); Featured words under a square photo; banner height counted in the fit
- [x] Going: next-up hero (clean photo, "Tomorrow · 6:30 PM", Directions + calendar/share), rest by day, Saved/Past as rows, skeletons; duplicate "Going" label gone; EventCover no longer dims
- [x] Banter: Live now rows, request rows (Accept = the accent), Today/This week/Earlier, fixed-height rows, square room covers; data fixes (member count, room unread, senders, "You:")
- [x] Me: flat header + Edit/Preview, Finish your profile, one stats container (taps → Going), interests, Recent from /me/attendance
- [x] Shared: DayHeading, UpcomingCard note/action, pastEventRows; previews reachable while signed in
- [x] Simulator: every tab screenshotted (Banter populated via preview); lint:design, tsc, jest 89/1113, eslint clean

Server follow-ups: room last-read never advances from the room screen (Banter unread returns on refresh); no mark-room-read endpoint; host/attendee faces/live check-in count for cards.

# User-journey gap audit (2026-09-28)

Four read-only audit tracks (first run, events → room, chat/friends, account/settings). Mobile only; admin needs are noted, not done.
Verified in code before writing: offline sign-out, Android >3-button alerts, settings "pull to retry", placeholder banners.

## P0 — broken for real users
- [ ] Offline or 5xx cold start signs you out: `refreshSession()` returns `=== 'ok'`, so `'failed'` (network/5xx) hits `clearAuthState()` (lib/useAuth.ts:139–166). Keep the session on `'failed'`, clear it only on `'rejected'`
- [ ] Android drops safety buttons: `Alert.alert` with 4–7 buttons (lib/safetyUtils.ts:193 leave, :291 report user, :330 report message). Android shows 3. Move to a sheet

## P1 — dead ends, silent failures, missing confirmations
First run
- [ ] Push permission prompt fires 2s after auth (app/_layout.tsx:257), before the onboarding notifications explainer, which uses up iOS's one-time prompt
- [ ] Onboarding has no way out: no back on basics, no sign-out anywhere in onboarding (wrong Google account, under 18)
- [ ] Onboarding saves fail silently (lib/useOnboarding.ts commit → Logger.warn only)
- [ ] Terms/Privacy are plain text on app/index.tsx:338 and sign-in.tsx:360. The blendn.app links all redirect to the homepage (admin/web need)
- [ ] forgot-password and rate/[eventId] show a "PLACEHOLDER DESIGN" banner to users
Events → room
- [ ] Check-out in BlendnScreen is one tap with no confirmation (TonightView uses HoldToConfirm)
- [ ] The room never ends: `endsAt` is ignored, with no recap and no "rate who you met"
- [ ] The rate screen doesn't show who you're rating, only "1 of N"
- [ ] Event detail network error shows "Event not found" with no retry
- [ ] Cancelling an RSVP or leaving the waitlist takes one tap with no confirmation
- [ ] Tonight fetch error shows as "Nothing on near you" (useTonight has `status:'error'`; TonightView ignores it)
- [ ] No RealtimeStatusBanner in the room
Chat / friends
- [ ] Reactions display, but there's no UI to add them (`reactToChatMessage` has no callers)
- [ ] Group chat header has no options: members, mute, leave (leave/mute API missing, admin need)
- [ ] Blocking from app/user/[id] leaves you on their profile (no `onBlock` → back)
- [ ] Connect flips to "Requested" even when the request fails (app/user/[id].tsx:316–340)
- [ ] Likes from a profile fail silently, and a mutual like there has no match moment
- [ ] Pending friend requests only show inside "Add friends": no badge on the Me tab or /friends
- [ ] Message requests: only Accept/Decline, with no block/report and no tap-through to the profile
- [ ] Chat load failure shows the "start the conversation" empty state (group + DM)
Account
- [ ] Edit profile: back or swipe drops your edits with no warning
- [ ] Settings error says "Pull to retry", but there's no RefreshControl (app/settings.tsx:152)
- [ ] Session expiry sends you to sign-in without saying why
- [ ] Push toggle stays ON when the OS permission is denied, with no Open Settings
- [ ] ErrorBoundary says "contact support", but there's no contact method

## P2 — polish
- [ ] No notification/activity inbox screen (a new screen, so a design decision)
- [ ] No rating prompt/push after an event, and the rate screen's load error shows as "Nothing to rate"
- [ ] `rateEvent` (rate the event itself) has no callers
- [ ] Event shares carry no link. Deep links cover `/f/*` only
- [ ] Ended event CTA is a dead end for non-attendees
- [ ] Organizer is fetched but never shown. No live "N here now" on detail
- [ ] Friend invite: offline looks the same as expired. A signed-out invitee gets no context
- [ ] Interest/work-field pickers have no loading/error states. City has no autocomplete
- [ ] Failed send has no failed bubble or retry. DM long-press has no Copy. You can't delete your own messages. Group menu offers Report on your own messages
- [ ] Report reason is hardcoded to 'other'. DM "Coming soon: Safety options" fallback (private-chat:716)
- [ ] DM header doesn't open the other person's profile. Profile error state has no back button
- [ ] Network errors read as permanent on friend profile, invite and friends/add
- [ ] Sign-out takes one tap. No version footer. Blocked-users load error looks the same as an empty list
- [ ] Pulse has its own check-in path (events.tsx:660–830) alongside useCheckInFlow, so the two will drift
- [ ] Docs: AGENTS.md:94 + CODEBASE_OVERVIEW.md mention the deleted `/onboarding/welcome`. PULSE/ROADMAP still say "friend graph pending"

## Deferred by design (not gaps)
Map view, media in chat, broadcasts frame, message search, per-type notification prefs, data export, forced-update/min-version (needs admin).

## Build plan (2026-09-28) — missing screens & popups
Four parallel tracks, each in its own worktree/branch → PR to dev. Popups use `components/ActionTray` (cross-platform, no Android 3-button limit) and `components/Toast`.
- [x] A `fix/journey-first-run`: offline launch keeps the session + "can't reach Blend'n" screen; session-expired notice on sign-in; onboarding back + sign-out; forgot-password redesign + check-inbox/resend/open-mail; Terms/Privacy linked; onboarding save/picker error states
- [x] B `fix/journey-chat-safety`: safety sheets off Alert (leave/report/block + reason picker); reaction picker; group chat info screen (members); message-request options; DM long-press Copy + own-message rules; DM header → profile; chat load error + retry; failed-send bubble + retry
- [x] C `fix/journey-events-room`: check-out confirm; cancel RSVP/leave waitlist confirm; room-ended recap → rate; rate screen redesign (who you're rating) + error; add-to-calendar on detail; detail/Tonight error+retry; organizer + live count; ended CTA next step
- [x] D `fix/journey-account-friends`: edit-profile discard confirm; sign-out confirm; push toggle ↔ OS permission + Open Settings; settings pull-to-retry; About (version) + Contact support screens; ErrorBoundary contact; blocked-users error; friend requests list + badge; profile error back/block→back/connect+like failure toasts; invite & friend-profile offline vs gone
Admin needs (not done): group leave/mute endpoints, real blendn.app policy pages, min-version.

### Review
Merged to dev 2026-09-28: #310 (A), #311 (C), #312 (B), #313 (D). #313 needed dev merged in twice: `BLENDN_LINKS` deduped into lib/links.ts; Settings push switch clears "Maybe later" then reads the OS permission back. Final branch: tsc clean, lint 0 errors, lint:design clean, jest 1367/1367, CI green.
Not yet verified on a simulator/device.
Admin needs: group chat leave + mute endpoints, room report type, "event ended / rate" push, GET own event rating, public invite preview.

## Simulator QA vs staging (2026-09-28)
Passed: sign-out confirm, About, Contact support, edit-profile discard, DM header → profile, DM long-press (own: Copy; theirs: Copy/Report), report reason sheet, Room info + members, reaction picker (🔥 persisted), rate night → rate people (pseudonym), "By {organizer}".
Found:
- [x] Design Festival (multi-day, blr seed) shows LIVE/"Happening now" but check-in refuses "Event has not started yet" — client live state vs server occurrence disagree (pre-existing)
- [x] Group chat header back button has no accessibilityLabel
- [x] Group chat header subtitle repeats the event title
Untested: room check-out confirm + recap (no live seeded event left on staging), signed-out screens, offline/error states.
Admin: #494 merged, migration applied to staging (yamanote) and verified, promoted dev→staging via #495. NOTE: blendn-admin/.env DATABASE_URL points at PRODUCTION (gondola).

### Round 2 (2026-09-28 ~23:50)
Merged: mobile #315 (leave/mute/report room, own rating, invite preview, header fixes), #316 (multi-day by today's day), #317 (Rejoin re-joins the socket), #318 (check-in prefs designed, CTA reflects check-in); admin #494, #496 → promoted to staging via #495, #497. Staging reseeded (scenarios, crowd, my-banter). blendn-admin/.env → staging (backup .env.bak-prod-*); Railway CLI linked to staging.
Verified on simulator vs staging: mute (DB muted_until), leave → room gone from Banter → "You left this room" → Rejoin (DB active), header a11y + "38 in the room", room check-out confirm, live recap "That's a wrap" (11 min, Rate the night), festival check-in succeeds in today's window, CTA "You're in" after check-in, redesigned prefs screen, "N here now".
Still untested: signed-out screens (forgot password, invite preview on sign-in, onboarding exit), offline/error states, Android.

# Polish pass + identity leak (2026-09-29)

Three read-only audits (~120 items) → three fix batches, all merged to dev green:
- [x] #320 discovery/events: filtered paging, filtered empty state, invisible banner buttons, long-press tip, Nearby dates, room Connect failure, error states, copy, Reduce Motion, room overlay hidden from a11y, Going "Happening now" after midnight
- [x] #321 social/profile: fail-closed profile (`identityVisible`), one avatar seed rule (animal matches pseudonym), optimistic DMs, one accent (white Accept), LoadState, Me tab clearance, blocked-users rebuild
- [x] #322 grid → profile carries `pseudonym` + `roomSeed`
- [x] #323 global: ActionTray safe area + drag-to-dismiss, onboarding keyboard/in-flight guards, textTertiary AA contrast, Alerts → trays/toasts (settings/photoUtils), Dynamic Type caps, tab roles, Android back, toast announcements, plain-voice onboarding copy; new lint:design rules (merged dev in first; fixed 3 literals #320/#321 added)
- [x] admin #498 (→ staging #499): room handles answered in their own room's terms — "Slow Kite" no longer opens as Tanvi Kulkarni

Verified on the simulator vs staging (rebuilt binary incl. #309 UIScene): launch OK; Slow Kite profile shows pseudonym + owl only; tabs hidden from a11y while the room is open; "Happening now" after midnight; avatars match across grid/chat (🦊 Amber Fox, 🐼 Cosmic Panda, 🦦 Quiet Otter); Banter Accept white; Me Settings clears tab bar; room chat header shows the cover; sign-out + delete-account trays clear the home indicator; drag grabber dismisses.

Follow-ups (not done):
- [ ] useScrollToTop on the four tab lists (needs list refs)
- [ ] Remove per-screen `<StatusBar style="light" />` (root sets it) — chat, chat-info, Banter, user, PhotoLightbox
- [ ] Drain `LATE_RULE_ALLOWLIST` in scripts/check-design-tokens.js
- [ ] PhotoManager upload results still `Alert.alert`
- [ ] expo-clipboard (RN Clipboard deprecated) — native dep
- [ ] Pass the MatchMoment opener into the DM as a draft (chat screens need a draft param)
- [ ] Owner decision: roster ignores `friends_see_me_in_rooms` while profile honours it (pre-existing mismatch, see #498)
- [ ] Untested: signed-out screens, onboarding keyboard on device, Android, VoiceOver end-to-end
