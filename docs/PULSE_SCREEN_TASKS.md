# "The Pulse" — Figma vs. Current Implementation

Figma frame: `1141:4643` ("The Pulse"), file `Zi2KcUzhEcLRdqyit22LdQ`.
Current implementation: `app/(tabs)/events.tsx` (the Events/Feed tab) + `app/(tabs)/_layout.tsx`
(bottom nav).

**Status: structurally complete.** Per explicit direction, everything not in the Figma design was
dropped from this screen (location-permission prompt, Interested carousel, "{city}'s Top Events"
carousel, the full paginated event list) and the remaining sections were brought in line with the
design. What's left below is fidelity polish and a few intentionally-stubbed actions, not missing
structure.

---

## Done

- Top app bar → Figma's generic bar (hamburger + accent "Blend'n" wordmark + bell), replacing the
  old personalized greeting bar.
- Featured carousel, Upcoming section (now a horizontal carousel with prev/next nav arrows),
  Nearby Experiences (spotlight card + "Explore the Grid") — all present, matching Figma's section
  structure.
- Nearby spotlight CTA relabeled "Reserve Table" per Figma (same underlying action).
- Real avatar-stack ("Friends are here") sourced from each event's actual `interested_preview`
  data — no mock data.
- Lean empty state when Featured/Upcoming/Nearby are all empty, plus a lightweight functional
  search-results list (Figma doesn't show a results state, but a search box with literally no way
  to see results would be a worse regression than a simple list).
- Bottom nav rebuilt as a full-width blurred bar with top-only rounded corners, relabeled
  Feed/Explore/Circles/Me (routes unchanged — Events/Match/Chat/Profile), plus a "+" as a 5th
  uniform item in the row.
- Floating action button on the Feed screen (glass circle, distinct icon from the nav "+").

## Deliberate deviation from the Figma file

- **Nav "+" is a flat 5th item, not a raised floating button.** Figma shows a 56px gradient
  circle raised above the bar line, overlapping it. That was built, but per your later feedback
  ("keep the plus icon along with the other icons, 5 icons end to end, uniform, no extra spaces")
  it was simplified to a same-size 5th item in the row. Worth knowing this is a deliberate
  divergence from the Figma mock, not an oversight, in case you want the raised treatment back.

## Remaining polish (not structural, low priority)

- **Category chips aren't real blur.** Figma's "Dance"/"Social"/"Workshop" overlay tags and the
  Featured card's category pill use `backdrop-blur`; the current `featuredTag`/`upcomingBentoTag`
  styles use a flat translucent color (visually close, but not true `BlurView` blur like
  `components/ui/GlassSurface.tsx` provides elsewhere). Low-risk swap if you want pixel fidelity.
- **~27 raw hex literals remain** in `events.tsx` (mostly in gradients/shadows) instead of
  `APP_COLORS` tokens — cosmetic/maintainability only, not visible to users.

## Open — no defined behavior yet (stubbed to a "Coming soon" toast)

These all render correctly per Figma but don't do anything real yet, because Figma's mock doesn't
specify behavior and no such feature exists in the app today:
- Hamburger icon (top-left) — Figma implies some kind of menu/drawer; none exists.
- Notification bell (top-right) — no notifications feature/screen exists yet.
- FAB (Feed screen) + nav "+" — Figma calls the FAB "Contextual for Home/Feed" but doesn't say what
  for. Best real candidates from the wider Figma file: create/announce an event, or the deferred
  "Go Live" flow — needs a product decision before wiring either up for real.
