# Bengaluru scenario reseed (2026-09-28) — PLAN, awaiting sign-off

Goal: remove every Bangalore/Bengaluru event on staging, seed a fresh, fully-detailed set covering every lifecycle state the backend + app distinguish.

## Script: `blendn-admin/scripts/seed-blr-scenarios.ts` (new)
- [ ] Dry run by default; `--apply` writes; `--refresh-times` re-anchors times to now (live/ended states drift)
- [ ] Guard: `environmentRefusal` (staging or localhost only), prints DB host first
- [ ] Purge: soft-delete (`deleted_at = now()`) every event where `city ILIKE 'bengaluru' OR 'bangalore'` (matches seed-qa convention; no cascade through check-ins/chat). Print count + slugs before writing
- [ ] Seed via Prisma, slugs prefixed `blr-`, idempotent upserts; city spelled `Bengaluru`, tz `Asia/Kolkata`
- [ ] Reuse, don't re-implement: `syncOccurrences` (check-in needs occurrence rows), `cover`/`mirrorToTigris` from seed-media, test accounts + seed-qa attendees, existing categories/amenities vocab

## Every event gets
title, description, short_description, address, postal_code, venue_name, lat/lng inside Bengaluru, geofence/radius, cover, 2-4 `event_media` images, primary+secondary category, 3-6 amenities, `event_details` (full_description, house_rules, cancellation_policy, FAQ, accessibility_info, additional_info), max_capacity, organiser + org, occurrences

## Scenario matrix (offsets from now)
| # | Scenario | Start / end | Extra data |
|---|---|---|---|
| 1 | Upcoming, next week | +6d / +6d3h | RSVPs, favourites |
| 2 | Tomorrow | +1d / +1d3h | |
| 3 | Tonight (today, ≥17:00 IST) | today 20:00 | |
| 4 | Starting soon — check-in window open (<90 min) | +45m / +3h | reminder window (60–75 min) not claimed |
| 5 | Reminder due | +65m / +4h | `reminded_at` null |
| 6 | Just started | −10m / +3h | check-ins |
| 7 | Live, mid-way, busy | −2h / +2h | 6 check-ins, open chat room, messages, announcement |
| 8 | Ending soon | −3h / +15m | |
| 9 | Ended <24h ago (room still open, rate CTA) | −6h / −2h | check-ins, ratings from some attendees |
| 10 | Ended >24h ago (room archived) | −3d / −3d+3h | archived chat group |
| 11 | Cancelled (with RSVPs → shows on Going) | +2d | status cancelled |
| 12 | Almost full (≤10 spots) | +3d | capacity 20, 12 going |
| 13 | Full → waitlist | +3d | capacity 6, 6 going, 1 waitlisted |
| 14 | 18+ / 21+ age gated | +4d | min_age 21 (teen tester must not see) |
| 15 | Multi-day, one day cancelled, currently on day 2 | −1d / +2d | occurrence `cancelled_at` on day 3 |
| 16 | No cover image | +2d | coverless card, excluded from Featured |
| 17 | Video media | +1d | video `event_media` with thumbnail |
| 18 | Locked chat (read-only) | −1h / +2h | chat_group status locked |
| 19 | Curated / unclaimed | +5d | curated_at, source_url |
| 20 | Door policy guest-list | +5d | door_policy guest_list |
| NEG | Draft, private, unlisted, soft-deleted | +2d | must NOT appear in feed/search |

## Sheets (follow-up)
- [x] Search field: focus ring fades in; clear button scales
- [x] Sheets slide back down on close instead of fading (`SheetModal` holds the Modal until `RisingSheet`'s exit ends) — filter, bell, city picker, both connect sheets
- [x] Grab anywhere and drag down to dismiss; lists hand the finger to the sheet at their top (`SheetScrollView`/`SheetFlatList`); the dim thins with the drag; bell loses pull-to-refresh (it reloads on open)

## Verify
- [ ] Dry run output reviewed; apply on staging; re-run is a no-op
- [ ] API: `/api/mobile/events?city=Bengaluru` returns expected set, negatives absent (30s cache)
- [ ] App: Pulse sections, detail CTAs (rsvp / join / rate / ended), Going (cancelled, waitlist, rate), rooms (open / locked / archived), check-in on live event

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
