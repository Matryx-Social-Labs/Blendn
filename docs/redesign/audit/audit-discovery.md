# Blendn client: redesign audit for discovery (Pulse, Scene, Nearby, Event preferences, Rate)

**Source of truth for these screens in the glass / orb / gradient redesign.**
Read-only audit of `the client repo (a clean origin/dev worktree)` at `54481d2` (origin/dev, "feat(board): turn the board on (step 6c) (#362)"), 2026-10-02.
All paths below are relative to that worktree. `file:line` refers to that commit.

Docs read first: `docs/PULSE.md`, `docs/SCENE.md`, `docs/HOMEPAGE_AUDIT.md`, `docs/PLACEHOLDER_SCREENS.md`, `docs/UI_IMPROVEMENTS_PRIORITY.md`, `docs/DESIGN_SYSTEM.md`. Also `tasks/lessons.md`, `lib/theme.ts`, `scripts/check-design-tokens.js`.

**Material legend** used in the component entries (the target redesign):
- **GLASS-CTRL**: translucent floating control and navigation layer (top bar, bar buttons, floating CTA dock, tab bar, pinned search).
- **GLASS-SHEET**: translucent sheet or tray (filters, city picker, notifications, long-press preview, confirm trays).
- **SOLID**: solid content card on the orb backdrop (event cards, location card, amenity tiles, banners, form rows).
- **SCRIM**: element sitting on a photograph (tag pills, heart disc, hero caption, dots, lightbox chrome).
- **ORB**: ambient orange `#F05423` / violet ≈`#8E4BAA` orb backdrop behind page content.

---

## Part 0. Read this first: where the redesign collides with written rules

The direction (glass controls, orb backdrop, brand gradient on the mark and the one primary action, outlined icons, Satoshi, rich motion and haptics) **reverses several explicit, recorded decisions**. Each one is enforced by a doc, a test or a lint, so the redesign brief has to name the reversal or implementation will be blocked or reverted.

| # | Current rule | Where it is enforced | What the redesign needs |
|---|---|---|---|
| 1 | "No shadows, no glows, no `BlurView` glass, no gradient fills." | `docs/DESIGN_SYSTEM.md:123-129`; `scripts/check-design-tokens.js:19,88-95` fails `npm test` on any `<BlurView` or `shadow*` key in `app/` and `components/` | A design-system change: allow a named glass token (blur + tint + hairline) on GLASS-CTRL and GLASS-SHEET only, and update the checker to permit it there |
| 2 | **The owner rejected the frosted-glass CTA with an orange bloom, and the pulsing halo on the room button, as "very AI generated".** "Use a flat, high-contrast fill with no shadow; show status with a still mark, not motion." | `tasks/lessons.md:16`; restated in `components/scene/SceneSections.tsx:757-767` (SceneCTA) and `components/pulse/PulseTopBar.tsx:133-134`, `components/pulse/NotificationBell.tsx:343`, `app/(tabs)/_layout.tsx` barSurface ("no glass (tasks/lessons.md)") | The brief must say explicitly that this is a deliberate reversal and **what is different this time** (glass only on the control layer, never on content; no bloom/halo; gradient only on the mark and the single primary action). Otherwise the next agent reverts it citing lessons.md |
| 3 | Primary button is a **flat `EMBER.accent` `#FF906D`** with dark `#5B1600` text; "the Figma frames drew it as a `#FF906D → #FF6D8D` gradient; the app draws the warm end alone." | `lib/theme.ts:149-156`; `docs/DESIGN_SYSTEM.md:111-112` | New gradient token (orange `#F05423` → violet ≈`#8E4BAA`). **Contrast:** white on `#F05423` is 3.4:1 and fails AA (`docs/PLACEHOLDER_SCREENS.md:669-670`); the violet end will differ. Decide label ink per stop and verify with `__tests__/themeContrast.test.ts` |
| 4 | The accent is **`#FF906D`, not the brand `#F05423`**; `EMBER.violet` is **`#F79EFF`** (pink-lilac), not ≈`#8E4BAA`, and is restricted to "the alternate glyph in a pair of amenity tiles. Nothing else." | `lib/theme.ts:154,168`; `docs/DESIGN_SYSTEM.md:115-116` | New brand tokens; retire or rename the current `violet` |
| 5 | Type is **Plus Jakarta Sans (display) + Manrope (body)**, loaded from `@expo-google-fonts`. No Satoshi in the repo (`assets/fonts/` does not exist). | `lib/theme.ts:228-234`; `package.json:23-24` | Bundle Satoshi. **Satoshi has no 600 weight** (300/400/500/700/900) and `bodySemiBold` (600) drives `bodyStrong`, `caption` and many labels (`lib/theme.ts:232, 352-376`). Weight must come from the family, never `fontWeight` (Android ignores it: `docs/PULSE.md` "No fontWeight, anywhere") |
| 6 | Gradient **text** ("Pulse", the Blend'n mark) was ruled out because it needs `@react-native-masked-view` (native module, new dev client). | `components/pulse/PulseHeader.tsx:31-40`; `docs/PULSE.md` departure 1 | Either add the native dependency (new build for every tester) or ship the wordmark as an image asset. `expo-blur ~57.0.3` **is** already installed (`package.json:33`) |
| 7 | **"Accent for at most one thing per screen"**, and a long list of neutral treatments (selected chip = white fill; saved heart = filled white glyph; text actions = white label; live dot = `success` green). | `docs/DESIGN_SYSTEM.md:85-110` | Keep the one-primary rule (it maps directly onto "brand gradient for the single primary action"), but restate which neutral treatments survive in glass |
| 8 | Icons are **mixed**: Ionicons outline for most UI, but **MaterialIcons filled** for the Scene hero date/time, the location pin, amenity glyphs, the FAQ chevron and the gallery play badge, chosen deliberately to match the frame. | `components/scene/SceneHero.tsx:265-294`; `components/scene/SceneSections.tsx:431-433, 521, 603, 868` | One outlined family everywhere (the direction). The SceneHero comment argues for Material; record that this is superseded |
| 9 | Tests pin current visuals: `__tests__/pulsePalette.test.ts` (greps Pulse files for colours), `sceneCta.test.ts` (pins the 56pt pill and the 56 location-card bottom pad), `featuredCardLayout.test.tsx`, `pulseCardGeometry.test.ts`, `designTokens.test.ts`, `themeContrast.test.ts`, `upcomingCardCover.test.tsx`, `eventCover.test.tsx`, `scarcity.test.ts`, `pulse.test.ts`, `pulseFeed.test.ts`, `eventPreferencesScreen.test.tsx`, `rateEntryPoint.test.ts`, `sceneLifecycle.test.ts` | `__tests__/` | `tasks/lessons.md` (Visual design): "A design rule written into a test is a past decision, not a user requirement." Budget for updating these, and keep the behavioural ones (`pulseFeed`, `scarcity`, `pulse`, `city`) |

### Bugs and drift found while reading (worth fixing during the redesign)

1. **Scene hero media dots are probably hidden behind the top bar.** `PulseTopBar` is an **opaque** `EMBER.bg` band, absolutely positioned at `top: 0`, `insets.top + 64` tall, `zIndex: 10` (`components/pulse/PulseTopBar.tsx:94-98, 127-136`). The Scene's hero starts at y=0 with no top padding (`components/screens/EventDetailScreen.tsx:1301-1317`) and draws its page dots at `top: GUTTER` (24) inside the hero (`components/scene/SceneHeroMedia.tsx:299-305`). By code reading, the dots and the top ~110-126pt of every hero photo sit under an opaque band. `docs/SCENE.md` ("The hero starts at y=0") still describes the bar as translucent, so the full-bleed intent is currently defeated. A glass top bar fixes the intent; the dots need to move below the bar regardless. **Verify on device.**
2. **The Scene's CTA dock adds no bottom safe-area inset.** `ctaDockInner` has `paddingBottom: SPACE.lg` (16) and no `insets.bottom` (`EventDetailScreen.tsx:1533-1560, 1822-1834`), but the confetti origin assumes it does (`insets.bottom + SPACE.lg + SCENE_CTA_HEIGHT/2`, line 1732) and the scroll padding includes it (line 1315). On a home-indicator phone the pill may sit about 16pt from the bottom edge, inside the home-gesture zone (SCRUM-201 was this class of bug). **Verify on device.**
3. **Check-in still shows "Rules and regulations" on the Scene**, with "I Agree, Continue" (`lib/useCheckInFlow.ts:26-35, 95-120`). `docs/HOMEPAGE_AUDIT.md` ("Check-in: what you asked to remove") records the owner asking to remove the rules interstitial. The Pulse long-press "Blend in" goes straight to `submitCheckIn` without it (`app/(tabs)/events.tsx:618-673`). Two check-in experiences for one action.
4. **Door policy can never show.** `heroPillLabel` ranks a door policy ("GUEST LIST ONLY", "MEMBERS ONLY", "INVITE ONLY") above capacity (`lib/scarcity.ts:86-124`), but the Scene calls it without `doorPolicy` (`EventDetailScreen.tsx:1346-1350`) and the event mapping never reads `door_policy` (`EventDetailScreen.tsx:362-387`).
5. **"N joined" probably never renders on upcoming cards.** `joinedCount` reads `current_capacity` (`lib/pulse.ts:164-168`), and `lib/scarcity.ts:40` documents `current_capacity` as "attendance, so zero before doors". Upcoming and Featured are by definition before doors (`events.tsx:1827-1831`). **Verify the column's semantics server-side** before designing around a "142 joined" line.
6. **Share sends no link.** `handleShare` shares `title\nvenue\naddress` as plain text and no URL (`EventDetailScreen.tsx:936-944`).
7. **"Location TBA" / "Date TBA" strings still exist** in the long-press tray (`events.tsx:202, 219, 227, 989`), contradicting the rule "absent data gets no sentence" (`docs/PULSE.md` departure 10; `lib/pulse.ts:137-154`).
8. **Stale comments and docs** that will mislead an implementer:
   - `EventDetailScreen.tsx:1249-1258` says the route is `presentation: 'modal'`. It is `'card'` (`app/_layout.tsx:602-610`).
   - `EventDetailScreen.tsx:1519-1524` says "No amenities row", but amenities render (lines 1394-1407).
   - `EventDetailScreen.tsx:949-965` documents a "21:00 — Late" time range that no longer exists. The hero shows the start time only (lines 1234-1236).
   - `SceneSections.tsx:91-106` says icon 24 / pill 56. `docs/SCENE.md` delta 1 says icon 26 / pill 58. Code is 24/56 (`SCENE_CTA_ICON = ICON.lg`, `SCENE_CTA_HEIGHT = CONTROL.lg`, lines 107-111).
   - `docs/SCENE.md` CTA table says "Rate the people you met". Code says "Rate who you met" / "Rate the night" (`SceneSections.tsx:660-676`).
   - `docs/SCENE.md` "organiser column: two round buttons". Code has three: edit, announce, delete (`EventDetailScreen.tsx:1574-1601`).
   - `docs/PULSE.md` says the wordmark is accent `#FF906D` on an 80% fill with a 12pt blur, and that "the bell goes to settings". Code: white wordmark on an opaque band (`PulseTopBar.tsx:110-116, 133-135`), and the bell opens a notifications sheet (`NotificationBell.tsx`).
   - `docs/HOMEPAGE_AUDIT.md` says Featured is backed by `events.is_featured`. Code: the first 6 upcoming events that have a cover (`events.tsx:1869-1872`). No editorial pick exists (`docs/PLACEHOLDER_SCREENS.md:521`).
   - `docs/PLACEHOLDER_SCREENS.md` §5 still describes the old 7-section Pulse with "Hey Sagar!". Its "honest state of the design system" section (iOS palette, no brand colours) predates `EMBER`.
9. **`LoadError` / `LoadState` exist to unify empty and error states** (`components/LoadError.tsx:8-24`), but **none of the five in-scope screens use them**. Each one hand-rolls its own error state with a different glyph size and tile (details under each screen).
10. **The Pulse's per-section skeleton radius does not match the card it stands in for.** The Nearby skeleton is `EMBER_RADIUS.lg` (24) (`events.tsx:2551`; `app/nearby-events.tsx:299`) while `NearbyEventCard` is `EMBER_RADIUS.card` (32) (`components/NearbyEventCard.tsx:39`). The corner visibly changes on load.

---

## Part 1. Cross-cutting inventories

### 1.1 Tokens in force today (`lib/theme.ts`)

- **Colour (`EMBER`, 123-176):** `bg #0F0E0E`, `surface #272525`, `surfaceSunken #211F1F`, `surfaceMedia #141313`; text `#FFFFFF / #AEAAAA / #928E8D / placeholder #8A8F99`; `accent #FF906D`, `onGradient #5B1600`; `separator rgba(255,255,255,.1)`, `skeleton .12`; `destructive #FF453A`, `success #30D158`, `warning #FFBC5C`, `violet #F79EFF`; `scrim rgba(15,14,14,.6)`, `bgClear`, `backdrop rgba(0,0,0,.6)`. `tint(hex, a)` helper (182-185).
- **Space (254-263):** 2/4/8/12/16/24/32/48; `GUTTER = 24`.
- **Icon (269-273):** 16/20/24. **Control (282-288):** lg 56, md 48, sm 32, badge 18. **Opacity (297-300):** pressed .85, disabled .45.
- **Radius (`EMBER_RADIUS`, 205-214):** sm 8, md 16, lg 24, card 32, pill.
- **Type (`TYPE`, 318-377):** display Jakarta ExtraBold 34/40 (-1); title Jakarta Bold 24/30; heading Jakarta Bold 20/26; button Jakarta Bold 16/24; body Manrope 16/24; bodyStrong Manrope SemiBold 16/24; meta Manrope 13/18 (secondary); label Manrope Bold 12/16 +1.2 (uppercased in the string); caption Manrope SemiBold 11/14. `MAX_FONT_SCALE` caps (396-406).
- **Motion (`lib/motion.ts`):** durations 100/160/220/320/520; easings standard `[0.2,0,0,1]`, entrance `[0.16,1,0.3,1]`, exit, gentle; staggers 18/28/40; springs gentle/snappy (defined, **barely used** on these screens). Most press and state transitions use the custom strong ease-out `cubic-bezier(0.23,1,0.32,1)` declared locally in 5+ files (ScalePress, presence, FilterControl, PulseHeader, rate). No single motion token for it.

### 1.2 Haptics (all `expo-haptics`)

`lib/useInteractionFeedback.ts:4-22`: `tap` = `selectionAsync`, `success`/`warning`/`error` = `notificationAsync`. `components/motion/ScalePress.tsx:48-57` fires `selectionAsync` **on press-in** unless `haptic={false}`. Nothing in scope uses `impactAsync` (no light/medium/heavy impacts anywhere on these screens).

| Screen | Fires | Silent (no haptic) |
|---|---|---|
| Pulse | heart save/unsave `tap` (`events.tsx:873`), error (886, 904); long-press-tray check-in `tap` 656, `success` 732, `error` 688/842; check-out `tap` 922, `success` 934, `error` 952/968; filter chips `selectionAsync` (`FilterControl.tsx:195`); empty/error-state buttons via ScalePress default (`events.tsx:2591-2681`) | card tap and **long-press open** (cards are `haptic={false}`: `FeaturedCard.tsx:145-147`, `UpcomingCard.tsx:122-124`, `NearbyEventCard.tsx:50-51`; `handleEventPreview` 980-1067 fires nothing); city chip, filter button, search clear (`PulseHeader.tsx:118-120, 200, 232`); bell (`NotificationBell.tsx:150-153`); VIEW ALL (`SectionHeader.tsx:48-51`); city rows (`TouchableOpacity`, `CityArtCard.tsx:50`); Show results; pull-to-refresh; carousel snap; banner buttons |
| Scene | heart `tap` (`EventDetailScreen.tsx:637`), error 646/653; RSVP `tap` 730, error 735/764 (**no success haptic on RSVP**, a toast only); withdraw `tap` 673, error 678/686; check-in `success` (`lib/useCheckInFlow.ts:198`) + confetti, `error` 174/278; organiser announce/edit/delete success/error (839-850, 873-892, 915-922); FAQ row via ScalePress default (`SceneSections.tsx:850`); error-state Try again (1131); "Event not found → Go back" (1149, haptic **on**) | the CTA itself (`SceneSections.tsx:744-750`, handlers fire their own); back, share, report bar buttons (1775-1778); hero swipe; lightbox; gallery; location card (1468-1471); claim link; offline "Go back" (1142, haptic **off**, inconsistent with 1149) |
| Nearby | empty/error buttons via ScalePress default (`app/nearby-events.tsx:308, 321, 330, 347`) | back, cards, pull-to-refresh |
| Event prefs | intent rows via ScalePress default (`app/event-preferences/[eventId].tsx:202-208`) | switches, Save (`EmberButton` is a plain Pressable: `components/onboarding/EmberControls.tsx:68-120`), close |
| Rate | scale and issue choices `selectionAsync` **only when the answer changes** (`app/rate/[eventId].tsx:224-235`); night tap 291; Submit / Done / Try again via ScalePress default (541, 422, 385) | Skip (451-452, 554-555); close; **no success haptic** on submit |

**Gaps for "rich haptics":** no haptic on long-press (the most physical gesture on the Pulse), RSVP success, carousel snap, sheet detents, pull-to-refresh threshold, city change, filter apply, or rating submit.

### 1.3 Motion

| Where | What | file:line |
|---|---|---|
| Press, everywhere | `ScalePress` scale 0.97 default (0.98 cards, 0.9 icons), 120ms ease-out CSS transition on press-in; Reduce Motion gives no scale | `components/motion/ScalePress.tsx:15-85` |
| Banners, small pop-ups | `fadeInFast` 150ms / `fadeOutFast` 120ms; `popIn`/`popOut` 0.9→1 + fade 150/120 | `components/motion/presence.ts:20-48` |
| Section entrances | `FadeInUp` (opacity + 8-10pt rise, 220ms entrance curve, delay) | `components/motion/FadeInUp.tsx:23-56` |
| Pulse sections | base 34ms + 44ms stagger: Featured, Upcoming, Nearby; first 4 list rows on first reveal only | `events.tsx:142-176, 2584, 2603, 2714-2737` |
| Skeleton | one shared RN `Animated` opacity pulse 0.6↔1, 800ms per leg; held for at least 720ms (`useMinimumVisible`) | `components/Skeleton.tsx:15-51`; `events.tsx:2202` |
| Heart | swell 1→1.2→1 (120+180ms) on fill only | `components/motion/HeartIcon.tsx:29-63` |
| Feed media | 4s still dwell, 320ms crossfade, clips advance on end | `components/pulse/FeedMedia.tsx:18-31, 103-136` |
| Sheets | `RisingSheet` rise 300ms `(0.32,0.72,0,1)`, sink 240ms, scrim fade, drag-to-dismiss with spring | `components/motion/RisingSheet.tsx:27-56, 178-188` |
| ActionTray | RN `Animated` fade + translate; header drag-to-dismiss, spring home | `components/ActionTray.tsx:~90-130` |
| Scene hero | parallax 0.5x, pull-down stretch (iOS), caption fades by 45% scroll | `components/scene/SceneHero.tsx:113-161` |
| Scene CTA | label `riseIn` 6pt 220ms, icon `popIn`; width and colour **snap** (no layout transition, by lesson) | `SceneSections.tsx:52-62, 695-788`; `tasks/lessons.md:5` |
| Check-in success | `ConfettiBurst` from the CTA (skipped under Reduce Motion) | `EventDetailScreen.tsx:1730-1734`; `components/motion/ConfettiBurst.tsx` |
| City art | continuous Reanimated loops (clouds, metro, birds), palette by city clock | `components/cityArt/CityScene.tsx:1-27, 97-158` |
| Toast | slide/fade 220/160ms | `components/Toast.tsx:87-106` |

**Not present anywhere in scope:** shared-element or hero transitions from card to Scene; scroll-linked top bar (collapse, blur-in, title handoff); spring physics on cards; animated tab or segment indicators; skeleton shimmer (deliberately removed, `Skeleton.tsx:24-25`); motion on carousel focus (the active card does not scale or dim neighbours); live "breathing" indicators (deliberately still: `lessons.md:16`, `SceneSections.tsx:121-131`).

### 1.4 Cross-screen inconsistencies a designer will notice

- **Text on photos:** Featured puts words **under** the photo "because none of the strong references print text on an organiser's photograph" (`FeaturedCard.tsx:28-37`). Nearby prints title, time and venue **on** the photo behind a 3-stop scrim (`NearbyEventCard.tsx:88-120, 148-155`). The Scene hero prints on the photo too. One family, three policies.
- **Date and time formats:** Featured "Today"/"Oct 24" (`lib/pulse.ts:86-98`); Upcoming "7:00 PM" under a "Today · Saturday" heading; "More events" rows "Tonight · 6:30 PM" / "Happening now" (`lib/pulse.ts:100-135`); Pulse Nearby "09:00 PM - 11:00 PM, October 4" (`lib/time.ts:32-48`, 2-digit hours); nearby-events screen "Today · 9:00 PM" (`app/nearby-events.tsx:267`); long-press tray "Sat, October 4, 9:00 PM" (`events.tsx:192-204`); Scene hero "Today" + "7:00 PM" with no end (`EventDetailScreen.tsx:1234-1236`).
- **Meta icons:** Featured calendar-outline + location-outline; Upcoming location-outline + people-outline + navigate-outline; Nearby time-outline + map-outline in **white**; Scene hero Material **filled** event + schedule; location card Material filled location-on.
- **Pressed states:** `ScalePress` scale; `Pressable` opacity .85; `TouchableOpacity` default **0.2** dim (city rows `events.tsx:2800, 2844`; banner CTAs 2234-2341; Nearby prompt 2178; city picker backdrop).
- **Long-press:** default ~500ms on Featured/Upcoming, 320ms on Nearby (`NearbyEventCard.tsx:54`), absent on the nearby-events screen (`app/nearby-events.tsx:262-269` passes no `onLongPress`).
- **Save (heart):** on Upcoming rows only. Not on Featured, not on Nearby, not on the nearby-events list.
- **Selected state in the city picker:** art cards use an **accent** 2pt border and an accent check (`CityArtCard.tsx:104, 110-120`); plain rows use the **white fill** (`events.tsx:3252-3256`).
- **Empty/error glyph:** Pulse 80pt `surfaceSunken` tile with a border (`events.tsx:3146-3156`); `LoadState` 80pt `surface` tile, no border; nearby-events bare 48pt icon; rate 24pt icon; bell 24/28pt icon.
- **No-cover fallback:** `EventCover` draws the gradient **monogram** at .35 on `surface` (`components/EventCover.tsx:73-90`); `NearbyEventCard` draws a plain `surface` plus scrim, no mark (178-183); `FeaturedCard` excludes coverless events; the Scene hero is a flat `surfaceSunken` panel.

---

## Part 2. Screens

### 2.1 `/(tabs)/events` — The Pulse (home)

- **Files:** `app/(tabs)/events.tsx` (3,276 lines; `EventsInner` 274-2894, styles 2933-3263); labels `lib/pulse.ts`; list logic `lib/pulseFeed.ts`; filters `lib/eventFilters.ts`; city `lib/city.ts`, `lib/cityStorage.ts`, `lib/cityArt.ts`.
  Renders `PulseTopBar` + `NotificationBell`, `PulseHeader`, `SectionHeader`, `FeaturedCard` (+`FeedMedia`/`FeedVideo`), `DayHeading`, `UpcomingCard` (+`EventCover`, `HeartIcon`), `NearbyEventCard` (+`OptimizedImage`), `SkeletonLine/Block`, `CityArtCard`/`CityArtBanner`, `FilterSheet`, `ActionTray`, `RealtimeStatusBanner`, `SheetModal`/`RisingSheet`/`Grabber`, `VirtualizedList`. Dev harness: `app/preview/pulse.tsx`.
- **Job:** Show what is on in the chosen city, soonest first, and get you into an event page (or saved, or checked in) fast.
- **Entry/exit:** the first tab (`app/(tabs)/_layout.tsx` `Tabs.Screen name="events"`, title "Pulse"); re-tapping the tab scrolls to top (`useScrollToTop`, `events.tsx:366`). It is the landing route after sign-in. Exits by pushing `/event/[id]` (card tap, `events.tsx:523-560`, which prefetches the detail and preloads a 1080×520 hero), `/nearby-events` (VIEW ALL, 2122), `/chat/[id]` (after a check-in, 805-812), `/event-preferences/[id]?askIntent=1` (after a check-in when the server says `intentNeeded`, 745-749), OS Settings. Sheets: city picker, filters, notifications, the long-press tray.
- **Primary action:** **none.** The screen's single accent is the word **"Pulse"** in the headline (`PulseHeader.tsx:31-40, 268`; `DESIGN_SYSTEM.md:85-92`). Accent also appears legitimately in the error state's "Try again" (`events.tsx:3180-3191`) and inside sheets (Show results; city art active border). The tab bar carries the brand mark disc.

**Content, top to bottom**
1. **Top bar (overlay, not layout):** `PulseTopBar`, opaque `EMBER.bg`, 64pt + status bar. "Blend'n" in `TYPE.button`, **white** (left, x=24). `NotificationBell` on the right (24pt glyph, white badge with count) (`events.tsx:2412`; `PulseTopBar.tsx:59-148`).
2. **Banners** (`ListHeaderComponent`, only when relevant, 8pt gap; `events.tsx:2227-2344`):
   a. First-run tip: "Tip: Long-press any event card for quick actions." + **Got it** (`surface` info banner).
   b. Offline: "You're offline. Some actions won't work until you're back." (`RealtimeStatusBanner`, warning tint; socket issues suppressed on this screen, 2244-2263).
   c. Switch offer: "You're in {city}. Browse events here?" + **Switch** (info).
   d. Away notice: pin + "You're in {deviceCity} — nothing here yet. Showing {selected}." (neutral `surfaceSunken`, **no action**).
   e. Location denied (only when narrowed or a stale fix exists): "Turn on location to see nearby events and check in." + **Settings** (warning tint).
   f. Refresh failed over existing content: "Couldn't refresh events." + **Try again** (destructive tint).
3. **Headline block** (`PulseHeader`): "The **Pulse**" (`display` 34/40, "Pulse" in accent) with a **city chip** right-aligned on the same row (32pt pill on `surface`: pin + city or "Choose city" + chevron-down, max 42% width, truncates). Then, 16pt below, a **search field** (48pt pill on `surface`, search glyph (spinner while refining), placeholder "Search events…", clear ×) beside a **48pt round filter button** (options-outline, white count badge when filters are on).
4. **Featured** (32pt below; hidden while searching or filtering, and when no upcoming event has a cover): `SectionHeader` "Featured" (no VIEW ALL), then a **horizontal carousel** of up to 6 `FeaturedCard`s, full-bleed, first card at the 24pt gutter, next card peeking by 32pt, snap per card. **One card fills the width** (`events.tsx:1976-1989`).
5. **Upcoming** (hidden when narrowed or empty): "Upcoming" header, then **day groups** (`DayHeading` "Today Saturday", "Tomorrow Sunday", "Oct 24 Friday") each with `UpcomingCard` rows. Only the **next 3** upcoming events not already in Featured (`events.tsx:1901-1904`).
6. **Nearby / In {city}** (hidden when narrowed):
   - With a location fix: header "Nearby" (or "In {city}" when you are not in the browsed city) + **VIEW ALL** → `/nearby-events`; a meta subtitle "**{City}** / {Weekday}"; up to **4** `NearbyEventCard`s, nearest first, 24pt apart (`events.tsx:2105-2170`).
   - Without a fix and permission undetermined/denied: header "Nearby", "Turn on location to see events near you." and a 48pt `surface` pill **Turn on location** / **Open settings** (2172-2199).
7. **More events:** header "More events" (only when unnarrowed and non-empty, 2739-2743), then a virtualised list of `UpcomingCard` rows (12pt apart) for every event the sections above did not draw, paginated by 20 (`renderEventItem` 1771-1800; `fetchMore` 1693-1754). Under search or filters this list **is** the whole result, with no header.
8. Bottom padding clears the floating tab bar: `insets.bottom + max(128, 92+24)` (2438).

**Interactive elements**
| Element | Gesture | Result |
|---|---|---|
| Bell | tap | notifications sheet (marks all read, optimistic badge clear) — see component |
| City chip | tap | city picker sheet (`events.tsx:2351`) |
| Search field | type | 350ms debounce, then a silent refetch with `search` (436-450); spinner replaces the glyph (`refining`); curated sections hide |
| Search × | tap | clears instantly (no debounce) and restores sections |
| Filter button | tap | copies applied filters to a draft, opens `FilterSheet` (2356-2359) |
| Featured card | tap / long-press / swipe row | open Scene / quick-actions tray / carousel snaps; the settled card (60% visible for 250ms) plays media (409-418) |
| Upcoming row | tap / long-press | open Scene / quick-actions tray |
| Upcoming heart (32pt disc on thumb) | tap | optimistic save/unsave, `tap` haptic, swell; rollback + compact tray on failure (854-917) |
| Nearby card | tap / long-press (320ms) | open Scene / tray |
| VIEW ALL (Nearby) | tap | push `/nearby-events` |
| Turn on location / Open settings | tap | OS permission prompt (then a "Turn on location" tray if refused, 1069-1103) or OS Settings |
| Banner buttons | tap | Got it (persists per user, 490-496) · Switch (chooses city) · Settings · Try again |
| Empty-state buttons | tap | Clear search · Clear filters · Change city · Refresh · Try again |
| List | pull-to-refresh | forced silent refetch; also retries failed Upcoming thumbnails (`pulls`, 1348-1353) |
| List | scroll to end | next page (threshold 0.5) |
| Tab "Pulse" | re-tap | scroll to top |
| VoiceOver | "Quick actions" custom action on every card | same tray as long-press |

**Long-press preview (quick-actions tray)** (`handleEventPreview`, `events.tsx:980-1067`): `ActionTray` size `expanded`, a text-only bottom sheet (no image, no haptic). Title: event title. Message: three lines, "Sat, October 4, 9:00 PM" / venue or city or "Location TBA" / short description. Buttons, in order:
1. **Check out** (only if checked in), which opens a confirm tray "Check out of {title}?" / "You'll leave the room and its people. To come back in you'll need to check in again, with your location." with **Stay** / **Check out** (primary).
2. **Blend in** (primary, only if within the client-computed geofence radius and not checked in; `proximityFor` 253-272 defaults to a 500m radius).
3. **Save** / **Remove from saved**.
4. **View details** (primary unless Blend in is offered).

Check out and Blend in are mutually exclusive, so the tray holds at most three buttons: the first two share a row and the third sits on a row of its own (`ActionTray` default `layout="row"`, `buttonRows`).

**Feedback, with file:line:** see Part 1.2. Pulse-specific motion: banners fade (`events.tsx:2230-2331`); sections `FadeInUp` (2584-2737); first 4 rows `RevealRow` (160-176); skeleton pulse; search focus ring + glyph/spinner crossfade (`PulseHeader.tsx:157-210`); filter count badge has no animation; bell badge `popIn` (`NotificationBell.tsx:171-177`); FeaturedCard media crossfade; Upcoming heart swell; carousel `decelerationRate="fast"` snap (2012-2014).

**States**
- **Loading (first load, or a city change):** skeleton shaped like the page: Featured (header bar pair, square photo block at the real card size + 2 lines + a 30% peek block, radius 32), Upcoming (3 `UpcomingSkeletonRow`s), Nearby (3 blocks at 363:249, radius **24**) (`events.tsx:2464-2559`), held at least 720ms. Banners and the header stay mounted so the search field keeps focus (2466-2476). Search/filter refetches are **silent** (spinner in the field only, 1355-1398). A narrowed first load shows 4 row skeletons.
- **Empty: four kinds** (`lib/pulseFeed.ts:40-94`; render `events.tsx:2602-2686`), each centred with a glyph tile (or city art) + `title` + body + ghost buttons:
  - `search`: search-outline glyph; "No matches" / "Nothing here matches "{term}" in {city}." / **Clear search**.
  - `filters`: search-outline; "No matches" / "Nothing matches these filters in {city}." / **Clear filters**.
  - `noCity`: calendar-outline; "No events yet" / "There are no published events to show right now." / Change city (if cities exist) + Refresh.
  - `notLive`: **city art banner** (140pt) if drawn, else rocket-outline; "Coming soon to {city}" / "We're not live here yet — you're early. Browse another city in the meantime, and we'll be here soon." / Change city + Refresh.
  - `quiet`: city art banner or calendar-outline; "Nothing on in {city}" / "Nothing is on here at the moment. Try another city, or check back." / Change city + Refresh.
- **Error:** nothing loaded: cloud-offline tile, "Couldn't load events" / "Check your connection and try again." / **Try again** (accent) (2583-2601). Content loaded but refresh failed: destructive-tint banner (2330-2342).
- **Offline:** banner 2b. There is no offline cache UI beyond `swr` revalidation (`getEvents` swr, 1666-1672).
- **Permission denied (location):** the Nearby section becomes the prompt; banner 2e only when narrowed or a stale fix exists, so there is "one ask, not two" (2306-2310). Distances hide. The filter sheet hides "How far". A check-in from the tray without location shows a tray "Location required / Turn on location so we can check you in." with Cancel / **Open settings** (636-652). The screen never prompts on mount or scroll (1116-1158).
- **First run:** the city resolves silently, server list + stored city first, then the device city (1473-1552; `resolveBrowseCity`, `cityOnResume` in `lib/city.ts`); the long-press tip banner shows once per user.
- **Partial:** each section hides independently (Featured needs covers; Upcoming needs future events; Nearby needs a fix). An event can appear in exactly one place (`mainListData`, 1906-1935).
- **Signed out mid-action:** "Sign in required" trays for save and check-in (624-635, 859-869).

**Data shown and source** (everything is real; nothing invented; absent values are omitted):
- `GET /events` (`lib/api.ts` `getEvents`): `city` scopes, `lat`/`lon` sort and label only, **no radius by default**; `include=checkins,activeCheckins,profile`; `search`, `categorySlug`, `startDate`, `endDate`, `radius` from filters; page size 20 (`events.tsx:1223-1327`). Fields used: `title, cover_image_url, media[], start_time, end_time, session, venue_name, city, address, category (categories[0].name), current_capacity, distance, latitude/longitude, check_in_radius, is_favorited, favorite_count, user_checkin` (`lib/api.ts` `eventFromApi` ~57-93).
- `GET /events/cities` (city list with `eventCount`), `GET /categories` (parents only, for filters, 1181-1199), `POST /city-demand` (fired once per city when the away notice shows, 1643-1650), batch check-in statuses, toggle interest, check-in/out, `GET /events/:id/chat`, `GET /notifications`.
- Device: foreground location (Balanced accuracy), reverse geocode for the device city (1504-1524).
- **Derived:** distance labels (`formatDistance`, `lib/geo.ts:61-66`: "350m away" / "2.4km away" / "42km away"), shown **only while browsing the city you are in** (`browsingHere`, 1652); "Happening now" / "Tonight" eyebrows (`nextUpLabel`); within-radius for the tray's Blend in.
- **Not available** (do not design for them without a server change): host avatar or byline on cards, attendee faces, a live "● N checked in now" line on cards (`docs/PULSE.md` "The cards, after a look at Luma"), editorial "featured" flag, price, reservations, friends-here, "Explore the Grid / Launch Map" (deliberately cut).

**Product rules a redesign must keep**
1. One accent: the title word, while the page has no primary action (`PulseHeader.tsx:31-40`).
2. **Never silently switch the city.** A guess may be improved; a choice never is (`events.tsx:347-357, 1526-1552`; `PLACEHOLDER_SCREENS.md:486-488`).
3. The picker's **"Use my current location" row is never conditional on that city having events** (`events.tsx:2784-2799`), and is visually distinct from the city rows (`PLACEHOLDER_SCREENS.md:424-428`).
4. The switch offer and the away notice are mutually exclusive. The away notice is **neutral and passive, never styled as a warning** (`events.tsx:2279-2305, 3088-3104`; `PLACEHOLDER_SCREENS.md:430-449`).
5. **Distance is a label, never a filter** by default, and only shown in your own city; leave room for "42 km away" (`PLACEHOLDER_SCREENS.md:474-478`; `events.tsx:2068-2070, 2150-2163`). "Any distance" removes the parameter (`FilterControl.tsx:34-38`).
6. **Empty states are per section and per kind; never a whole-page "No events nearby"** (`PLACEHOLDER_SCREENS.md:479-482`; `lib/pulseFeed.ts:40-62`). "Coming soon" and "Nothing on" must not read alike.
7. **Search or filters turn the magazine into a flat list** and hide every curated section (`events.tsx:425-434, 1906-1916, 2687-2695`).
8. Search: 350ms quiet before the request, none before clearing; the field must survive the loading swap (`events.tsx:436-450, 2466-2476`).
9. Filters apply only on **Show results**; the count is always visible on the control (`FilterControl.tsx:24-33`; `PulseHeader.tsx:70-76`).
10. **"0 joined" is never shown; an absent venue gets no sentence** (`lib/pulse.ts:137-168`).
11. Featured takes only events with a cover; a single featured card fills the width; the hero card must clear the tab bar (`events.tsx:1856-1872, 1968-1976`; `FeaturedCard.tsx:59-93`).
12. **One video decoder at a time, muted, no controls; Reduce Motion shows the first still** (`FeedMedia.tsx:33-77`; `FeedVideo.tsx:5-34`).
13. Cards must render without a cover (`PLACEHOLDER_SCREENS.md:489-492`).
14. No location prompt on scroll or mount; the ask lives on the Nearby section (`events.tsx:1116-1121`).
15. Check out stays one tap from the tab bar's ring and is on the long-press tray, **with a confirm** (`events.tsx:1024-1059`; `docs/PULSE.md` "The checked-in strip is gone").
16. No VIEW ALL that leads to the same items; no prev/next arrows unless wired (`SectionHeader.tsx:13-17`; `docs/PULSE.md` 4-5).
17. Category tags show the **real category**, never a mood word ("SONIC VOID") (`docs/PULSE.md` 9).
18. No hamburger or drawer; the bell is live (`PulseTopBar.tsx:24-41`).
19. "Offline" is worth a banner; "socket disconnected" is not, on this HTTP-fed screen (`events.tsx:2244-2263`).
20. No price anywhere (`HOMEPAGE_AUDIT.md` 6).

**Redesign opportunities (from the StyleSheets and render)**
- **The top bar is an opaque slab** that merely recolours the page (`PulseTopBar.tsx:133-135`). This is the obvious first GLASS-CTRL surface: blur the feed through it and let the wordmark carry the brand gradient (as an image, or with masked-view).
- **The headline, city chip and search all scroll away.** The code admits the cost: "somebody deep in the feed must scroll up to change a filter" (`PulseHeader.tsx:225-228`). Collapse "The Pulse" into the bar on scroll and pin a compact glass search+filter row; the city could become a tappable bar title ("Pulse · Bengaluru ▾").
- **The city chip is the most load-bearing control and the least designed:** a 32pt grey `meta` pill (`PulseHeader.tsx:270-284`; `PLACEHOLDER_SCREENS.md:463-466` "a caption that happens to be tappable").
- **Featured cards are static squares** with words under them. Nothing marks the active card (it is merely the one playing). The carousel snaps with no scale or parallax and no page indicator. On a 667pt phone the clamp shrinks the card to about 183pt square (`FeaturedCard.tsx:66-93`). Consider a different hero shape for short screens rather than a shrunken square.
- **Three card families, three visual languages** (Part 1.4): unify the text-on-photo policy, the meta icons, the radius (32/16/32), and whether there is a heart.
- **"More events" rows reuse Upcoming rows without day grouping**, so the eyebrow carries the date. Visually it is one long undifferentiated stack below Nearby.
- **No "live now" or "tonight" surface on the Pulse at all** (see Part 3.7). Live events fall out of Featured and Upcoming (they filter `start_time >= loadedAt`, 1827-1831) and land in "More events" with a plain "Happening now" eyebrow and no dot.
- **Banners are five near-identical rounded rectangles** in three tints (`events.tsx:3051-3132`), stacked above the title. That is undesigned chrome (`docs/PULSE.md` "What is undesigned"). Consider one glass status strip under the bar.
- **Empty states** are a grey glyph in a bordered box plus ghost buttons. The city art banner is the one moment of delight. Extend that illustration language to the other empties, and put orbs behind them.
- **Long-press tray is text-only** (no cover, no map, no live state). A proper peek (media, date, venue, distance, quick actions, haptic on open) would make the gesture worth learning, and would retire the "Tip:" banner.
- **Skeleton is a flat grey pulse.** Fine, but the radius mismatch (24 vs 32) and the 720ms floor make the swap noticeable.
- **Pressed-state zoo:** replace the `TouchableOpacity` 0.2 dims (city rows, banners, Nearby prompt) with the shared press behaviour.

---

### 2.2 `/event/[id]` — The Scene (event detail)

- **Files:** `app/event/[id].tsx` (20 lines: a `ScreenProfiler` wrapper around `components/screens/EventDetailScreen.tsx`, 1,926 lines). Sections in `components/scene/SceneSections.tsx`; hero `SceneHero.tsx` + `SceneHeroMedia.tsx`; viewer `SceneLightbox.tsx`; scarcity `lib/scarcity.ts`; check-in `lib/useCheckInFlow.ts`; Board row `components/board/BoardSections.tsx` `BoardEntry` (58-74). Dev harness: `app/preview/scene.tsx` (fixtures; a test asserts that harness and screen compose identically, `docs/SCENE.md` "Composition").
- **Job:** Let somebody decide whether to go, then do the one thing the clock allows (RSVP, check in, open the room, rate), and find the place.
- **Entry/exit:** pushed **full-screen card** (`presentation: 'card'`, full-screen swipe-back, `app/_layout.tsx:585-610`). It is **not a tab child**, so no tab bar sits under it. Entered from Pulse cards and the tray, `/nearby-events`, the Going tab, the profile tab, the Blend'n overlay (`components/blendn/BlendnScreen.tsx`), and notifications/push (`lib/notifications.ts`). Params carry an outline (title, cover, venue, city, start, end, category, description, interestCount) for instant paint (`EventDetailScreen.tsx:200-249`). Exits: back; `/rate/[eventId]`; `/chat/[id]` (replace); `/board/[eventId]`; `dismissTo('/(tabs)/events')` + `openBlendn()`; Maps; browser (claim); share sheet; report sheet; lightbox (modal).
- **Primary action:** **`SceneCTA`**, the floating pill: accent ("loud") while something is still to do (`rsvp`, `join`, `rate`), quiet `surfaceSunken` once done (`rsvpd`, `going`, `ended`) (`SceneSections.tsx:693, 728-734`). Redesign: the brand gradient goes here, and only in the loud states.

**Content, top to bottom** (composition is pinned by `docs/SCENE.md`)
1. **Top bar overlay** `PulseTopBar` (opaque `bg`, 64 + inset), holding a back chevron, "Blend'n" in white, and three **32pt `surface` discs**: heart (`HeartIcon`, filled white when saved), share, flag/report (`EventDetailScreen.tsx:1248-1299, 1760-1803`).
2. **Hero** `SceneHero`, full-bleed from y=0, height = width × 574/390 (about 574 on 390, 633 on 430) (`SceneHero.tsx:35-40`):
   - media: a swipeable pager of the organiser's media, **clip first** (`clipFirst(feedPlaylist(...))`, `EventDetailScreen.tsx:1169`); auto-advances (stills 4s, clips on end) until the first manual swipe; page dots (6pt, active 18pt wide) **top-right at 24pt, probably under the opaque bar** (Part 0 bug 1);
   - a gradient from clear at 25% height to `bg` at the foot, over the whole hero (195-210);
   - caption, bottom-left at a 24pt inset: **scarcity pill** (`label` caps on `scrim`, hairline: "8 SPOTS LEFT" / "1 SPOT LEFT" / "FULL", else absent), **title** (`display` 34/40, 2 lines, `maxFontSizeMultiplier` 1.2), meta row (Material `event` + "Today", Material `schedule` + "7:00 PM") (229-295);
   - coverless: a flat `surfaceSunken` panel with the same caption.
3. **Byline** (48pt below the hero; only if host or live): "By **{organizer}**" and, while live, a green still dot + "{n} here now" (`SceneSections.tsx:133-155`; `EventDetailScreen.tsx:1365-1369`).
4. **"The Experience"** heading + description in `body` `textSecondary`, with exact-match entities (title, venue, city, category) lifted to white (`EventDetailScreen.tsx:1370-1379`; `lib/entityHighlight.ts`).
5. **Amenity tiles**, two-up and wrapping: `surfaceMedia` 32-radius tiles, min height 126, Material glyph alternately violet `#F79EFF` / `textSecondary`, title + subtitle (`EventDetailScreen.tsx:1394-1407`; `SceneSections.tsx:557-612`).
6. **Details** (organiser-written): one heading per block; prose, label/value pairs, or an **FAQ accordion** (chevron rotates, answer fades in) (`SceneSections.tsx:808-885`). Covers house rules, FAQ, accessibility and the rest (`lib/eventDetails.ts`).
7. **Gallery** (only if more than one media item): "Gallery" heading + a horizontal rail of 160pt rounded (24) tiles, clips as posters with a play badge, snap per tile, bleeding past the gutter (`SceneSections.tsx:467-530`).
8. **Attendees** (only if the count is above 0): heading **"Going" / "Interested"** before doors (RSVPs, falling back to saves) or **"Attendees"** after (check-ins), the count right-aligned in `heading` grey, then up to 3 overlapping 56pt **pseudonym creature discs** (gradient + emoji) + "+N" (`SceneSections.tsx:204-299`; `EventDetailScreen.tsx:1210-1212`).
9. **The Board** row (before the run's first doors, flag on): people icon, "The Board", "Going alone? See who's looking for company — or offer a space.", chevron (`EventDetailScreen.tsx:1456-1464`; `BoardSections.tsx:58-74`).
10. **Location card** (if there is a venue): `surfaceMedia`, 32 radius, hairline; "LOCATION" eyebrow, venue in `body`, filled pin + address/city, then a **256pt non-interactive dark `MapView`** with a white pin (fades in after navigation settles). The whole card opens Maps (`EventDetailScreen.tsx:1466-1491`; `SceneSections.tsx:332-443`).
11. **Claim link** (server-decided): "Running this event? <u>Claim it</u>" + open-outline icon, `meta` (`EventDetailScreen.tsx:1501-1517`).
12. **Floating CTA dock** (outside the scroll): a bottom gradient (`bgClear` → `bg` at 55%) behind a **content-width 56pt pill**, centred (`EventDetailScreen.tsx:1533-1560`).
13. **Organiser column** (organiser only): three 48pt `surfaceSunken` discs stacked bottom-right above the CTA (edit, megaphone, trash) (1574-1601), opening an **Edit event** modal and a **Send announcement** modal (1611-1727; 32-radius `bg` cards on `backdrop`) and a delete confirm sheet (902-930).
14. Overlays: `SceneLightbox`, `ConfettiBurst`, `ActionTray`, toasts.

**The CTA, every state** (`SceneSections.tsx:627-676`; state machine `EventDetailScreen.tsx:1214-1226`; press handler 1080-1118):
| When | State | Label | Icon | Look | Tap |
|---|---|---|---|---|---|
| before doors, not RSVP'd | `rsvp` | **I'm going** | radio-outline | loud | RSVP (`tap` haptic). Seat: toast "You're going." with **Add to calendar**. Full: tray "You're on the waitlist / This event is full. We'll let you know if a place frees up — you'll be first in line in the order you joined." (712-767) |
| before doors, going or waitlisted | `rsvpd` | **You're going** (also when waitlisted) | checkmark | quiet | confirm tray "Cancel your RSVP?" / "Leave the waitlist?" → **Keep it**/**Stay on it** or destructive **Cancel RSVP**/**Leave waitlist** (691-710) |
| running, not checked in | `join` | **Blend in** | radio-outline (spinner while checking) | loud | **"Rules and regulations" tray first** (7 rules, Cancel / "I Agree, Continue"), then location fix → check-in (`lib/useCheckInFlow.ts:95-280`). Refusals by name: "Not quite there yet" (+ Open Maps), "Doors aren't open", "This one's over", "Not open to you", "At capacity", "Already checked in", "Check-in failed" (`lib/checkInRefusal.ts:76-103`). Success: `success` haptic + **confetti** + reveal prompt or "go to chat" tray |
| checked in | `going` | **You're in** | radio-outline, then chatbubbles-outline after 900ms | quiet | **disabled** for the first 900ms ('checked' stage), then opens the room chat (`router.replace`) (1059-1071, 1115-1117) |
| over, attended | `rate` | **Rate who you met** / **Rate the night** (if `checkInCount <= 1`) | radio-outline | loud | push `/rate/[eventId]` |
| over, not attended | `ended` | **See what's on tonight** | arrow-forward | quiet | back to the Pulse tab, open the Blend'n overlay (1100-1104) |

Capacity never disables the CTA ("check-in does not refuse at capacity", `SceneSections.tsx:632-637`). Check out is **not** here; it lives in the room's top bar and the Pulse tray (`EventDetailScreen.tsx:800-811`). The pill's colour and width **snap**; the label rises 6pt and the icon pops when the state changes (`SceneSections.tsx:695-710`).

**Interactive elements**
| Element | Gesture | Result |
|---|---|---|
| Back disc | tap | `router.back()` (no haptic) |
| Heart disc | tap | optimistic save, `tap` haptic, swell; sign-in tray when signed out (625-658) |
| Share disc | tap | OS share sheet with text only (936-944) |
| Flag disc | tap | report-event options (`lib/safetyUtils.ts` `showEventReportOptions`) |
| Screen | edge or full-screen swipe right | back (card presentation) |
| Hero media | horizontal swipe | page; **stops auto-advance for the life of the screen** (`SceneHeroMedia.tsx:21-27, 151-153`) |
| Hero media | tap | lightbox at that index |
| Scroll | vertical | parallax (0.5x), caption fade; on iOS pulling down stretches the photo |
| FAQ question | tap | expand/collapse (selection haptic) |
| Gallery tile | tap / swipe rail | lightbox at index / rail snaps |
| Board row | tap | push `/board/[eventId]` |
| Location card | tap | Maps app (`lib/openInMaps.ts`) |
| Claim link | tap | browser to `/claim/<eventId>` on the dashboard host |
| CTA | tap | see the table |
| Organiser discs | tap | edit modal / announcement modal / delete sheet |
| Lightbox | swipe, pinch, swipe down, × | page / zoom images / dismiss / close |

**Feedback, with file:line:** hero crossfades over the skeleton, 220ms (`EventDetailScreen.tsx:186, 1323-1356`); sections `FadeInUp` at 0/40/80/120ms (187, 1366-1517); parallax, stretch and caption fade (`SceneHero.tsx:127-161`); hero pager paging animation (`SceneHeroMedia.tsx:84-95`); dots change width with no animation (306-312); attendee count rises on change (`SceneSections.tsx:224-232`); map fades in (301-303); FAQ chevron rotates 220ms, answer `fadeInFast` (860-876); CTA label `riseIn` / icon `popIn` (770-784); confetti (`EventDetailScreen.tsx:1730-1734`); toast. Haptics: Part 1.2.

**States**
- **Loading:** from a card, an **instant outline** from params (title, cover, venue, date) with the sections absent until the fetch lands. From a deep link with no params, a hero-height skeleton block only (`EventDetailScreen.tsx:1324-1326`). A cached detail paints first (460-524). The map mounts after interactions (541-550).
- **Error (no data):** "Couldn't load this event" / "Check your connection and try again." / **Try again** (accent) + **Go back** (surface) (1121-1145). Not found: "Event not found" + Go back (1146-1153).
- **Partial:** outline on screen but the first fetch failed: tray "Couldn't load everything / Some details are missing. Check your connection and try again." with Not now / **Try again** (438-443). Later background failures stay silent.
- **Offline:** no banner on this screen; failures surface as the error state, trays or toasts.
- **Permission denied (location):** handled inside the check-in flow (`getLocationFix` trays in `lib/useCheckInFlow.ts` / `lib/checkIn.ts`); the CTA stays "Blend in".
- **Coverless:** a flat dark hero panel with the caption (`SceneHero.tsx:314-323`; `SCENE.md` "The coverless case"). It still sits under the opaque bar.
- **Empty sections:** byline, description, amenities, details, gallery, attendees, board, location and claim each render only when they have data. Gallery needs more than one item; attendees need a count above 0.
- **Lifecycle:** before doors, running (live byline, CTA "Blend in", "Attendees" label, Board hidden), checked in, ended (attended / not attended). Multi-day events use the day's session window (`lib/eventSession.ts`).
- **Organiser:** extra column + modals.

**Data shown and source:** `GET /events/:id?include=interestedUsers&interestedLimit=6` (`EventDetailScreen.tsx:424-452`), mapped at 362-387: `title, description, short_description, city, venue_name, address, start_time, end_time, session, timezone, categories[0].name, max_capacity, current_capacity, cover_image_url, organizer.name/id, latitude, longitude, check_in_radius, media[], amenities[] (name, subtitle, icon), details (house rules, FAQ, accessibility, …), claim.url`; `userStatus` (`isFavorited, isCheckedIn, checkInStatus, checkInId, rsvpStatus going|waitlisted, userRating`); `stats` (`favoriteCount, checkInCount, rsvpCount`); `chatGroup.id`. `GET /events/:id/room-preview` → `hereCount` while live (994-1006). Sockets: event check-in and interest (579-617); `checkInChanged` bus (777-782); refetch on focus after 20s (785-798). **Generated, not real people:** attendee creature discs (`lib/pseudonymAvatar.ts`). **Mapped but never displayed:** `price_cents` (deliberately, no price), `short_description`, `interestedUsers` (faces removed for security, SCRUM-25). **Not mapped:** `door_policy`, `min_age`.

**Product rules a redesign must keep**
1. **One CTA slot whose subject changes with the clock**; never two primaries; quiet once done (`SceneSections.tsx:678-693`; `docs/SCENE.md`).
2. **No price, no "LIMITED ACCESS", no "Join the Experience"**; the scarcity pill only says something true (`SceneHero.tsx:48-73`; `lib/scarcity.ts:1-30`): either 10 or fewer left, or under 20% remaining, or FULL.
3. Capacity never disables the CTA (`SceneSections.tsx:632-637`).
4. Withdrawing an RSVP asks first; a waitlist place is said plainly (`EventDetailScreen.tsx:660-710, 742-748`).
5. **Attendee count semantics flip at the doors** ("Going"/"Interested" → "Attendees") (1196-1212).
6. **No faces in the attendee stack; creatures, not initials** (`SceneSections.tsx:173-277`).
7. Full-screen card, never a sheet; the hero starts at y=0 and dissolves into the page (`app/_layout.tsx:585-610`; `SCENE.md`).
8. **Hero title capped at 1.2× text size**: RN clips glyphs (`SceneHero.tsx:247-262`).
9. **Mount means play** for hero clips; auto-advance stops permanently after a manual swipe; **sound only in the lightbox** (`SceneHeroMedia.tsx`; `SceneLightbox.tsx:47-56`).
10. A failed or silent clip is skipped after 15s (`SceneHeroMedia.tsx:35-51`).
11. Map: a picture, not a steerable map; a tap opens Maps (`SceneSections.tsx:305-331`).
12. Entity highlighting by exact match only, never a model (`EventDetailScreen.tsx:1171-1177`).
13. Report-event is always reachable, with no check-in gate (1281-1296).
14. Claim link: server-decided, quiet, **never a button, never in the CTA dock** (`PLACEHOLDER_SCREENS.md:614-633`).
15. The Board is visible before the run's first doors only (`EventDetailScreen.tsx:1445-1464`).
16. Check out is not on this screen (800-811).
17. The CTA carries no haptic of its own (handlers do), to avoid a double buzz (`SceneSections.tsx:744-748`).

**Redesign opportunities**
- **The top bar is opaque over a full-bleed hero** (Part 0 bug 1). A GLASS-CTRL bar, transparent at the top and gaining blur and tint as the hero scrolls away, is exactly the frame's intent. The bar's 32pt `surface` discs become glass discs on the photo.
- **Hero meta is thin:** date and start time only. No end time ("21:00 — Late" was designed and dropped, `EventDetailScreen.tsx:957-965`), no venue, no category, no live state on the hero itself (live only appears as a small green-dot byline below the fold).
- **Scarcity pill** sits on a 60% `scrim` with a hairline: a candidate for a glass chip, or a warm tint when FULL or nearly full.
- **CTA pill is solid accent or solid dark** inside a gradient fade. Target: a GLASS-CTRL dock with a brand-gradient loud pill. **Consider a secondary affordance next to it** (heart or share) since the bar's actions scroll out of thumb reach. The 900ms dead "checked" stage is invisible state; design a transition.
- **Organiser column** (three grey discs) and both modals are explicitly undesigned (`SCENE.md` "Open asks" 2).
- **Attendee row is sparse**: a heading, a grey number and three emoji discs. Could carry live/RSVP context (for example "12 going · 3 here now") within the identity rules.
- **Location card** is a big dark slab with 56pt of internal bottom padding (`SceneSections.tsx:974-975`) and a dead map. Fine as SOLID; add distance and "Directions" affordance text.
- **Amenity tile colour is arbitrary** (alternating violet/grey by index, `SceneSections.tsx:544-557`). Re-map to the new brand violet or neutral outlined glyphs.
- **Gallery rail** works; videos show a scrim play badge. Lightbox chrome (close, counter) is SCRIM; move it to glass.
- **Section rhythm**: everything is `heading` + body at a 32pt gap with no dividers; the long page reads flat. Orbs behind the post-hero area would help the "dissolve" feel.
- **Share** should carry a deep link, and maybe a share card.

---

### 2.3 `/nearby-events` — Nearby events ("View all")

- **Files:** `app/nearby-events.tsx` (405 lines). Renders `NearbyEventCard`, `SkeletonBlock`, `FadeInUp`, `ScalePress`.
- **Job:** The full list behind the Pulse's Nearby section: everything in the **same stored city**, nearest first, with a distance label.
- **Entry/exit:** pushed from the Pulse Nearby **VIEW ALL** (`events.tsx:2122`) as a default stack card (`app/_layout.tsx:691-697`, `routeTransition`). Exits: back chevron, swipe back, a card → `/event/[id]`, "Browse events" → the Pulse tab, OS Settings.
- **Primary action:** none on the list. In each empty/error state, its single button is accent (Open Settings / Try again / Browse events) (`app/nearby-events.tsx:386-394`).

**Content, top to bottom:** (1) header row: 48pt back chevron (no disc), centred "Nearby events" in `heading`, spacer (278-292). (2) Body: a list of full-width `NearbyEventCard`s (width `min(420, screen − 48)`), 24pt apart, with time "Today · 9:00 PM" and location = distance ("1.2km away") or venue/address (251-272). No section headers, no map, no filters, no count.

**Interactive:** back; card tap → Scene (prefetch + hero preload, **does not pass `interestCount`**: 218-245); **pull-to-refresh** (`FlatList` `refreshing`/`onRefresh`, 356-363); empty-state buttons. **No long-press, no save.** Auto-retry when returning from Settings with permission granted (190-204).

**Feedback:** first 6 rows `FadeInUp` staggered 40ms (57-70, 258-261); empty states `FadeInUp`; skeleton pulse with a 720ms floor (83). Haptics: only the empty-state buttons (ScalePress default).

**States:**
- Loading: 3 skeleton blocks at the card's aspect, **radius 24 vs the card's 32** (294-302).
- **Location denied:** location-outline 48pt, "Location access needed" / "Turn on location to see events near you." / **Open Settings** (303-315).
- **Location unavailable** (permission granted, no fix): navigate-outline, "Location unavailable" / "Couldn't find where you are. Try again in a moment." / **Try again** (316-324).
- **Load failed with nothing on screen:** cloud-offline, "Couldn't load events" / "Check your connection and try again." / **Try again** (325-340). A failure with a list on screen keeps the list silently (171-174).
- **Empty:** calendar-outline, "No nearby events" / "There are no events near your current location." / **Browse events** (341-354).
- No offline banner. No first-run state.

**Data:** `GET /events?city=<stored city>&lat&lon&limit=50&sortBy=distance&sortOrder=asc&status=published` (122-151); client re-sorts by haversine (`getDistanceKm`), drops events without coordinates (155-165). The device location is requested **on mount** (it calls `requestForegroundPermissionsAsync`, 98-120), unlike the Pulse.

**Rules to keep:** same city as the Pulse's stored selection, **no radius cut** (130-142); a shared distance formatter (253-255); denied, unavailable, failed and empty are four different states, never conflated (77-80, 303-354); never claim "no events" on a network error (171-174).

**Redesign opportunities:**
- The header is a bare chevron and a centred title, unlike the Pulse/Scene bar: make it the same GLASS-CTRL bar.
- `container` background is `'transparent'` (370), relying on whatever sits behind the stack, which is the ideal place for the ORB backdrop to show through.
- A list of identical tall photo cards with text on scrim; no grouping by distance band, no map toggle, no save, no long-press. Consider tighter rows (the Upcoming row shape) with distance as the lead datum, or a distance-banded list.
- Empty-state icons are bare 48pt glyphs, inconsistent with the Pulse's tile and `LoadState`.
- The skeleton radius mismatch.

---

### 2.4 `/event-preferences/[eventId]` — Why you're here, and whether people can see you

- **Files:** `app/event-preferences/[eventId].tsx` (422 lines). Renders `EmberButton` (`components/onboarding/EmberControls.tsx:67-120`), `ScalePress`, RN `Switch` with `SWITCH_COLORS`, `Text`, toast. Logic: `lib/reveal.ts`, `lib/intents.ts`.
- **Job:** Per-event override of intent, and the per-room reveal switch (real name and photo visible in this room). `DESIGN_HANDOFF.md` calls reveal "the single most important new screen".
- **Entry/exit:** **modal presentation** (iOS page sheet; Android slides from the bottom), because it draws a close ✕ (`app/_layout.tsx:644-657`). Reached from the check-in trays when the server says `intentNeeded` (`?askIntent=1`, which leads with intent: `events.tsx:745-749`, `lib/checkIn.ts`), the room visibility banner/chip (`components/RoomVisibilityBanner.tsx`, with `?revealed=1|0`), the Blend'n room settings (`components/blendn/BlendnScreen.tsx`), and the profile. Exit: ✕ or a successful Save (`router.back()`).
- **Primary action:** **Save** (accent `EmberButton`, pinned under the scroll) (351-363).

**Content, top to bottom** (normal order; with `askIntent` the two blocks swap, 345-347):
1. Top bar: a 48pt ✕ (left) (314-324).
2. **Reveal block:** `title` "Can people see who you are?" + body "By default you appear as a made-up name, and people see what you have in common rather than who you are. Turning this on shows your real name and photo to people in this room." Then a `surface` card (radius 16): "Show my name and photo here" / meta "This event only. It does not change anything anywhere else." + Switch. When on, a second row fades in under a hairline: "Do this at future events too" + Switch. If there is nothing to reveal, the switch is disabled and the meta line reads "Add {a photo | a name | a name and a photo} to your profile first — that's what other people would see." (224-283).
3. Hairline divider (32pt margins).
4. **Intent block:** `title` "Why are you here tonight?" (or "Why do you go out?" with askIntent) + body ("Just for this event. It overrides your usual answer for tonight without changing it." / "It shapes who you're introduced to. We'll remember this for future events — change it any time from your profile."). Rows (`surface`, radius 16, label + hint, white fill + check when selected): **Networking** "People to work with or learn from", **Making friends** "People to spend time with", **Dating** "Something romantic" (**hidden under 18**), then a centred "OR" label and **Just here for the event** "Not looking to meet anyone" (exclusive: clears the others) (285-310).
5. Footer: **Save** (56pt pill; disabled until a choice is made in askIntent mode; spinner while busy).

**Interactive:** ✕; intent row tap (toggle via `toggleIntent`, selection haptic on press-in); reveal Switch; remember Switch; Save. Scroll.

**Feedback:** row fill and label colour transitions at 160ms (77-79, 209-216); remember row `fadeInFast` (255); ScalePress scale on rows. Switches are native. No haptic on Save or switches.

**States:** profile loading (no visible state; the switch is enabled until readiness resolves, and an error fails open: 130-155); **capability gate** (switch disabled + "Add … first" copy); under-18 (Dating hidden); askIntent first-door variant; save failure → error toast with the server's sentence (for example "Dating is for 18+") (180-190); saving → button spinner. **Intent rows always open empty** (there is no GET for per-event preferences, and an untouched intent is not sent: 103-114).

**Data:** `GET /profiles/:id` (name, photos, age) for the reveal gate and under-18 check; `PUT /events/:id/matches/preferences` `{ intent?, rememberIntent?, revealed, rememberReveal }` (162-193); `revealed` param from the caller.

**Rules to keep** (`PLACEHOLDER_SCREENS.md:178-260`, file header 24-62): reveal **defaults off** and off must never look unfinished; **reveal is per event**; **no profile-strength or completeness framing**, ever; **never show who else revealed**; intent is a tag, not a partition, and "Just here for the event" is first-class; reveal leads unless intent is the question that brought them; untouched intent is never sent; Dating is 18+ (hidden here, refused server-side); disabled reveal names what is missing; Save is a real button with announced disabled/busy (`__tests__/eventPreferencesScreen.test.tsx`).

**Redesign opportunities:** it is a modal with a bare ✕ and a flat page. This is a GLASS-SHEET candidate (a tall sheet over the room, with the ORB backdrop dimmed behind). The reveal switch is the most consequential control in the product and is drawn as a generic settings row; give it a deliberate, calm treatment (a preview of what others see: pseudonym avatar vs your photo) **without any completeness meter**. Intent rows could be a visual chip grid with hints (`PLACEHOLDER_SCREENS.md:256-258` leaves "rows vs chips" open). Save has no haptic or success confirmation beyond dismissing.

---

### 2.5 `/rate/[eventId]` — After the night (rating)

- **Files:** `app/rate/[eventId].tsx` (642 lines). Renders `Face` (`components/blendn/Face.tsx`), `ScalePress`, `Text`, toast. Logic: `lib/ratePeople.ts` (`ratePeople`, `askAboutNight`).
- **Job:** Ask privately how the night was (one tap), then about each person you matched with (scale, issue, note). Skipping is free.
- **Entry/exit:** stack **card** (`app/_layout.tsx:633-642`). From the Scene CTA `rate` state (`EventDetailScreen.tsx:1090-1093`), Going tab past rows, the room's end-of-night recap (`components/blendn/RoomRecap.tsx`), the Blend'n screen, saved events, and rating pushes (`lib/notifications.ts`). Exit: ✕ or Done → back, or `/(tabs)/going` when there is no history (343).
- **Primary action:** **Submit** on a person step; **Done** in the done state; **Try again** in the error state (all accent `primaryButton`, 630-639). The night step has no accent; the scale itself is the action.

**Content and flow**
- **Top bar:** ✕ left; "n of N" caption right on person steps (345-362).
- **Step "The night"** (if not already rated; 429-464): eyebrow "THE NIGHT"; `title` "How was {event title}?" (3 lines, cap 1.4); body "One tap. It helps whoever puts on the next one."; **five 48pt pill chips 1–5** in a row (`surface`, white fill when chosen) with "Not great" … "Loved it" under the ends; **tapping a number sends immediately** and advances; text button **Skip to the people** / **Skip**.
- **Step per person** (465-569): centred **Face** 112pt (photo or fallback) + name (`title`) + meta "Only we see this. They will never know you rated them, or what you said."; heading "How was meeting them?" + scale ("Not for me" … "Would meet again"); heading "Did anything go wrong?" + 5 option rows (Nothing went wrong / They made me uncomfortable / They didn't turn up / They weren't who they said / They harassed me) (117-123); choosing harassment fades in red meta copy "This goes straight to our moderation team, not into any score. Someone will read it."; heading "Anything you want to tell us?" + a multiline note (500 chars, placeholder "Optional. Only we read this"); **Submit** (disabled until a rating is chosen; "Saving…" while busy); **Skip this person**.
- **Done** (404-428): `display` "Thanks" / "Nothing to rate" / "All done"; body "This is only ever seen by us. Nobody you rated will know." / "You can rate people you matched with, once the event has finished." / "Nothing was sent. You can come back to this from Going."; **Done**.

**Interactive:** ✕; scale chips (night: send on tap; person: select); issue rows; note input (the scroll jumps to the end when the keyboard shows, 215-221; interactive keyboard dismiss); Submit; Skip; Done; Try again.

**Feedback:** step transitions: the outgoing layer fades out in 120ms while the incoming one fades in rising 8pt over 220ms (94-108, 405, 430, 471); chip and option fills 150ms (114-115); harassment warning `fadeInFast` (523). Haptics: selection on changed choices and on the night tap; selection on press-in for Submit, Done and Try again; **no success haptic**; deliberately **no celebration** (76-93).

**States:** loading = a bare spinner under the top bar (364-371); **error** = 24pt cloud-offline, "Couldn't load who you met" / "Check your connection and try again." / **Try again** (373-393); "Nothing to rate" is only the server's real answer (66-67, 397-398); save failure → toast "Couldn't save that. Try again." (128, 296-341); submitting disables the controls.

**Data:** `GET /events/:id/peer-ratings` (ratable user ids; **the gate**), `GET /conversations` (faces and names you know them by, never the public profile), `GET /events/:id` (title, `userStatus.userRating`), `GET my event rating` (244-273); writes `POST /events/:id/rating` (1-5) and `POST peer rating {userId, rating, issue, note?}`.

**Rules to keep** (file header 31-74; `PLACEHOLDER_SCREENS.md:144-174`): **never visible to the person rated**; **no star average anywhere, ever**; only people you mutually matched with (server list, never assembled client-side); only after the event; **harassment is not the bottom of the scale** and routes to moderation; **skipping is free**, with no nagging, guilt copy or progress pressure; a scale of five plain steps with words, **not stars** (reads as a public review); no celebration; a failed load is never "Nothing to rate".

**Redesign opportunities:** the loading state is a lone spinner on black. The night step is a strong single-question moment and could use the event's cover or a mood treatment (still private, no celebration). The 1-5 chips are generic number pills; consider a more expressive but non-star scale (the "whether it should resemble a rating widget at all" question is open, `PLACEHOLDER_SCREENS.md:171-174`). The person step is a long form: Face, scale, five full-width option rows and a note. Consider progressive disclosure (issues only after a rating, the note behind "Add a note"). "n of N" is the only progress cue. A soft success haptic on Submit would fit "private note" better than a selection tick on press-in.

---

## Part 3. Special-emphasis deep dives

### 3.1 The event card family

| | **FeaturedCard** (`components/pulse/FeaturedCard.tsx`) | **UpcomingCard** (`components/pulse/UpcomingCard.tsx`) | **NearbyEventCard** (`components/NearbyEventCard.tsx`) |
|---|---|---|---|
| Where | Pulse Featured carousel | Pulse Upcoming + "More events" + search/filter results; also the Going tab | Pulse Nearby (4) + `/nearby-events` |
| Shape | square photo (aspect 1) + text body under it | horizontal row: text left, 96pt square thumb right | single photo card, aspect 363:249 |
| Size (390pt phone) | 318 wide when peeking (`SCREEN_W − 24 − 16 − 32`), 342 solo; clamped to fit above the tab bar, min 60% of max (`featuredCardLayout` 66-93); body 98pt (`FEATURED_BODY_HEIGHT` 40-41); about 183pt square on a 667pt phone | full content width (342), padding 16, gap 16; thumb 96 (`UPCOMING_THUMB = CONTROL.md*2`, 11) | full content width (342; nearby-events `min(420, w−48)`), height ≈ 235 |
| Radius | photo 32 | card 16, thumb 8 | 32 |
| Surface | photo well `surfaceMedia`; body on the page | `surfaceSunken` row | photo full-bleed; no-cover = `surface` |
| Image treatment | `FeedMedia` playlist (cover first, then gallery and clips); only the active card animates or plays; stills cross-dissolve 320ms every 4s | `EventCover` still, 150ms fade-in; on failure or absence the **gradient monogram at 35%**; retries on pull-to-refresh | `OptimizedImage` still, 150ms fade, CDN-sized |
| Scrim | none on the photo; the tag pill sits on `scrim` 60% | none; the heart disc sits on `scrim` | **3-stop gradient over the whole card**: bg at 8% → 42% → 74% (148-155); same on no-cover |
| Text | tag pill top-left (`label` caps, category); title `title` 24/30, 2 lines (cap 1.3); meta row: calendar-outline + "Today"/"Oct 24", location-outline + venue/city | eyebrow `meta` "7:00 PM · Nightlife [· note]" (note in white or red); title `bodyStrong` 2 lines; location-outline + place; people-outline "N joined" + navigate-outline "1.2km away"; optional text action ("RATE PEOPLE YOU MET") | title `title` 2 lines **on the photo**; time-outline + time range; map-outline + distance or venue; all white |
| Actions | tap → Scene; long-press (~500ms) → tray; VO "Quick actions" | tap → Scene; long-press → tray; **heart** (32pt scrim disc on thumb, filled white when saved, swell); optional text action | tap → Scene; long-press (320ms) → tray (Pulse only) |
| Press | scale 0.98, no haptic | scale 0.98, no haptic; heart opacity .85 | scale 0.97, no haptic |
| Live / tonight | none | eyebrow "Happening now" / "Tonight · …" only in "More events" (via `nextUpLabel`), notes "Checked in" / "Ended" (`events.tsx:1772-1786`) | none (time range only) |
| Material (target) | SOLID (body) + SCRIM (tag) | SOLID row; SCRIM heart on thumb | SOLID card; SCRIM text treatment, or move text under the photo for consistency |

### 3.2 The Scene hero and floating CTA

- **Hero:** see 2.2 item 2. Height `width × 574/390`; full-bleed under the bar; clip-first swipe pager with auto-advance until the first swipe; dots top-right (hidden under the opaque bar); a clear-to-`bg` gradient from 25%; caption (scarcity pill, `display` title, filled Material date/time icons); parallax 0.5x, pull-stretch, caption fade at 45%; tap → lightbox; coverless = `surfaceSunken`.
- **CTA:** the six-state table in 2.2. Geometry: content-width pill, `paddingHorizontal 32`, `paddingVertical 15` + 1pt border = **56pt**, 24pt icon + `button` label, radius pill (`SceneSections.tsx:1046-1080`); dock `paddingTop 12`, `paddingBottom 16`, **no safe-area inset** (Part 0 bug 2); gradient fade from `bgClear` to `bg` at 55% behind it (`EventDetailScreen.tsx:1533-1560`). Loud = accent fill and border, `#5B1600` ink; quiet = `surfaceSunken` + hairline, white ink. **Target:** a GLASS-CTRL dock; the loud pill gets the brand gradient (the screen's only gradient); quiet = glass pill.

### 3.3 Long-press preview on the Pulse
See 2.1 "Long-press preview". Key facts for design: it is a **text-only `ActionTray`** (`components/ActionTray.tsx`: `surfaceSunken` sheet with a hairline, grabber, `title`, `body` message, 56pt pill buttons, first two in a row, drag-to-dismiss), with no media, **no haptic on open**, inconsistent delays (default vs 320ms), discoverable only through a one-time tip banner and the VoiceOver action. Check-in from here **skips** the rules interstitial that the Scene shows. **Target:** a GLASS-SHEET "peek" with the cover/clip, date, venue, distance and live state, and the same quick actions; haptic on recognition.

### 3.4 City picker
`events.tsx:2750-2868`: `SheetModal` + `RisingSheet` (`surfaceSunken`, top radius 24, 70% max height, grabber), title "Browse events in" (`heading`). Optional **locate row** first, with a **dashed** 1pt border, navigate-outline, "Use my current location" / device city (hidden when already browsing there). Then the list: **illustrated `CityArtCard`s** for Bengaluru/Mumbai/Delhi (a living SVG skyline at the city's own time of day, the English name + the native-script name over the sky, "N events", "You're here"; active = **accent** border + accent check), else plain `surface` rows (city, navigate icon if here, count; active = white fill). Empty list: "No cities have published events yet." (+ "Turn on location to browse where you are."). A tap writes the choice to storage and closes. **No search, grouping, recents or "near you" section**; "fine at three and unusable at forty" (`PLACEHOLDER_SCREENS.md:467-470`). Trigger: the 32pt chip on the headline (2.1). **Target:** GLASS-SHEET; decide one selected treatment; plan for 40 cities.

### 3.5 Search
`PulseHeader.tsx:141-211` + `events.tsx:375-450, 1906-1916`. A 48pt `surface` pill field, search glyph ↔ spinner while refining, 1pt focus ring in `textTertiary` (150ms), clear ✕ fades in. **City-scoped** (the `city` param is still sent). 350ms debounce; clearing is instant. Results: a flat, **headerless** list of `UpcomingCard` rows with date+time eyebrows; no result count, no recents, no suggestions, no category shortcuts. Empty: "No matches / Nothing here matches "{term}" in {city}." + Clear search. The field scrolls away with the page. `GET /events?search=` was first used by this screen (`docs/PULSE.md`).

### 3.6 Filters
`components/pulse/FilterControl.tsx`: a sheet (`surfaceSunken`, radius 24, 80% max), title "Filters" + "Clear all" (when any are set); groups with `label` caps: **WHAT** ("Anything" + server parent categories; hidden if the list fails), **WHEN** (Any time / Today / This weekend / This week; local-day maths in `lib/eventFilters.ts:89-121`), **HOW FAR** (Any distance / 2 / 5 / 10 / 25 km; **hidden without a location fix**). Chips are 48pt pills, white fill when on, 150ms colour transition, selection haptic. A pinned accent **Show results** (56pt). It edits a draft; dismissing discards the draft; tapping a chosen chip clears it. Applied filters show **only as a count badge** on the filter button; there are no active-filter chips on the feed. **Target:** GLASS-SHEET; consider active-filter chips under the search row.

### 3.7 "Live now", "happening tonight" and scarcity, as shown today
- **Live now:** Pulse: no live badge on Featured or Upcoming (both exclude started events, `events.tsx:1827-1831`); in "More events" a plain eyebrow "**Happening now**" (`lib/pulse.ts:100-126`), no dot; "Checked in" / "Ended" notes. Tab bar: the centre Blend'n disc shows a still status dot or ring when you are in a room (`docs/PULSE.md`, `NAVIGATION.md`). Scene: a **green still dot + "N here now"** in the byline while live (`SceneSections.tsx:121-155`); the attendee heading flips to "Attendees"; the CTA becomes "Blend in". Motion is deliberately absent ("a still mark, never a pulse", `lessons.md:16`).
- **Tonight:** `nextUpLabel` says "**Tonight · 6:30 PM**" (later today, from 5pm) only on "More events" rows (and the Going tab). Featured says "Today"; Upcoming groups under "Today". **There is no Tonight section on the Pulse.** "See what's on tonight" is the ended-event CTA, which opens the Blend'n overlay (`TonightView`).
- **Scarcity:** only on the **Scene hero pill**: "N SPOTS LEFT" / "1 SPOT LEFT" when 10 or fewer remain or under 20% (taking the larger of RSVPs and check-ins), "FULL" when none remain; door-policy labels exist but are unreachable (Part 0 bug 4). **Nothing on any Pulse card.** "N joined" on Upcoming reads `current_capacity` (Part 0 bug 5).

### 3.8 The rating flow
See 2.5. Entry is mostly the Scene CTA after an attended event ("Rate who you met" / "Rate the night"). Steps: night (one tap sends) → people (one by one) → done. Private, no stars, no celebration, skippable.

### 3.9 Media and video behaviour
- **Feed (FeaturedCard only):** `feedPlaylist` = cover, then `event_media` in order (images, and clips that have a poster) (`lib/feedMedia.ts:132-161`). Only the **settled card** (60% visible for 250ms) walks it; stills dwell 4s and cross-dissolve 320ms; **clips play muted, with no controls and no PiP, and advance on end** (loop only if the clip is the only item); the opening still is always painted underneath; leaving the card resets it to item 0; **Reduce Motion shows the first still only** (`FeedMedia.tsx`, `FeedVideo.tsx`). Upcoming and Nearby cards are stills only.
- **Scene hero:** `clipFirst(feedPlaylist(...))` leads with the clip; a swipeable pager auto-advances (stills 4s, clips on end) **until the first manual swipe, then never again**; a clip **mounts only on the current page** ("mount means play"); muted; loops once auto-advance is off; a 15s readiness watchdog skips dead clips; Reduce Motion disables auto-advance (`SceneHeroMedia.tsx`).
- **Gallery rail:** posters only, with a play badge; videos never autoplay in the rail.
- **Lightbox (`SceneLightbox`):** a full-screen fade modal; images pinch-zoom (zoom disables paging and dismissal); **clips play with sound and native controls**, loop, the poster shows until ready; swipe down to dismiss; "n / N" counter and ✕ on `scrim` discs.

---

## Part 4. Components (compact)

Format: **path** · role · used by · variants/states · interactions · motion/haptics · **target material** · notes.

- **`components/pulse/PulseTopBar.tsx`** · overlay header: leading slot, title (default "Blend'n", `button` white), actions slot · Pulse, Scene, Banter (`app/(tabs)/chat.tsx`), previews · `topInset` override for sheets; `pointerEvents` none when it has no controls · slots only · none · **GLASS-CTRL** · opaque `bg` today (127-136) and covers the Scene hero top; `TOP_BAR_HEIGHT = 64` feeds layout maths in `FeaturedCard` (`CHROME_ABOVE_CARD`).
- **`components/pulse/PulseHeader.tsx`** · "The Pulse" headline + city chip + search + filter button · Pulse, preview · `searching` spinner, filter count, focus ring, clear button · tap chip/filter/clear, type · focus ring 150ms, glyph↔spinner crossfade, clear fade, ScalePress; no haptics · headline: page (ORB); search row: **GLASS-CTRL** if pinned, else SOLID · `PULSE_HEADER_HEIGHT` (50) feeds Featured sizing; the "Pulse" accent is the screen's one accent.
- **`components/pulse/NotificationBell.tsx`** · bell + unread badge + notifications sheet · Pulse, Banter · badge (99+ via `badgeLabel`), sheet states: loading spinner, failed ("Couldn't load notifications" + accent Try again), empty ("Nothing yet / Friend requests, matches and event updates land here."), list (unread dot, title, 2-line body, age) · tap bell (marks all read, optimistic), tap row (`navigateFromNotificationData`), CLEAR → confirm tray ("Clear all notifications? / This removes them for good." Keep / destructive Clear all) · badge `popIn/popOut`; sheet rise; no haptics · bell **GLASS-CTRL**; sheet **GLASS-SHEET** · reloads on focus and on a socket ping (92-105); there is no pull-to-refresh inside it by design.
- **`components/pulse/SectionHeader.tsx`** · section heading + optional text action / prev-next arrows · Pulse, Going, Profile · arrows only when handlers are passed; disabled arrows dim · tap action/arrows · ScalePress, no haptic · page type (no material) · action label is neutral white `label` caps.
- **`components/pulse/FeaturedCard.tsx`** · hero carousel card · Pulse, preview · solo vs peeking width; active (plays media) vs inactive; with or without tag; no media = empty `surfaceMedia` square (never shown in practice: Featured requires a cover) · tap, long-press, VO action · ScalePress 0.98, no haptic · **SOLID** body + **SCRIM** tag · `featuredCardLayout` is load-bearing; it must clear the tab bar.
- **`components/pulse/FeedMedia.tsx`** · media walker for feed cards · FeaturedCard · inactive = still; active = slideshow/clip; Reduce Motion = still · none (pointerEvents none) · 320ms dissolve, 4s dwell · inside SOLID card · keeps the opener mounted as the floor.
- **`components/pulse/FeedVideo.tsx`** · muted autoplay clip (mount = play) · FeedMedia · loop vs onEnded · none · none · n/a · no controls, no PiP, not accessible.
- **`components/pulse/FilterControl.tsx`** (`FilterSheet`) · the filter sheet · Pulse · categories present or absent; location present or absent; count > 0 shows "Clear all" · chips, Clear all, Show results, backdrop tap, drag down · chip colour transition 150ms + selection haptic; sheet rise · **GLASS-SHEET** (Show results = gradient primary) · applies on Show results only.
- **`components/pulse/UpcomingCard.tsx`** · event row · Pulse (Upcoming, More events, results), Going tab, preview · with/without image (monogram), heart on/off/busy, note (default/destructive), action, joined/distance optional · tap, long-press, heart, action, VO · ScalePress 0.98; HeartIcon swell; heart `tap` haptic comes from the handler · **SOLID**; heart **SCRIM** · the most reused card; `retry` prop re-attempts covers.
- **`components/scene/SceneHero.tsx`** · full-bleed hero with caption · Scene, preview · playlist vs still; coverless; scarcity present/absent · tap media (via pager) · parallax, stretch, caption fade (Reanimated, UI thread) · hero = photo; caption **SCRIM**; scarcity pill **SCRIM**/glass chip · title cap 1.2; `accessibilityRole="header"` groups the caption.
- **`components/scene/SceneHeroMedia.tsx`** · swipeable, auto-advancing media pager + dots · SceneHero · 1 item (no dots) / many; manual vs auto · swipe, tap · pager scroll; dots snap · photo + **SCRIM** dots · dots are probably hidden under the bar; clip watchdog 15s.
- **`components/scene/SceneLightbox.tsx`** · full-screen media viewer (images + clips with sound) · Scene, preview · single/multi (counter); zoomed; clip ready/not ready · swipe page, pinch, swipe down, ✕ · modal fade, SwipeToDismiss, ZoomableImage · chrome **SCRIM** → glass discs · safe-area-aware chrome.
- **`components/scene/SceneSections.tsx`** · `SceneHeading`, `SceneByline` (host + live dot), `SceneBody`/`SceneBodyAccent`, `SceneAttendees` (creature stack), `SceneMap` (static `MapView`), `SceneLocationCard`, `SceneGallery`, `SceneAmenity` (+`AMENITY_TINTS`), **`SceneCTA`** (6 states), `SceneDetails` (prose/pairs/FAQ) · Scene, preview · per section above · CTA tap; FAQ tap; gallery tap/swipe; map tap (if `onPress`) · CTA riseIn/popIn; count riseIn; map fade; FAQ rotate + fade; FAQ selection haptic · byline/body/heading: page (ORB); attendees, location card, amenity tiles, details: **SOLID**; gallery tiles SOLID + SCRIM badge; **CTA: GLASS-CTRL dock + gradient loud pill / glass quiet pill** · `SCENE_CTA_HEIGHT` and the location card's 56pt bottom pad are pinned by `sceneCta.test.ts`.
- **`components/cityArt/CityArtCard.tsx`** (`CityArtCard`, `CityArtBanner`) · illustrated city row / empty-state banner · city picker (blr/bom/del), Pulse empty states · active (accent border + check), here ("You're here"), time of day (day/dusk/night) · tap (card) · scene loops; ScalePress 0.98, no haptic · card **SOLID** inside a GLASS-SHEET; banner in page · the script line uses the system font (no Kannada/Devanagari in the app fonts).
- **`components/cityArt/CityScene.tsx`** · SVG skyline renderer with UI-thread motion layers · CityArtCard/Banner · fit meet/slice; `tod` override; Reduce Motion = phased still frame · none · infinite linear/wave loops; palette rechecked each minute · illustration (no material) · needs `react-native-svg` in the binary.
- **`components/cityArt/scenes.tsx`** · the drawings (sky, stars, clouds, kites, skylines, trees, petals, bulbs; Bengaluru, Mumbai, Delhi) · CityScene · per city × time of day · n/a · per-layer motion specs · illustration · to add a city, draw a `Layer[]` + `INFO` + `ALIASES` (`docs/PULSE.md` City art).
- **`components/cityArt/drawable.ts`** · `drawableCityArt`, returning null on builds without SVG · Pulse · n/a · n/a · n/a · n/a · protects OTA updates to old binaries.
- **`components/EventCover.tsx`** · event image with a guaranteed fallback (gradient monogram at 35% on `surface`) · UpcomingCard, Going tab · image / placeholder / failed (retry by `retry` bump) · none · 150ms fade · inside SOLID · logs failures (SCRUM-285/286/480).
- **`components/NearbyEventCard.tsx`** · large photo card with text on a scrim · Pulse Nearby, nearby-events, preview · with/without cover (plain `surface` + scrim, **no monogram**) · tap, long-press (320ms), VO · ScalePress 0.97, no haptic; image fade 150ms · **SOLID** card, **SCRIM** text · `NEARBY_CARD_ASPECT` exported for skeletons; the skeletons use radius 24 vs the card's 32.
- **`components/OptimizedImage.tsx`** · CDN-sized `expo-image` wrapper with recycling key, optional fallback/placeholder, progressive mode (off by default), loading spinner · FeedMedia, NearbyEventCard, many others · loading / loaded / error / fallback · none · fade (default 200ms) · n/a · `recyclingKey` is essential in lists (44); `preloadImages` used by the Pulse.
- **`components/PhotoLightbox.tsx`** · image-only full-screen viewer · **not used by any in-scope screen** (profile, user, friends) · counter, dots (≤10), zoom · swipe, pinch, swipe down, ✕ · modal fade · chrome SCRIM → glass · close/counter at hardcoded `top: 56/60` (126-148), unlike `SceneLightbox`'s safe-area; ✕ is a `TouchableOpacity` without an a11y label.
- **`components/Skeleton.tsx`** · `Skeleton`, `SkeletonLine` (12pt pill), `SkeletonCircle`, `SkeletonBlock` · Pulse, nearby, Scene, many others · Reduce Motion = still at 0.6 · none · one shared native-driver opacity pulse 0.6↔1, 800ms legs · on page (ORB) / inside SOLID shapes · RN `Animated`, not Reanimated; no shimmer by decision.
- **`components/LoadError.tsx`** (`LoadState`, `LoadError`) · the shared empty/error block: 80pt `surface` glyph tile, `title`, body, one accent action (busy spinner) · Banter, chat, board, profile, friends, blocked users, invites; **none of the 5 in-scope screens** · with/without message/action; busy · tap action (no haptic) · none (live region polite) · page (ORB) + gradient primary · adopt it on the Pulse, Scene, nearby and rate error states.
- **`components/ui/DayHeading.tsx`** · "Today Saturday" heading (`bodyStrong` + `meta`, baseline-aligned) · Pulse Upcoming, Going, Banter inbox, preview · with/without detail · none · none · page type · header role.
- **`components/ui/PlaceholderBanner.tsx`** · red "PLACEHOLDER DESIGN — logic is final, layout is not" label · **only `app/board/[eventId].tsx`**; **no in-scope screen carries it any more** (rate and prefs dropped it on 2026-09-28) · none · none · none · n/a · if the redesign ships the Board unchanged, the banner stays there.
- **`lib/pulse.ts`** (labels, not a component) · `dayGroupLabel`, `groupByDay`, `timeLabel` ("7:00 PM"), `featuredDateLabel` ("Today"/"Tomorrow"/"Oct 24"/"Oct 24, 2027"), `HAPPENING_NOW`, `nextUpLabel` ("Happening now" / "Tonight · 6:30 PM" / "Today · 10:00 AM" / "Tomorrow · …" / "Sat, Oct 4 · …"), `placeLabel` (venue → city → null), `joinedCount` (null below 1) · Pulse, Scene, nearby, Going · ICU-less fallbacks; calendar-day maths (not elapsed hours) · the copy contract every card shares. Keep it as the single source for card strings.
- Supporting (out of scope, but these sit on the redesigned surfaces): `components/ActionTray.tsx` (every tray; **GLASS-SHEET**), `components/motion/RisingSheet.tsx` (`SheetModal`, `RisingSheet`, `SheetFlatList`/`SheetScrollView`; **GLASS-SHEET**), `components/ui/Grabber.tsx`, `components/Toast.tsx` (`surface` toasts, top; **GLASS-SHEET**-like), `components/RealtimeStatusBanner.tsx`, `components/motion/{ScalePress,FadeInUp,HeartIcon,ConfettiBurst,presence,SwipeToDismiss,ZoomableImage}.tsx`, `components/onboarding/EmberControls.tsx` (`EmberButton`: the primary pill in prefs; Pressable, opacity only, no haptic), `components/board/BoardSections.tsx` (`BoardEntry` on the Scene; **SOLID**), `app/(tabs)/_layout.tsx` (`BlendnTabBar`: an opaque `surfaceSunken` bar with 32-radius top corners, accent active label and avatar ring, a 56pt **accent centre disc** with a still live dot; `TAB_BAR_CLEARANCE = 92` and `tabBarTop()` feed Pulse layout maths. **GLASS-CTRL** in the redesign).

---

## Part 5. Open questions to settle in the brief

1. **Glass reversal:** state explicitly that this supersedes `tasks/lessons.md:16` and `DESIGN_SYSTEM.md` "Surfaces are flat", and define the guardrails (glass only on GLASS-CTRL/GLASS-SHEET; no bloom; no halo; still status marks). Update `scripts/check-design-tokens.js` accordingly.
2. **Gradient mark:** image asset or `@react-native-masked-view` (a native build)? The same question for the "Pulse" title accent.
3. **Brand colours vs contrast:** label ink on the `#F05423 → #8E4BAA` gradient pill (white fails on `#F05423`); what becomes of `#FF906D` and `#F79EFF`.
4. **Satoshi weights:** map `bodyStrong`/`caption` (600 today) to 500 or 700.
5. **Which Pulse surfaces pin on scroll** (city, search, filter) and how the title collapses into the glass bar.
6. **Card family unification:** one text-on-photo policy, one icon set, the heart on every card or none, one long-press delay.
7. **A "Live now / Tonight" lane on the Pulse:** the data exists (`session`, `start_time`/`end_time`, the room preview `hereCount` per event on the Scene; `docs/PULSE.md` notes a live "● 18 checked in now" line needs the events response to carry it).
8. **Scene top bar over the hero:** transparent-to-glass on scroll; move the media dots below it.
9. **Check-in rules interstitial:** remove (owner's ask) or redesign, and make the Pulse tray and Scene paths match.
10. **Undesigned pieces still waiting for frames:** the pre-doors CTA states, the organiser column and modals, the coverless hero, the city picker at scale, banners, empty states, the long-press peek, the tab bar's in-room ring (`docs/SCENE.md` "Open asks"; `docs/PULSE.md` "For the designer").
