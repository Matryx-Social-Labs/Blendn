# Figma Redesign — Phase 1: Design System + Flagship Screens

Plan: `/Users/hemanth/.claude/plans/velvety-skipping-valiant.md`
Figma: `Zi2KcUzhEcLRdqyit22LdQ` (page "🕓 Updates")

## Design system primitives (`components/ui/`)
- [x] 1. Build `GlassSurface.tsx` — BlurView + tint + hairline border
- [x] 2. Build `Pill.tsx` — glass + gradient variants
- [x] 3. Build `Avatar.tsx` — ring color + status dot, wraps `OptimizedImage`
- [x] 4. Build `GradientButton.tsx` — extracted from `ActionTray.tsx`
- [x] 5. Build `SectionHeader.tsx` — icon + tracked uppercase heading
- [x] 6. Refactor `ActionTray.tsx` to use `GradientButton`
- [x] 7. Add `glass` variant to `AppHeader.tsx`

## Flagship 1: Chat (group + direct) — no backend changes
- [x] 8. Restyle bubbles + header + footer in `app/chat/[id].tsx`
- [x] 9. Restyle bubbles in `app/private-chat/[conversationId].tsx`
- [x] 10. Glass header + `Avatar` ring/status + "ACTIVE NOW" in direct chat (isOnline mocked from typing signal — backlogged real presence)
- [x] 11. Glass composer footer + gradient send button in direct chat
- [x] 12. Mirror header/footer treatment onto group chat

## Flagship 2: My Profile — mostly supported, some fields mocked
- [x] 13. Rebuild `app/(tabs)/profile.tsx` as bento grid (hero, About, Interests, Circle Presence, CTA)
- [x] 14. Mock net-new fields (found occupation/education already existed in the API — only `isPro` badge + attended-event cards are genuinely net-new; both gated to hide gracefully) with `TODO(figma-redesign)`

## Backlog docs
- [x] 15. Write `blendn-admin/docs/FIGMA_REDESIGN_BACKLOG.md`
- [x] 16. Write `blendn/docs/FIGMA_REDESIGN_BACKLOG.md` (mirror, cross-linked)

## Verification
- [x] 17. `npm run lint` (0 errors, only pre-existing warnings), `tsc --noEmit` (0 new errors — found+fixed one `isPro` type gap), confirmed `git diff` scoped to `components/ui/*` (new), `AppHeader.tsx`, `ActionTray.tsx`, `chat/[id].tsx`, `private-chat/[conversationId].tsx`, `profile.tsx`, plus the two new backlog docs. Manual simulator check not run — no simulator session in this conversation; flagged below.

Tracked in parallel via the session task list (TaskCreate/TaskUpdate #1-#17). Check items off here as each completes.

---

# Phase 2: The Pulse — match Figma exactly

Plan: `/Users/hemanth/.claude/plans/velvety-skipping-valiant.md` (overwritten for this phase)
Comparison doc: `docs/PULSE_SCREEN_TASKS.md`
Figma: `The Pulse` node `1141:4643`

Decisions locked in: Feed=Events, Explore=Match, Circles=Chat, Me=Profile (relabel only, nothing
removed); raised nav button + FAB + header hamburger/bell all stub to `useToast` "Coming soon".

## `app/(tabs)/events.tsx`
- [x] 18. Replace top bar with Figma bar (hamburger + "Blend'n" wordmark + bell, both stub to toast)
- [x] 19. Remove non-Figma sections (nearby-permission prompt, Interested carousel, city's Top Events, full EventCard list) + orphaned memo derivations
- [x] 20. Convert Upcoming section to horizontal carousel + prev/next nav arrows
- [x] 21. Fix Nearby Experiences card: "Reserve Table" label, real avatar-stack from `interested_preview`, hide when empty
- [x] 22. Add Feed-screen floating action button (56px glass circle, stub to toast)
- [x] 23. Add lean empty state when Featured+Upcoming+Nearby are all empty (also kept search functional with a lightweight results list, since Figma's search box implies results exist)

## `app/(tabs)/_layout.tsx`
- [x] 24. Remap tab labels/icons (Feed/Explore/Circles/Me) — no route renames
- [x] 25. Rebuild tab bar as full-width blurred bar, top corners only (48px)
- [x] 26. Add raised gradient center nav button (decorative, stubs to toast)

## Verification
- [x] 27. `tsc --noEmit` (0 new errors, 3 pre-existing) + `npm run lint` (0 errors, only pre-existing + 4 documented new warnings from left-in-place profile-fetch state), rebuilt + relaunched on simulator successfully, `git diff --stat` scoped to the 2 files above only

**Phase 2 complete.** Followed up with live simulator screenshot verification + several iterative
fixes to `app/(tabs)/_layout.tsx` (tab bar padding/centering, then simplified to a flat uniform
5-icon row per user feedback) and `app/(tabs)/events.tsx` (FAB spacing/icon).

---

# Phase 3: The Grid (Match/Explore screen) — complete

Comparison doc: `docs/GRID_SCREEN_TASKS.md`. Plan: `/Users/hemanth/.claude/plans/jazzy-churning-platypus.md`.
Figma: `The Grid` node `1141:4951`, same file (`Zi2KcUzhEcLRdqyit22LdQ`).

Six open product decisions resolved with user before implementation: filter chips scoped to
interests-based buckets (no schema change); "Event Room" folded into new Grid/Join-Chat segmented
toggle, "New joins" pill kept as-is; mutual-connections panel omitted entirely (no backlog);
social-linking CTA rendered as inert visual stubbed to toast; pagination switched to infinite
scroll; FAB stubs to "Coming soon" toast.

## Work done
- [x] 28. Extract `components/GlassTopBar.tsx` from `events.tsx`'s inline top bar (hamburger/
  wordmark/bell), parametrized `wordmarkSize`/`topInset`; rewired `events.tsx` to use it (no
  behavior change, removed now-duplicated styles).
- [x] 29. Build `components/GridProfileCard.tsx` — unified profile card: FEATURED tag, 80px ring
  Avatar with live status dot, name/role, CORE EXPERTISE pills (occupation + top interest),
  contextual panel (SHARED INTERESTS when overlap exists, else ATTENDING LIVE from `last_seen`
  recency), "View Dossier" button (flat `#272525`) → `/user/[id]`.
- [x] 30. Rewrote `components/screens/MatchScreen.tsx` presentation layer: added `occupation` to
  `AttendeeProfile` + mapping; added `sharedInterestsFor` helper; unified the old
  "Recommended"/"Also Here" split into one score-sorted list (top = FEATURED); replaced the
  carousel+grid with a single-column `FlatList` + `onEndReached` infinite scroll; added
  interest-frequency filter chips and a Grid/Join Chat `SegmentedControl` (selecting "Join Chat"
  calls the existing `openEventRoom`); new `GlassTopBar` + `GradientText` "The Grid" heading with
  live count/event-name subtitle (subsumes the old "Live at {event}" row); added FAB and an inert
  "Expand Your Circle" social-linking CTA card, both stubbed to toast; deleted `SimilarCard`/
  `StartupItem`/dot-pagination/manual-Load-More dead code. All data-fetching, socket subscriptions,
  safety-menu logic, and `useLiveSync` wiring preserved unchanged.
- [x] 31. Verification: `tsc --noEmit` — 0 new errors (4 pre-existing, none in touched files).
  `npm run lint` — 0 errors, 0 new warnings (fixed one `attendeesTotalCount` unused-var warning by
  using it in the heading subtitle). `git diff` confirmed scoped to `GlassTopBar.tsx` (new),
  `GridProfileCard.tsx` (new), `MatchScreen.tsx`, and an isolated top-bar swap in `events.tsx`.
  Built + launched on iOS simulator successfully; screenshot-verified the Pulse/Events screen
  still renders correctly post-extraction (regression check passed).

**Not verified**: live simulator screenshot of the Grid/Explore screen itself — this session's
XcodeBuildMCP config only exposes build/launch/screenshot tools, no tap/UI-automation, so the
Explore tab couldn't be reached programmatically (deep-link attempts via `simctl openurl` also
failed). A future session with UI automation enabled (or manual tap in the simulator) should
screenshot-verify: top bar wordmark size, heading/count/event-name subtitle, filter chip
filtering, Grid/Join Chat toggle → chat navigation, FEATURED tag on exactly one card, shared-
interest vs attending-live panel variation, infinite scroll, FAB and Connect Socials toasts, and
safety menu.
