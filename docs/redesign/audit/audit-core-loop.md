# Blend'n client — core-loop audit for the redesign brief

Source: `the client repo (a clean origin/dev worktree)` (clean worktree of `origin/dev`, HEAD `54481d2 feat(board): turn the board on (step 6c) (#362)`). Read-only audit, 2026-10-02. Every `file:line` below is relative to that root.

Stack facts that bound the redesign: Expo SDK 57, RN 0.86.3, Reanimated 4.5.1, expo-haptics, expo-linear-gradient (used), **expo-blur installed but used nowhere**, **react-native-svg 15.15.4 installed** (used only by `components/cityArt/*`), no MaskedView, no Skia, no Lottie, no `expo-glass-effect`. Fonts are Plus Jakarta Sans (700/800) and Manrope (400/600/700) from `@expo-google-fonts` (`lib/fonts.ts:34-46`). **Satoshi is not in the app.** It isn't on Google Fonts, so it would need local TTFs plus a licence, and it would join the splash gate (`app/_layout.tsx:100-101`, `146-148`).

---

## 0. Read this first: where the brief collides with the design decisions on record

The direction in the brief (glass control layer, ambient orbs, a brand gradient on the mark and the primary action, a glow when check-in is available) reverses decisions that the repo records **and enforces in CI**. If the brief means to override them, it has to say so explicitly. Otherwise implementing it fails `npm test`.

| Recorded rule | Where | Enforced by |
|---|---|---|
| "Surfaces are flat: no shadows, no glows, no `BlurView` glass, no gradient fills." Photo scrims and pseudonym avatars are the only gradients allowed | `docs/DESIGN_SYSTEM.md:123-129` | `scripts/check-design-tokens.js:88-95` fails on `shadow*` and `<BlurView` anywhere in `app/` and `components/` (run by `npm test`) |
| "No glows, blooms or glass stacks." The owner rejected a frosted-glass CTA with an orange bloom, and the pulsing halo on the room button, as "very AI generated" | `tasks/lessons.md:16` | review rule |
| The tab bar is "Opaque and flat: no glass" | `app/(tabs)/_layout.tsx:467`, `653-656` | `__tests__/pulseNav.test.ts:98-104` (surface split and clipping) |
| Centre disc: no bloom, no border, no loop | `app/(tabs)/_layout.tsx:700-710` | `__tests__/roomButton.test.ts:135-163`: no `Animated.loop`/`halo`/`liveRing` in the bar file, no `shadowColor`/`elevation`/`borderWidth` on `centreButton`, and the dot must be its own absolute view |
| **"Motion cannot carry a state"**: invisible in a screenshot, with Reduce Motion on, and to anyone not looking at the instant it moves | `docs/NAVIGATION.md:87-92`, `lib/roomButton.ts:123-127`, `components/blendn/RoomSections.tsx:69-70` | `roomButton.test.ts:135-145` |
| **"A logo that changes colour depending on whether you are near an event is not a logo"**. The disc is the same in every state, and status lives in the dot and badge | `docs/NAVIGATION.md:67-72`, `app/(tabs)/_layout.tsx:224-235` | review rule |
| A **filled** monogram was tried by flood-filling the outline PNG and "destroys the mark — the B becomes a blob". A filled variant has to be drawn by a designer | `app/(tabs)/_layout.tsx:54-57`, `728-730` | — |
| Accent is "at most one thing per screen" plus the tab bar's own chrome | `docs/DESIGN_SYSTEM.md:85-92` | review rule |
| Reanimated layout transitions are banned on views that contain a `BlurView` or an iOS shadow, because they stutter on device | `tasks/lessons.md:5` | review rule (relevant if glass meets `LinearTransition`) |

**The owner's ask ("outlined logo fills with the brand gradient / glows when a nearby event can be checked into") contradicts the "logo is not a status light" rule above. Treat it as a deliberate reversal and update NAVIGATION.md.** Constraints that still apply:

- The state has to be legible in a still frame and with Reduce Motion on. A glow may decorate it, but the **end state must differ at rest**: for example a gradient-filled mark versus an outline mark, plus the existing dot. That keeps "motion cannot carry a state" intact.
- Accessibility labels already state the consequence per state (`lib/roomButton.ts:144-157`) and are tested (`roomButton.test.ts:197-215`).
- RN grows borders **inward**, so any ring or outline has to be its own absolutely positioned view, never a `borderWidth` on the disc (`docs/NAVIGATION.md:94-96`, `_layout.tsx:761-765`, test `:158-163`).
- Today the mark is a **PNG silhouette tinted a single colour** (`expo-image` `tintColor`, `_layout.tsx:245-251`), which cannot take a gradient. Two ways to get one:
  - **(a)** The designer supplies the monogram as **SVG paths**, rendered with react-native-svg `<LinearGradient>` fill or stroke. svg is installed. This is the recommended route.
  - **(b)** Add `@react-native-masked-view/masked-view` and mask a `LinearGradient` with the PNG. This is a new native dependency, so it needs a native rebuild.
- The real brand gradient, sampled from `assets/logo/monogram-gradient.png`, runs **#F15524 (top-left) → #925EA8 (bottom-right), diagonal**. That matches the brief's #F05423 / #8E4BAA. The in-app **accent is a different orange**: `EMBER.accent #FF906D`, which is "the warm end of the Figma #FF906D → #FF6D8D gradient", drawn flat (`lib/theme.ts:150-156`). `EMBER.violet` is `#F79EFF` (a pink-lilac, `lib/theme.ts:168`), not the brand violet. Text on the accent is `EMBER.onGradient #5B1600`, deliberately dark because white on #FF906D fails contrast (`docs/DESIGN_SYSTEM.md:111-112`). **White on #F15524 also needs a contrast check before the gradient becomes the primary button fill.**

---

## 1. The centre Blend'n button: every state, exactly as computed

### 1.1 Inputs and where they come from

`BlendnTabBar` (`app/(tabs)/_layout.tsx:292-476`) computes `target` from three inputs (`:353-362`):

| Input | Source | Refresh |
|---|---|---|
| `activeEventId` | `apiClient.getActiveCheckins()` → `checkIns[0].eventId` (`:364-374`) | Polled every **30 s** (`:378`). Re-read immediately on any check-in or check-out on this device (`subscribeCheckInChanged`, `:387`, fired by `lib/checkIn.ts:46-51`) and on app foreground (`:388-390`) |
| `insideEventId` | `lib/roomSignal.ts`, a module store published by **the Pulse** (`app/(tabs)/events.tsx:1275`, `1727`, unconditionally) and by **Blend'n Tonight** (`lib/useTonight.ts:144`, only when it has a location fix) | Only when one of those screens fetches events. **The tab bar never reads location itself** (`docs/NAVIGATION.md:108-114`) |
| `todayEventIds` | Same store, `pickTodayEvents` | Same |
| `roomUnread` | **Never passed.** `recompute` omits it (`_layout.tsx:356-360`) | — |

`pickInsideEvent` (`lib/roomButton.ts:192-216`):
- An event counts only if it has a numeric `distance` (km, from the server; present only when a fix was sent).
- `distance*1000 <= check_in_radius` (metres, **default 100** when missing, `:200-202`).
- It must be running now: `start <= now` and (no end or `end >= now`), using today's slot of a multi-day run (`liveWindow`, `:204-208`).
- When two fences overlap, the nearest centre wins (`:212`).
- **No hysteresis margin, on purpose**: a false *offer* is harmless because the server re-validates GPS (`:187-190`, `docs/NAVIGATION.md:120-124`).

`pickTodayEvents` (`:228-256`): **saved (`is_favorited`) only**, never RSVPs. It keeps events that start today in local time and haven't ended, sorted soonest first. `clearRoomSignal` runs on sign-out (`lib/roomSignal.ts:66-69`).

### 1.2 Precedence (`lib/roomButton.ts:71-88`)

```
activeEventId  → 'live'     (badge = roomUnread, which is always 0 today)
insideEventId  → 'checkin'
todayEventIds[0] → 'today'
else           → 'idle'
```

`live` outranks `checkin`, so you are never offered a check-in elsewhere while in a room. `checkin` outranks `today`, so standing at the door beats a reminder (`:60-70`). Tested in `__tests__/roomButton.test.ts:25-84`.

### 1.3 What each state looks like (current build)

The disc is identical in all four states (`_layout.tsx:700-710`):
- 56 pt circle (`CONTROL.lg`), flat `EMBER.accent #FF906D`, `overflow: hidden`, no shadow.
- Seated in the bar's row, not raised (`centreSlot` `alignSelf:'center'`, `:699`).
- Mark: `assets/logo/monogram-white-bold.png` (strokes dilated to 6.4 % width) at 32×32, tinted brand ink `#1B1931` (`:62`, `:78`, `:245-251`). It is optically nudged `translateX: 1.6` because the mark's centre of mass sits 9.2 % left of the asset's centre (`:732-760`).
- **No label under the disc** (`:277-281`). `roomButtonLabel()` (`lib/roomButton.ts:97-108`) is now dead code, used only by tests.

| State | Dot (`roomButtonGlow`, `roomButton.ts:131-135`) | Badge | Accessibility label (`:144-157`) |
|---|---|---|---|
| `live` | **Green** `EMBER.success #30D158` dot | Designed to show the room's unread count, `9+` cap, white pill with dark digits (`_layout.tsx:256-262`, `779-791`). **Never renders: `roomUnread` is never supplied, so `badge` is always 0** | "Open the room" / "Open the room. N unread messages" |
| `checkin` | **White** `EMBER.textPrimary` dot | — | "You're at an event. Check in to see who else is here" |
| `today` | **none** | — | "Open tonight's event" |
| `idle` | **none** | — | "See what's on near you" |

- **`today` and `idle` look identical**. Only two of the four states are visible.
- Dot geometry (`_layout.tsx:766-777`): 12 pt footprint, `top:1 right:1` on the slot. It's a 2 pt border of `EMBER.bg` (the "cut-out" ring) around an 8 pt core. It sits **outside** the Pressable so the disc's clipping doesn't cut it (`:264-276`).
- Dot motion: fades in once, `FadeIn.duration(220)` (`MOTION_DURATION.normal`, `:193`). It's keyed by `dot`, so switching from invite to live re-fades. After that it is still.
- Badge motion: `popIn` (opacity plus scale 0.9→1, 150 ms, `bezier(0.23,1,0.32,1)`) and `popOut` (120 ms), from `components/motion/presence.ts:26-48`. Under Reduce Motion it appears without scale.
- `showDot = dot !== 'none' && badge === 0` (`_layout.tsx:198`): the badge replaces the green dot when it shows, which is currently never.

### 1.4 Interactions

- **Tap** (any state): `openBlendn()` (`_layout.tsx:203-213`). It always opens the Blend'n overlay, and the screen picks Tonight, Room or Recap itself. Since 2026-09-28 it no longer routes per state (`docs/NAVIGATION.md:59-62`). The labels for `checkin` and `today` still describe a different action or destination ("Check in to see…", "Open tonight's event"), but the tap only opens the overlay and checks nobody in. Worth rewording.
- **Press feedback**: `ScalePress` with `pressedScale 0.9` (`:222`), a 120 ms CSS transition with `cubicBezier(0.23,1,0.32,1)`, and `Haptics.selectionAsync()` on **press-in** (`components/motion/ScalePress.tsx:48-57`, `67-79`). Reduce Motion drops the scale but keeps the haptic. Press retention is 16 pt.
- **Long-press**: **nothing.** The centre button has no `onLongPress`. The four side tabs emit `tabLongPress` (`_layout.tsx:418-423`), and **nothing listens for it**. The "Pulse's long-press tray" in the docs is a long-press on **event cards** in the Pulse (`app/(tabs)/events.tsx:1792`, `1896`, `1987`, `2072` → `handleEventPreview`, `:980-1060`), not on the bar.
- The overlay opens *out of* this disc (see §2.2). `centreButtonOrigin` duplicates the bar geometry: `y = height - max(inset-6, 20) - 28` (`components/blendn/RoomStage.tsx:40-43`, pinned by `__tests__/roomStageOrigin.test.ts`).

### 1.5 The bar around it (`app/(tabs)/_layout.tsx`)

- Order: `Pulse · Going · [Blend'n] · Banter · Me` (`:80-85`, `:469-473`).
- Ionicons: **filled when focused, `-outline` when not** (`:441`). The brief's "outlined icons" changes the focused state.
- The focused icon and label turn `EMBER.accent` (`:146`, `:684`). Labels use `TYPE.caption` (Manrope SemiBold 11/14) capped at 1.2× font scale (`:155-172`). The 24 pt `iconBox` keeps every label on one line (`:670`).
- **Me tab** shows your photo (`profile_photos[0]`, falling back to `photos[0]`, never the OAuth avatar) as a 24 pt circle with a 1.5 pt transparent border that turns accent when focused (`:136-141`, `:311-334`, `:671-680`).
- Surface: `barSurface` is absolute, `EMBER.surfaceSunken #211F1F`, top corners `EMBER_RADIUS.card 32`, and **opaque** (`:651-660`). The layout row is `space-between` over content-sized items, `paddingTop 8`, `paddingHorizontal 24`, `paddingBottom max(inset-6,20)` (`:629-649`, `:596-598`).
- The bar is **absolute** over the scene (`tabBarStyle position:absolute`, transparent, `:508-521`), so screens pad by `TAB_BAR_CLEARANCE = 92` (`:564`). Height on a home-indicator phone is 8+56+28 = 92 (`:600-610`). **The Pulse hero card is sized against `tabBarTop()`**, so any change to bar height changes the Pulse layout.
- Hit slop is up to the bar edge plus 12 pt sideways (`:586`). Tabs have **no haptic** (plain `Pressable`, `pressed` dims to 0.85). Only the centre disc ticks.
- A second tap on the focused tab scrolls it to the top (`:400-416`, `__tests__/tabScrollToTop.test.tsx`).
- While Blend'n is open, the tabs and bar are hidden from VoiceOver and TalkBack (`:489-493`) and the overlay has `accessibilityViewIsModal` (`:537`).

### 1.6 Constraints for the "fills with gradient / glows" redesign

1. **State freshness.** `checkin` lights only after the Pulse or the Tonight view has fetched with a fix. Walk into a venue with the app on Banter and the button stays dark until a Pulse focus, a foreground (the Pulse refetches then), or the overlay opening. The Pulse also publishes from location-less city feeds (`events.tsx:1275`), and those carry no distances, so an `insideEventId` gets cleared. A gradient fill tied to proximity inherits all of this. Decide whether the bar needs its own quiet location read; the docs reject a second permission dance (`NAVIGATION.md:111-114`).
2. **Permission denied means the button can never be `checkin`.** `useTonight` never prompts (`lib/useTonight.ts:60-70`), and the Pulse is where the prompt lives.
3. **Still end state.** The glow can animate in (the existing dot fades in once over 220 ms), but whatever signals "you can check in" must hold still and differ in a screenshot. No `Animated.loop` in the bar file (test).
4. **Live vs invite must stay distinguishable in colour** (test `roomButton.test.ts:153-156`), and the `live` dot must not be confused with the new check-in glow.
5. **Accessibility**: the label must name the consequence. `checkin` "puts you on a roster other people can see" (`roomButton.ts:139-143`).
6. **The disc is in the a11y tree as one `button`**. Overlay modality rules apply (`_layout.tsx:489-493`).
7. **Geometry is coupled** to `RoomStage.centreButtonOrigin`, `TAB_BAR_LINE`, `tabBarTop()` and the Pulse hero sizing. If the disc grows or rises above the bar, update all of them. The doc explains why the frame's `y=-16` raise was dropped: it collided with the Scene's docked CTA and the Pulse filter control (`_layout.tsx:686-698`).

---

## 2. The Blend'n overlay (BlendnScreen / RoomStage / TonightView)

### 2.1 What it is

`components/blendn/BlendnScreen.tsx` is **an overlay, not a route**, hosted by the tab layout over the tabs and bar and **under the root stack** (`app/(tabs)/_layout.tsx:536-540`, `lib/blendnOverlay.ts:1-21`). Profiles, DMs and the room chat are pushed **on top of it**, and Back returns to it. `/room` survives only as an address that calls `openBlendn()` and steps back (`app/room.tsx:17-24`, `app/_layout.tsx:684` animation `none`).

**Consequence:** anything on the root stack (event detail, board, settings) that calls `openBlendn()` opens it *beneath* itself, unless it first dismisses to the tabs as `EventDetailScreen.tsx:1094-1103` does. See the board bug in §5.

### 2.2 Open and close motion (`components/blendn/RoomStage.tsx`)

- **Open** (`:126-128`, `:169-192`):
  - `open` goes 0→1 over **420 ms**, `bezier(0.2,0,0,1)`.
  - A circle sized to cover the farthest screen corner, centred on the button, scales from `56/cover` to 1. Its fill `interpolateColor`s **accent → page** over the first 55 % of progress.
  - The page's opacity goes 0→1 between p 0.45 and 1 while it `translateY`s 24→0.
  - Material "container transform" with one uniform scale, so it reads as "the button becomes the room" (`:81-106`).
- **Close**: the same curve in reverse over **300 ms**. It runs back into the button, then `blendnClosed()` (`:132-138`). Triggers: the chevron-down button, Android back (`BlendnScreen.tsx:83-89`), or drag.
- **Drag to close** (`:142-167`, `:180-197`):
  - `Pan` with `activeOffsetY 12` and `failOffsetX ±24`. It only moves once the inner scroll is at the top (`scrollY`), picking up from where the finger was when the list hit the top.
  - The page follows the finger. Its scale goes `1 - pull*0.12` and its corners round 0→32 over the first 15 % of pull. The disc behind fades out over half a screen of drag.
  - It closes past **140 pt** or on a flick over **900 pt/s**. Short of that it springs back with `MOTION_SPRING.snappy {damping 16, stiffness 280, mass 0.75}`.
  - Lists inside use `bounces={false}` (`useStageScroll`, `:70-79`), so **there is no pull-to-refresh anywhere in Blend'n**. `room.refresh` exists (`lib/useRoom.ts:455-464`) but the UI never calls it.
- **Reduce Motion**: a 200 ms opacity fade both ways that starts from the page colour, never the accent (`:172-176`, `:185`). Drag still works.
- **Haptics**: none on open or close (the selection tick comes from the disc's press-in).

### 2.3 Modes (`BlendnScreen.tsx:123-141`)

```
recap snapshot present                 → 'ended'   (RoomRecap)
room.status==='ready' && !dismissed    → 'room'    (Room)
room.status==='none' || recap dismissed → 'tonight' (TonightView)
room.status==='error'                  → error panel
room.status==='loading'                → spinner
```

`room.status` comes from `lib/useRoom.ts:790-798`:
- `loading` while auth initialises or on the first load.
- `ready` when an active check-in's room is known.
- `error` when `/checkins/active` fails **and no room is known**.
- `none` otherwise.

**When the check-ins request fails, a user who isn't checked in sees "Couldn't load the room" instead of Tonight** (`useRoom.ts:296-299`; `BlendnScreen.tsx:446-460`).

Mode crossfades:
- Room enters `FadeInUp.duration(320)` (`FadeIn` under Reduce Motion) and exits `FadeOut 160` (`:336`).
- Ended enters `FadeIn 220` and exits `FadeOut 160` (`:412`).
- Tonight enters `FadeIn 220` and exits `FadeOut 200` (`:426`).
- A successful hold-to-check-in therefore turns Tonight into the Room **inside the overlay**, with no navigation.

### 2.4 The four user states the brief names, mapped to what renders

| Brief state | Button state | What Blend'n shows |
|---|---|---|
| Nothing on | `idle` | **Tonight**: the "Tonight" deck of events running now or starting within 6 h, yours first, then nearest, then soonest (`lib/roomMoments.ts:305-325`). If nothing matches, the empty state "Nothing on near you right now" with **Browse the Pulse** |
| Saved today | `today` | **Tonight**, with **no distinct treatment**: the saved event sorts first and carries "YOU'RE GOING" (`TonightView.tsx:100-104`). Note `going` there = saved **or** RSVP'd `going` (`useTonight.ts:97`), while the button's `today` counts saved only |
| Inside the fence | `checkin` | **Tonight** with the **VenuePass** docked at the bottom: "YOU'RE HERE", title, "N inside now" or "Be the first one in", an optional taste teaser, and **Hold to blend in**. Subtitle: "You're at an event — hold the pass below to check in." The pass shows only if the inside event is also in Tonight's list (`BlendnScreen.tsx:157`), which is built from the first 20 feed results (`useTonight.ts:58`) |
| Checked in | `live` | **Room** (§2.6). Once the event's `endsAt` passes, **RoomRecap** |

### 2.5 Tonight (`components/blendn/TonightView.tsx`, data `lib/useTonight.ts`)

**Content, top to bottom:**
1. Floating top bar: chevron-down close. The bar is opaque `EMBER.bg` (`BlendnScreen.tsx:468-477`, `594-604`).
2. Header (`:335-360`):
   - `display` "Tonight", plus **See all ›** (`button` text in `textSecondary`) when the list has items. See all → `/nearby-events`.
   - Meta line: "You're at an event — hold the pass below to check in." or "Check in at an event to open its room."
3. Body, one of:
   - **Skeleton**: one card-shaped block, `aspectRatio 1/1.22`, radius 32, `EMBER.skeleton` (`:362-365`).
   - **Error** (no events and no inside event): `cloud-offline-outline`, "Couldn't load tonight's events", "Check your connection and try again.", accent **Try again** (`:366-383`).
   - **Empty**: `moon-outline`, "Nothing on near you right now", "Save something on the Pulse and it shows up here on the night.", accent **Browse the Pulse**, which closes the overlay and navigates to the Pulse (`:384-396`, `BlendnScreen.tsx:437-440`).
   - **EventDeck** of at most 10 (`DECK_MAX`, `:59`). The inside event is removed from the deck because it's on the pass (`:317`).
4. Pager pips under the deck when there is more than one card: 6 pt dots, the active one 16 pt wide in white (`:175-181`, `:452-454`). Hidden from accessibility.
5. **VenuePass**, docked outside the scroll in the column, when inside a fence (`:403-412`).

**EventCard** (`:71-121`):
- Full-bleed photo with a `LinearGradient` scrim (`transparent → EMBER.scrim`, locations .35→1).
- Top row: **TimeBadge** (LIVE with a still green dot / IN 25M / IN 2H / 8:30 PM / ENDED, from `startsLabel` `roomMoments.ts:260-275`). It's a pill on `EMBER.bg`, `CONTROL.lg+8` wide and 24 pt tall.
- A "N there" pill with a `RollingNumber` (260 ms, 40 ms stagger).
- Foot: "YOU'RE GOING" (label), title (`title`, 2 lines), "venue · 350 m / 1.2 km" (`meta`), and "N there share your taste".
- No photo means a plain `surface` card (no fallback art).
- Cards: radius 32, a 2 pt border in the page colour so stacked cards separate without a shadow (`:425-431`).

**Deck sizing** (`:145-152`, `:305-318`): the card takes the measured space left between the header and the pass. Width = screen − 48 − 32, height ≥ 280, portrait 1.22 when it fits.

**VenuePass** (`:217-262`):
- `surface` panel, radius 24, padding 16, in a dock padded 12 sides / 4 top / `insets.bottom+12` bottom.
- Contents: 56 pt thumbnail (radius 8; **nothing if there is no photo**), "YOU'RE HERE", title, count line.
- **Teaser** when `tasteMatchCount > 0`: up to 3 blank 32 pt discs with "?" overlapping −8, and "N people here share your taste". The count comes from `getRoomPreview`, which the server never returns below 3 people (`:186-211`).
- **HoldToConfirm** "Hold to blend in" with a fingerprint icon. Busy label "Checking you in…". Hint "Checks you in and opens the room".

**Interactions:**
- Deck: swipe sideways sends the top card to the back. Tap opens `/event/[id]`. The VoiceOver `increment` action is "Next event" (`SwipeDeck.tsx:263-269`).
- See all, Try again, Browse the Pulse.
- Hold the pass (§3.2).
- Vertical drag closes the overlay.

**Motion and haptics:**
- **Deal** on first appearance: cards start square and fan out over 620 ms after 250 ms, `bezier(0.33,1,0.68,1)` (`SwipeDeck.tsx:191-197`).
- FAN: rotate −2/4/−5°, shift X 0/16/−16, Y 0/8/14, scale 1/.95/.9 (`TonightView.tsx:51-57`).
- Drag tilt is 1° per 18 pt. Commit at 56 pt or 500 pt/s. Throw 0.55×width over 220 ms, `bezier(0.23,1,0.32,1)`, then a spring home `{duration 550, dampingRatio .8}` with a **Light impact haptic** (`SwipeDeck.tsx:217-240`).
- Tap press scale 0.97 over 120 ms.
- Pass `FadeInDown.duration(320)` (`TonightView.tsx:229`).
- Reduce Motion: no deal, no throw.

**Data** (`lib/useTonight.ts`):
- The same feed as the Pulse: `getEvents` with `page 0`, `limit 20`, `city` = stored city, `lat/lon` = **last known fix only, never prompts**, `include checkins,activeCheckins,profile` (`:110-129`). It's SWR-cached, so it's a cache hit after the Pulse loads.
- `getMyRsvps` for "yours".
- `getRoomPreview` for the inside event plus the top 3 (`hereCount`, `tasteMatchCount`; `:214-244`).
- Refreshed by `useLiveSync` every 60 s connected / 30 s disconnected (`:175-181`) and force-reloaded on check-in changes (`:188-194`).

**States present:** loading, error, empty, populated, inside-fence. **Missing:** permission-denied (it silently falls back to city order with no distances and never asks), offline-with-cache (keeps stale data with no notice), and first run (nothing specific).

### 2.6 Room (inside BlendnScreen, components in `RoomSections.tsx`)

**Content, top to bottom** (`BlendnScreen.tsx:335-410`). It is one `FlatList`, 3 columns, `paddingTop = insets.top + 48 + 12`.

1. **Top bar** (floating, opaque `EMBER.bg`):
   - Left: chevron-down **Close**.
   - Right (fades in over 160 ms): **Check out**, a pill 32 pt tall, `surface`, `button` text, hit slop to 48. Then a **room settings** icon (`options-outline`) → `/event-preferences/[eventId]` (`:478-511`, `612-618`).
2. `RealtimeStatusBanner`, only when offline, or the socket has been down for more than 3 s (§4).
3. **RoomHero** (`RoomSections.tsx:72-147`):
   - Left column: a still green 8 pt dot plus `label` "LIVE", the event title (`heading`, 2 lines), and the **headcount** as a `RollingNumber` at `display` size (260 ms, 40 ms stagger) with "here now".
   - A **stack of up to 6 faces** (32 pt with a page-colour ring, overlapping −8). Arrivals come first, newest first, then others still inside. Beside it: "Priya walked in" (for 5 min) or "+N".
   - Right: **your face** (72 pt) inside a **TimeRing**, 112 pt across, reading "IN THE ROOM · 1H 12M" (capped at "3H+", `roomMoments.ts:217-228`).
4. **RoomVisibilityBanner** (§4).
5. **Meet next** (`RoomSections.tsx:161-215`):
   - `heading` "Meet next", plus a pill (shuffle icon and countdown "4:12", tabular numerals) on `surface`.
   - **3 cards** in a row on `surface`, radius 16. Each has a face (tile − 32), name (`bodyStrong`, shrinks to fit at 0.75), and one reason line (`caption`, 2 lines).
   - The picks rotate through the server's top 9 in **15-minute windows seeded by the event id**, so every phone shuffles together. Matched people and people who left are skipped (`roomMoments.ts:187-205`).
6. **Face grid heading** (`FaceGridHead`, `:326-340`): "Everyone here" or "Everyone who came" (once anyone has left), plus a count. Empty: "Nobody else is here yet. People show up as they check in."
7. **Face grid** (`GridFace`, `:218-312`):
   - Cell width = (screen − 48 − 24)/3, face = cell − 16. Name (`bodyStrong`, 1 line, ellipsised) and reason (`caption`) underneath.
   - Corner mark: a 24 pt `surface` circle holding a heart (liked) or chat bubble (matched), **or** a 12 pt green "here" dot ringed in the page colour.
8. **Show more** text button (`FaceGridMore`, `:342-355`). It raises the limit by 20 up to the server's 100 rather than paging (`useRoom.ts:473-498`).
9. **ChatDock**, absolutely positioned at the bottom (§4).

**Overlays:** PersonCard sheet, ConnectSheet, MatchMoment, ConfettiBurst and an ActionTray (trays).

**Interactions:**

| Gesture | Target | Effect |
|---|---|---|
| Tap | grid face | Opens PersonCard (`Gesture.Exclusive(double, single)`; press scale 0.97 over 120 ms) |
| Double-tap | grid face | Like, if likeable. HeartPop over the face. **No haptic** (`RoomSections.tsx:244-251`, `useRoom.ts:634-687`) |
| Tap | Meet next card | PersonCard (opacity press, no haptic) |
| Tap | Check out | Confirm tray "Check out of this event?" / "You'll leave the room and its people. To come back in you'll need to check in again, with your location." **Stay** · **Check out** (primary). On success the overlay closes (`BlendnScreen.tsx:170-195`). Busy shows a spinner in the pill. Failure toasts "Couldn't check you out. You're still in this room." (`lib/useRoomControls.ts:11`, `110-128`) |
| Tap | Room settings | `/event-preferences/[eventId]` (pushed on top) |
| Tap / pull up | ChatDock | Opens `/chat/[id]` on top. The lookup falls back to `getEventChat`; a `LEFT_ROOM` chat opens on its Rejoin state; no chat toasts "The chat for this event is not open yet." (`:256-281`) |
| Tap | Show more | `room.loadMore()` |
| Accessibility actions | grid face | `activate` → card; `longpress` labelled "Like" (`RoomSections.tsx:270-277`) |
| Drag down at top | page | Close overlay |

**Socket-driven moments:**
- An **arrival** adds a face to the stack (spring-in) and a dock line "X walked in".
- An **incoming wave** fires a Light haptic (`useRoom.ts:777`) **plus** a Medium haptic, a toast "X waved at you 👋", and a dock line (`BlendnScreen.tsx:309-315`). **That's two haptics for one event.**
- A **match** plays MatchMoment and adds a dock line "You matched with X" (`:290-306`).

**Motion:**
- Stack faces: `faceIn` is opacity 0→1 over 160 ms plus scale 0.6→1 and Y 8→0 on `MOTION_SPRING.snappy`. Others slide aside on `LinearTransition.springify().damping(18).stiffness(220)`. Exit `FadeOut 120` (`RoomSections.tsx:40-52`, `122-127`).
- Meet next cards: `FadeIn` with delay `i*80` ms over 320 ms, exit `FadeOut 120`, keyed by person so a card that survives a shuffle doesn't flicker (`:189-193`).
- Grid faces: the first 12 (excluding Meet next picks) `FadeIn` with `min(i,11)*28` ms delay over 260 ms (`:255-259`, `BlendnScreen.tsx:389`).
- Counts: `RollingNumber`.
- Reduce Motion: fades only, and no layout transition.

**States:**
- loading: a centred `ActivityIndicator` in `textSecondary`.
- error: "Couldn't load the room" / "Check your connection and try again." / accent **Try again**.
- empty room: grid copy (above). Meet next is hidden when there are no picks.
- realtime down: banner.
- hidden from the roster ("Show online status" off): banner variant.
- chat left / failed / quiet: dock variants.
- **Ended**: RoomRecap.

There is **no pull-to-refresh** and no first-run explainer.

**Data:**
- `useRoom` (`lib/useRoom.ts`):
  - `getActiveCheckins` and `getEventMatches(eventId, {limit 20})` give a server-ranked roster with `profile_photos` **only for people who revealed** (server-enforced). Each person carries `sharedIntents`, `sharedPlans`, `sharedEvents`, `interests`, `workField`, `insideNow`, `youLiked`.
  - `getRoomPreview` / `getEvent` for `hereCount`; `getEventChat`; `getBlockedUsers`.
  - Sockets: `event:room:checkin`, checkout, room match, room wave.
  - `useLiveSync` every 30 s connected / 12–45 s disconnected (`:423-433`).
  - A 2.2 s leave grace stops the room flashing out during a checkout round trip (`:149`, `:355-360`).
- Your revealed state comes from the active check-in.
- `useRoomControls` reads `profile.show_online` (`lib/useRoomControls.ts:48-61`).

**Product rules to keep:**
- **Faces only where earned.** Theirs is a photo only if they revealed; yours only if you revealed in this room (`BlendnScreen.tsx:549-555`, `docs/NAVIGATION.md:151-153`).
- Like is private until mutual. Wave is seen at once and is limited to one per pair per 10 min ("You waved a moment ago", `PersonCard.tsx:216-220`). Message is a connection request that **reveals you**, and says so before you type (`ConnectSheet.tsx:17-46`).
- Reason lines never invent a fact. History reads "Both at N nights before", never "Met at" (`roomMoments.ts:58-61`). A person who checked out reads "Was here" (`:88-91`).
- Meet next is seeded per event so it's a shared clock (`:165-186`).
- The LIVE dot is still.
- Check out asks first (tested, `roomButton.test.ts:174-193`).
- The visibility banner never auto-hides, and revealing is gated on having a name and photo while going anonymous never is (`RoomVisibilityBanner.tsx:15-41`).
- The presence monitor is at the root, not in the room (`docs/NAVIGATION.md:159-160`).

### 2.7 Ended → RoomRecap (`components/blendn/RoomRecap.tsx`)

**Trigger:** the room's `endsAt` has passed. The recap is snapshotted so the server sweeper's checkout can't make it vanish mid-read (`BlendnScreen.tsx:111-133`). Re-evaluated every 15 s.

**Content:**
- Your face, 80 pt.
- "IT'S OVER" (label), "That's a wrap" (`display`), the event title (`meta`).
- Two `surface` stat tiles: time in the room ("2h 15m", measured to the event's end, uncapped, `lib/roomRecap.ts:48-73`) and the match count.
- Accent **Rate who you met** / **Rate the night** → `/rate/[eventId]`.
- `surface` **Back to tonight** (no haptic). It dismisses the recap for this event only and **never checks you out**.

No confetti, by design (`RoomRecap.tsx:14-16`). Entrance `FadeIn 220`. Rate has the ScalePress selection tick.

---

## 3. Check-in and check-out: every door

### 3.1 Shared core (`lib/checkIn.ts`)

- `submitCheckIn(eventId, {lat, lon, accuracy})` sends `deviceInfo.gpsAccuracy` with a **12 s timeout** (`:64`, `:85-126`). It returns `checkedIn` (with `askIntent`, `revealSuggestion`), `refused` (a code mapped to a title, `lib/checkInRefusal.ts:67-104`), or `timeout`.
- Refusal titles:
  - "Not quite there yet" (out of range; offers **Open Maps**)
  - "Doors aren't open"
  - "This one's over"
  - "Not open to you" (age)
  - "At capacity"
  - "Already checked in"
  - "Check-in failed"
  
  The server's sentence is the message.
- `checkInChanged()` drops the cached active check-ins and event detail and notifies the tab bar, `useRoom` and `useTonight` (`:46-51`).
- `checkOutOf()` forgets the roster and notifies (`:186-193`).
- Location for a check-in (`lib/locationFix.ts:35-171`): it **does** prompt for permission. Trays:
  - "Location services disabled" (**Open Settings**)
  - "Location permission required" (**Open Settings**)
  - 15 s fix timeout → "Location timeout"
  - Accuracy over 50 m → "GPS signal weak — GPS accuracy is Nm…" (**Try Again**)
  
  **Bug: Try Again re-reads a fix and throws it away**, so the check-in doesn't resume (`:114-132`). The user has to start over.

### 3.2 Door 1 — Blend'n Tonight "Hold to blend in" (`useCheckInFlow` with `afterSuccess:'none'`)

Sequence as coded (`BlendnScreen.tsx:158-166`, `441`; `lib/useCheckInFlow.ts:101-284`):
1. Hold the pill for **900 ms** (`HoldToConfirm`). It ticks at 25/50/75 % (Light impact) and fires a **Success notification haptic at 100 %**.
2. `checkIn.start()` is called **without `skipRules`**, so a **"Rules and regulations" tray** appears (7 numbered rules; **Cancel** · **I Agree, Continue**). The user has *already* committed by holding. **This is a second confirmation after the hold.**
3. If they cancel, the pill **stays fully filled**: `progress` was set to 1 on completion and only drains when `busy` goes true→false, and busy never went true (`HoldToConfirm.tsx:98-102`, `114-118`).
4. On "I Agree": `checkingIn`, so the pill shows a spinner and "Checking you in…". Then the location fix (trays above), then the request.
5. **Success**:
   - A second **Success haptic** (`useCheckInFlow.ts:198`).
   - **ConfettiBurst**: 72 pieces of brand-colour paper fired up from the pass (§6.5).
   - A 700 ms wait (`CONFETTI_PEAK_MS`, 0 under Reduce Motion).
   - Then one of: the **reveal offer** tray (the first time it's the full warning "Everyone here will see your name and photo… Stay anonymous · Enter as myself"; after that "Show your name here? … Stay anonymous · Yes, show my name"), or "Why do you go out?" (`/event-preferences/...askIntent=1`), or nothing.
   - The local check-in notification.
   - Meanwhile `checkInChanged` makes `useRoom` reload, so **Tonight cross-fades into the Room**. Success *is* the room.
6. **Refusal**: an Error haptic plus the refusal tray (after the hold's Success haptic, which sends a mixed signal). The pill drains with `MOTION_SPRING.gentle`.
7. **Timeout**: "Still checking you in" (**Cancel** · **Retry**). **Exception**: "Check-in failed".

### 3.3 Door 2 — Event detail CTA "Blend in" (`components/screens/EventDetailScreen.tsx:1035`, `1112`, `1730`)

The same `useCheckInFlow` with `afterSuccess:'tray'`:
- tap (no hold), then the rules tray, location, request
- on success: haptic, confetti, then "Checked in — You are now checked in. Join the event chat now, or stay on this screen." (**Stay here** · **Go to Chat**), the reveal offer, or the intent question

The CTA then reads "You're in" and opens the Blend'n Room (`docs/SCENE.md:164-173`). When the event is over and you didn't attend, it reads "See what's on tonight": `router.dismissTo('/(tabs)/events')` then `openBlendn()` (`EventDetailScreen.tsx:1094-1103`).

### 3.4 Door 3 — Pulse long-press quick-actions tray (`app/(tabs)/events.tsx:980-1060`, `617-830`)

- Long-press an event card to get an expanded ActionTray: title, summary, then **Blend in** (primary, only when `proximity.within_radius`), Save / Remove from saved, View details, and **Check out** (when checked in).
- **Blend in**:
  - A `tap` haptic, an optimistic status update, `submitCheckIn`.
  - **No rules tray and no confetti.**
  - Success haptic, then the reveal offer (**button order reversed vs door 1/2**: primary first, `:767-779`) or "Checked in — You have been checked in and added to the event chat." (**Go to chat** · **Stay here**), which opens the **chat**, not the Room.
  - Refusal/timeout: rollback plus an Error haptic plus a tray.
- **Check out**: confirm tray "Check out of {title}?" (Stay · Check out), then `handleCheckOut` (`:918-976`): optimistic, Success haptic, "Checked out — You have been checked out of this event." (compact tray). Failure rolls back with "Check-out failed".

**Three doors give three different check-in experiences**: hold+rules+confetti+room, tap+rules+confetti+tray, and tap+no rules+no confetti+chat tray. The redesign should pick one.

### 3.5 Check-out paths

- **Room top bar** (§2.6). On success the overlay closes, with no haptic and no success message. `useRoomControls.ts:101-104` still says "No confirmation", which is stale because BlendnScreen confirms.
- **Pulse tray** (§3.4).
- **PresenceMonitor**, automatic (§4). It is never silent: "Checked out" notice.

---

## 4. Screen routes

### / — Sign-in landing (`app/index.tsx`)

- **Files and components**: `app/index.tsx`, `EmberButton` (`components/onboarding/EmberControls`), `LegalLine`, `PendingInvite`; assets `lockup-hero.png` (674×202), `monogram-gradient.png` (453×534).
- **Job**: the signed-out front door. It also holds the screen while auth resolves. **Entry/exit**: root `Stack` `index` with `animation:'none'` (`app/_layout.tsx:524-530`). There are no navigations on success; the root layout's routing effect moves the user (`app/_layout.tsx:193-422`; `docs/PLACEHOLDER_SCREENS.md` sign-in rules). Email → push `/sign-in` (with `notice` param).
- **Primary action**: deliberately none in accent. "The brand colour arrives through the monogram", and Google and Apple keep their own chrome (`:281-284`). The unreachable state's **Try again** is that state's accent.
- **Content, top to bottom (signed out, `:286-397`)**:
  1. Lockup, 60 pt tall (≈200 pt wide), centred in the flexible brand block.
  2. Tagline "Same place. Same vibe. Instant connections." (`body`, `textSecondary`).
  3. `PendingInvite` (whose invite is waiting).
  4. At the bottom: an error (`destructive` `meta`, `accessibilityRole alert`) or a session-ended notice.
  5. **Continue with Google** (white #FFFFFF pill, #1F1F1F ink, AntDesign G, label **21 pt** to match Apple's system label; `design-exception`).
  6. **Sign in with Apple** (system `WHITE` button, radius 28; iOS only, if available).
  7. "or" divider (hairlines).
  8. **Continue with email** (outlined pill, `separator` border, 21 pt label).
  9. LegalLine "By continuing you…".
- **Interactions**: Google (spinner in place, other buttons dim 0.45), Apple (white busy overlay), Email (push), legal links. No haptics anywhere.
- **Feedback**: opacity press only (0.85). No animation, apart from the IntroAnimation overlay that plays over this screen on launch.
- **States**:
  - **unreachable**: `cloud-offline-outline`, "Can't reach Blend'n", "You're still signed in. Check your connection and try again.", accent **Try again** with busy (`:242-254`).
  - **loading**: the gradient monogram, 96 pt tall, centred (`:265-271`).
  - **signed out**, plus error, notice, and invite variants.
  - **authenticated hold**: the same monogram, for a frame or two (`:402-406`).
  - Cancelling OAuth is silent by design (`:162-167`, `:223-225`).
- **Data**: `useAuth()` `{user, loading, unreachable}`; `consumeSessionEndedNotice()`; Google and Apple tokens go to `signInWithGoogle` / `signInWithApple`; `socialSignInMessage` gives the server's refusal text.
- **Rules to keep** (`docs/PLACEHOLDER_SCREENS.md:63-73`): errors are visible and persistent (inline, not a toast); cancelling is not an error; the Apple button is Apple's (WHITE); the Google button is Google's; email is visually the third option (outlined); never render the wordmark as text; never reveal whether an address has an account.
- **Redesign opportunities**:
  - A natural home for the orbs backdrop, behind the lockup only, because the buttons must stay brand-compliant.
  - The loading/held state is a static 96 pt monogram that differs in size from the splash (118 pt slot) and from the intro's first frame. A designed splash→landing sequence should own all three.
  - The 21 pt button labels are a measured exception to keep, or re-measure if Satoshi lands.
  - Nothing moves on this screen after the intro: no entrance for the buttons.

### Root layout — `app/_layout.tsx` (launch, splash, overlays)

- **Job**: fonts and assets, splash handoff, the launch intro, auth routing, push init, socket lifecycle, Android back, and the global overlays (`PresenceMonitor`, `SheetHost`, toasts).
- **Splash and launch, exactly as built:**
  - `Appearance.setColorScheme('dark')` at module scope (`:57`).
  - `SplashScreen.preventAutoHideAsync()` at module scope (`:70`), and `SplashScreen.setOptions({ fade: true, duration: 200 })` (`:71`).
  - Preload: `monogram-gradient.png`, `icon.png`, `intro.webp` and the onboarding images via `Asset.loadAsync`, then `prefetchOnboardingImages` (`:110-130`). Fonts via `useFonts(EMBER_FONT_MODULES)`; a font failure counts as done (`:100-101`).
  - `assetsReady = imagesReady && (fontsLoaded || fontError)` → `SplashScreen.hideAsync()` (`:146-148`). **Deliberately not gated on auth.**
  - `IntroAnimation` mounts on the **same render** `assetsReady` flips (`showIntro && assetsReady`, `:512-514`), so the overlay is up before the splash starts its 200 ms fade.
  - It runs on **every cold launch, signed in or not**.
- **Native splash config (`app.json:93-108`)**: `expo-splash-screen` with `image ./assets/logo/monogram-gradient.png`, `imageWidth 118`, `resizeMode contain`, `backgroundColor #0F0E0E`, and an identical `dark` block. App `userInterfaceStyle: dark`. Android adaptive icon background `#F05524`; notification icon `monogram-white.png`, colour `#F05524`.
  - **iOS (committed native)**: `ios/blendn/SplashScreen.storyboard` has a 118×118 `scaleAspectFit` image view centred on both axes, so the mark renders about 100×118 pt. `SplashScreenBackground.colorset` is `#0F0E0E` in both appearances. `Info.plist` `UIUserInterfaceStyle = Dark`. The comment at `app/_layout.tsx:39` saying it's "Automatic" is stale.
  - **Android (committed native)**: `res/values/colors.xml` and `values-night/colors.xml` set **`splashscreen_background #000000`**, not `#0F0E0E`. `styles.xml` `Theme.App.SplashScreen` uses `windowSplashScreenAnimatedIcon @drawable/splashscreen_logo` (1152×1152 xxxhdpi) with `icon_preferred`. Android 12+ draws this through the system SplashScreen API, which masks the icon. `android/` is committed, and EAS builds use it as-is unless prebuild regenerates it. The black-equality test only checks `app.json` (`__tests__/introTiming.test.ts:124-137`), so **Android's splash is probably still pure black**, which is the two-blacks step the intro comment warns about. Verify on device.
  - `docs/HANDOFF.md:105-135` records the sequence as built in #161: the splash monogram at **96×114 pt** (now a 118 pt slot, so the doc is stale), a 180 ms black hold, a 1848 ms animation, and the landing lockup at 196×56 pt, centre y 333 pt on a 440 pt screen. The black hold is load-bearing.
- **Stack transitions**: `ios_from_right` / `slide_from_right` for pushes; `(tabs)` arrives with `fade` and no swipe-back (`:549-563`); `event/[id]` is a full-screen card (`:602-611`); `event-preferences` is a modal (`:644-658`); `f/[token]` is a modal sliding from the bottom (`:710`); `room` has animation `none` (`:684`); `board/[eventId]` slides (`:709`). `contentStyle` is `EMBER.bg` everywhere.
- **Global overlays**: `PresenceMonitor` (signed-in only, `:723`) and `SheetHost` (`:729`). The root background is flat `EMBER.bg` (`:742-757`).
- **Redesign opportunities**:
  - The ambient-orbs backdrop belongs here as the one shared layer under the tabs. Today every screen paints flat `EMBER.bg`, and the root comment explicitly removed a background gradient (`:744-755`).
  - The splash animation project owns the native splash (both platforms, and fixing Android's #000000), the 200 ms fade, the 180 ms black, the intro, and the landing. See §6.6 for IntroAnimation.

### (tabs) — the bar and the overlay host (`app/(tabs)/_layout.tsx`)

Covered in §1.3–§1.6. Primary action: the bar's own chrome (the active tab and the disc) may use accent (`DESIGN_SYSTEM.md:85-87`).

- **Feedback**: the disc's selection haptic and 0.9 press scale; tab press dims to 0.85; badge pop; dot fade.
- **States**: avatar loading (falls back to the glyph), and the four button states.
- **Redesign opportunities**:
  - The bar is the prime **glass control layer**. It already floats absolutely over content with `TAB_BAR_CLEARANCE` padding, so blur can see through to the scroll.
  - Focused icons switch to filled glyphs, which contradicts "outlined icons".
  - Labels are accent when active, making the bar a second accent user.
  - The badge is dead.
  - `today`/`idle` are indistinguishable.
  - There is no long-press on the disc (an opportunity: a quick check-out or "what's on" peek).
  - Tabs have no haptic while the disc does.

### /room — address only (`app/room.tsx`)

- **Job**: keep old links working. It calls `openBlendn()`, then `router.back()` or `replace('/(tabs)/events')`, and renders a blank `EMBER.bg` view (`:17-24`). Nothing to design. Entry today: legacy links only (match pushes no longer route here, `lib/notifications.ts:385-395`).
- `docs/NAVIGATION.md:173-179` still says "/room is presented as a sheet" and "its screen is the Grid segment of /room". **Both are stale.**

### Blend'n overlay — the screen the centre button opens (`components/blendn/BlendnScreen.tsx` + `RoomStage` + `TonightView`)

- **Job**: the app's "now" mode. Before you are anywhere it shows what's on tonight; at a door it shows a pass you hold to go in; inside, it shows who's here, who to meet, and the room's chat.
- **Entry/exit**: entry is the centre button, `/room`, the event detail CTA ("You're in" / "See what's on tonight"), and the board's closed state (broken, §5). Exit is the chevron, drag down, Android back, Browse the Pulse, a successful check-out, or a push on top (chat, profile, DM, event, settings, rate).
- **Primary action (accent)**:
  - Tonight: the **hold pill**, an accent tint track with an accent fill. The empty and error states' button is that state's primary.
  - Room: the **Like** in PersonCard, the one "repeating" accent (`DESIGN_SYSTEM.md:88-89`). The room screen itself shows no accent until a card opens.
  - Recap: **Rate**.
  - Match: **Say hi**.
- **Content, interactions, motion, states, data and rules**: §2.2–§2.7, §3.2.
- **Redesign opportunities** (from the StyleSheets):
  - The top bar is an opaque `EMBER.bg` slab (`BlendnScreen.tsx:594-604`) that content scrolls under. It's an obvious **glass control** candidate, and the check-out pill on `surface` would become a glass chip.
  - The overlay's background is plain `EMBER.bg` (`RoomStage.tsx:229`). The orbs backdrop could live behind both modes, and the disc morph would then end on orbs rather than flat colour.
  - Tonight has no distinct "saved today" moment. The brief's "saved today" state has no surface.
  - Room mode has **no accent and no gradient at all** (cards are `surface`, faces sit on `surfaceSunken`). Of everything in the overlay, it feels most like a static list.
  - Hearts on face corners are white on `surface`. Meet next's countdown is a plain pill.
  - No pull-to-refresh, because pull closes.
  - Spinner-only loading in the room, where a skeleton of hero, Meet next and grid would avoid the jump.
  - VenuePass has no photo fallback (the unused `thumbEmpty` style, `TonightView.tsx:469`).
  - Dead styles: `badgeLive {}`, `count` (`:466`, `:471`).
  - The confetti origin assumes a 48 pt button, but the pill is 56 (`BlendnScreen.tsx:570-574`).
  - The visibility banner is never given the pseudonym, so it always reads "You're anonymous in this room" rather than "You're in this room as Cosmic Panda" (`BlendnScreen.tsx:365-373` vs `lib/roomVisibility.ts:66-69`).

### /board/[eventId] — The Board (`app/board/[eventId].tsx`, `components/board/*`)

- **Placeholder design**: a red "PLACEHOLDER DESIGN — logic is final, layout is not" banner shows on every state (`components/ui/PlaceholderBanner.tsx`). Rules: `docs/PLACEHOLDER_SCREENS.md:534-598`.
- **Job**: "Going alone, and looking for somebody to go with". Pseudonymous offers and seekings before the doors open. An ask takes one tap, and the answer arrives in the Banter.
- **Entry/exit**:
  - Entry: the event detail's `BoardEntry` row ("The Board — Going alone? See who's looking for company — or offer a space.", `BoardSections.tsx:58-74`), **before the doors open only** (`EventDetailScreen.tsx:1460`). Pushed with a slide.
  - Exit: AppHeader back, or "Back to the event" on a refusal.
  - `BOARD_ENABLED` off (env `EXPO_PUBLIC_BOARD_ENABLED=false`) redirects to the Pulse (`:51-54`).
- **Primary action**: **Write a post** (accent pill, `:332-341`, `441-447`), and **Post** inside the composer. **Ask to join** is strong-neutral (white fill, dark text), not accent (`BoardSections.tsx:441-450`).
- **Content, top to bottom**:
  1. `AppHeader` "The Board", subtitle = the event title (from the server) (`:407`).
  2. List header: PlaceholderBanner, then **Write a post** (only when there are posts) or the open **BoardComposer**, then "The board didn't refresh. Pull down to try again." when a refresh failed (`:318-347`).
  3. Posts, sorted offers first (`sortBoardPosts`).
     - **Offer**: a `surfaceSunken` panel, radius 16. Byline (40 pt pseudonym mark, handle `bodyStrong`, "Offering" or "Offering · yours", and ⋯ More for others' posts) → **spaces left** at `title` size ("2 spaces left" / "Full" in `textSecondary`) → body → footer.
     - **Seeking/chat**: no panel, words first. Body → byline ("Looking"/"Saying") → footer (`BoardSections.tsx:104-166`).
  4. Footers:
     - **Mine**: "Nobody has asked yet" or "N asked — answer in the Banter", plus a **Take down** text button.
     - **Others**: settled line ("Waiting on them" / "Full" / "Closed" / "They said yes") **or** "No spaces left" **or** a refusal line above **Ask to join** (spinner while asking) (`:168-242`).
  5. **BoardComposer** (`:260-365`): two radio pills, "I have space" / "I'm looking" (selected = white fill). A multiline input (placeholders "Driving over from Indiranagar at 8 — room for two." / "Going alone. Anyone heading over from Koramangala?"). A `n/500` counter. For an offer, a **Spaces** stepper (−/+, 1–20, 48 pt round `surface` buttons). The refusal in the server's words. Accent **Post** (spinner). **Cancel** text.
- **Interactions**: pull-to-refresh (`RefreshControl` tinted `textSecondary`); Write a post; kind radio; type; stepper; Post; Cancel; Ask to join (**no confirm, by rule**); ⋯ More → `boardSafetySheet` (Report with reasons + note / Block confirmed) via `SheetHost`; Take down → confirm sheet "Take your post down? — It leaves the board. Anybody who asked is not told why." (destructive **Take down** · Cancel), then toast "Taken down".
- **Feedback**: **no haptics, no motion** apart from RN `ActivityIndicator`s and press opacity. VoiceOver `announce()` on iOS for results (`BoardSections.tsx:26-28`).
- **States**:
  - loading: 3 card-shaped skeletons, 168 pt tall (`:423-431`).
  - **closed** (doors open): `lock-closed-outline` "The board's closed" / "The doors are open — the room is open instead." / **Open the room** (`:350-358`).
  - **refused**: "This board has an age limit" / "This board isn't here" / "Not on this board yet" plus the server line and "Back to the event" (`:361-369`).
  - **failed**: `LoadError` "The board didn't load" with retry.
  - **empty**: `chatbubbles-outline` "Nobody's posted yet" / "Say what you're looking for, and people on their way will see it." / **Write a post**.
  - populated; refresh-failed line; composer refusal; per-card ask states (idle/asking/settled/refused); full.
- **Data**:
  - `GET /events/:id/board` (posts: `kind`, `body`, `spacesLeft`, `author` handle, `mine`, `requestCount`), `GET /board/requests` (which posts carry your ask), `GET /events/:id` (title, doors).
  - Writes: `POST /events/:id/board`, `DELETE …/:postId`, `POST …/:postId/requests`, and report/block by post.
  - A read is sequenced and merges (`:92-102`). Refetched on focus (`:159-165`).
- **Rules to keep** (`docs/PLACEHOLDER_SCREENS.md:566-582`):
  - pseudonyms only (marks seeded on handle+event+post, never a photo or user id)
  - offer and seeking are two shapes with one accent
  - the counter is never the only difference ("Offering"/"Looking" in words)
  - two empty states
  - a refusal names its gate in the server's words and stays on screen
  - a 409 is a state, never an error
  - no confirm on Ask
  - a decline is never shown or inferable
  - report and block go by post or ask
  - accepting never draws the match opener
  - pushes carry no text
  - before doors only
- **Bug**: **"Open the room" on the closed state calls `openBlendn()` without leaving the stack** (`:356`). The overlay opens *underneath* the board route, so the button appears to do nothing until the user goes back. `EventDetailScreen.tsx:1094-1103` documents and handles exactly this case with `router.dismissTo('/(tabs)/events')` first.
- **Redesign opportunities**:
  - The whole screen is placeholder.
  - Offers vs seekings is a strong two-shape system to keep.
  - Posting has no success moment beyond "Posted" announced to VoiceOver only, and no haptic on post or ask.
  - The skeleton is plain grey blocks.
  - The composer is an inline panel in the list header, a candidate for a glass sheet.
  - Header and back button are the old `AppHeader`.

### /(tabs)/going — Going (`app/(tabs)/going.tsx`)

- **Job**: "the events that are yours": your next RSVP large, the rest by day, Saved hearts, and Past events with a way to rate the people you met.
- **Entry/exit**: the tab. Rows push `/event/[id]`. Past "RATE WHO YOU MET" → `/rate/[eventId]`. The empty state's button navigates to the Pulse.
- **Primary action**: **none when populated** (`docs/NAVIGATION.md:208-210`). Only the empty or error state's button is accent (`:567-576`).
- **Content, top to bottom**:
  1. Header `display` "Going", with no back button (`:460-462`).
  2. **Next up** hero (`renderNext`, `:250-350`):
     - A `surfaceSunken` card (radius 16, padding 16) holding a 180 pt photo (radius 8; `EventCover` brand-mark fallback).
     - Eyebrow: "Happening now" with a still green dot, "Tonight · 6:30 PM", "Tomorrow · …", "Sat, Oct 4 · …", or "Ended" (`nextUpLabel`).
     - Title (`title`, 2 lines), and place with a location icon.
     - A tag, CANCELLED (destructive tint) or ON THE WAITLIST.
     - A row of three `surface` 48 pt pills: **Directions** (with label), **Calendar** icon, **Share** icon.
  3. The rest of your RSVPs as `UpcomingCard` rows under `DayHeading`s. "Happening now" leads, then days, then "Ended" (`lib/goingSections.ts:60-80`). Notes read "Cancelled" (destructive) or "On the waitlist".
  4. **Saved** (`SectionHeader`): UpcomingCard rows with a filled heart that **removes** the save.
  5. **Past**: UpcomingCard rows with a **RATE WHO YOU MET** text action.
- **Interactions**: pull-to-refresh (it also retries failed covers, `:170-175`); tap a hero or row to open the event; Directions (`openInMaps`), Calendar (`addToCalendar`), Share (system share sheet with title, venue and address); heart removes the save **optimistically**, with toast "Removed {title}" + **Undo** (re-saves; on failure toast "Couldn't save … again."), and a refused DELETE restores the row with "Couldn't remove {title}. Try again." (`:192-225`); RATE; a second tab tap scrolls to the top.
- **Feedback**:
  - **Haptics**: none on rows, hero or actions (`haptic={false}` throughout, `:264-268`, `312-313`). Only the empty/error button ticks (ScalePress default).
  - **Motion**:
    - The whole list `FadeInUp` (10 pt, 220 ms, `entrance` easing `[0.16,1,0.3,1]`).
    - A removed saved row exits `FadeOut 160` while others reflow on `LinearTransition 220 bezier(0.77,0,0.175,1)`, and an Undo-restored row enters `FadeIn 220` (`:549-551`).
    - Hero press 0.98, action press 0.95.
    - Reduce Motion: none of these.
- **States**:
  - loading: a skeleton shaped like the hero plus two rows (`:464-485`).
  - **all three requests failed**: "Couldn't load your events" / "Check your connection and try again." / **Try again**.
  - **empty**: "Nothing here yet" / "Tap "I'm going" or the heart on an event and it shows up here." / **Browse events** (`:501-512`).
  - **partial failure**: each section keeps its last good rows, and a new failure toasts "Couldn't load all of your events." with **Try again** (`:123-136`).
  - A server without `/me/rsvps` (404) starts at Saved.
  - No offline or permission states.
- **Data**: `getUserFavorites(userId)` (Saved), `getMyRsvps()` (going/waitlisted), `getMyAttendance()` (Past). Reloaded on every tab focus (`:158-162`). No realtime.
- **Rules to keep**: no Remove on RSVP rows ("leaving an RSVP is a decision about the event", `:379-380`); the hero's actions are siblings of its button, not children, so VoiceOver can reach them (`:243-249`); no haptic on things you pass while scrolling; status is a still dot; populated Going has no accent; Directions keeps its word while Calendar and Share are icons (width budget, `:307-314`).
- **Redesign opportunities**:
  - The tab has no "tonight" link to Blend'n. Next up "Happening now" could offer the room or check-in, which the code says lives on the event (`:311`).
  - The hero photo carries nothing on it, by design.
  - Three section treatments (day headings, `SectionHeader`, hero) of similar weight.
  - The heart remove has no haptic or pop, unlike the Room's HeartPop.
  - `SafeAreaView` bottom edge plus `TAB_BAR_CLEARANCE` double-pads the bottom (`:454`, `531`).

---

## 5. Defects and contradictions found while reading (for the brief's "fix while redesigning" list)

1. **Centre-button unread badge never shows.** `roomUnread` is not passed into `roomButtonTarget` (`app/(tabs)/_layout.tsx:356-360`, `lib/roomButton.ts:76`). `docs/NAVIGATION.md:54` describes it as live.
2. **Board "Open the room" opens the overlay underneath the board** (`app/board/[eventId].tsx:356`). The event screen's correct pattern is at `EventDetailScreen.tsx:1094-1103`.
3. **Hold-to-check-in is followed by a rules tray** (`BlendnScreen.tsx:441` calls `start()` without `skipRules`; `useCheckInFlow.ts:102-121`). Cancelling leaves the pill full (`HoldToConfirm.tsx:98-102`, `114-118`). A success check-in fires **two** Success haptics (`HoldToConfirm.tsx:77` + `useCheckInFlow.ts:198`); a refusal fires Success, then Error.
4. **An incoming wave fires two haptics**: Light (`useRoom.ts:777`) plus Medium (`BlendnScreen.tsx:312`).
5. **Double-tap like has no haptic** (`RoomSections.tsx:244-251`, `PersonCard.tsx:88-91`). The Like button gets only ScalePress's generic selection tick. Wave and connect send a Light impact on success (`useRoom.ts:702`, `731`).
6. **The ConnectSheet draft persists across people**: `message` state lives in an always-mounted ConnectSheet (`components/grid/ConnectSheet.tsx:81`; mounted at `BlendnScreen.tsx:529`) and is never cleared on send or dismiss.
7. **"GPS signal weak → Try Again" drops the fix**, so the check-in doesn't continue (`lib/locationFix.ts:114-132`).
8. **The Android splash background is #000000** in committed native resources vs `#0F0E0E` in `app.json` and iOS (`android/app/src/main/res/values{,-night}/colors.xml`). The test checks `app.json` only.
9. **Room error blocks Tonight**: a failed `/checkins/active` with no known room shows "Couldn't load the room" to someone who isn't in one (`useRoom.ts:296-299`, `BlendnScreen.tsx:446-460`).
10. **The visibility banner never gets the pseudonym** (`BlendnScreen.tsx:365-373`).
11. **Three inconsistent check-in doors** (§3.2–§3.4), and reveal-offer button order differs between them.
12. **Tab `tabLongPress` emitted with no listener**; `roomButtonLabel` unused.
13. **Comment and doc rot a designer may trip on**:
    - `RoomStage.tsx:101-102` ("The route is a transparent modal")
    - `useRoomControls.ts:101-104` ("No confirmation")
    - `TimeRing.tsx:14-15` ("no react-native-svg in this app"; it's installed)
    - `app/(tabs)/_layout.tsx:236-243` ("`monogram-white.png` tinted"; it's the bold cut)
    - `docs/NAVIGATION.md:52-57`, `67` ("gradient" means the flat #FF906D disc)
    - `docs/NAVIGATION.md:173-179` (Grid segment, sheet)
    - `docs/PULSE.md:244-262` (a "steady ring … with the existing breath behind it"; it's a still dot now)
    - `app/_layout.tsx:39` (Info.plist "Automatic"; it's Dark)
    - `docs/HANDOFF.md:112` (96×114 splash)

---

## 6. Motion and haptics, in detail

### 6.1 HoldToConfirm (`components/blendn/HoldToConfirm.tsx`)

- `HOLD_MS = 900` (`:21`). The gesture is `Gesture.LongPress().minDuration(900).maxDistance(24).shouldCancelWhenOutside(false)` (`:104-123`).
- **onBegin**:
  - `pressed` 0→1 over 120 ms, so the pill scales to **0.97** (`1 - pressed*0.03`, `:132-134`).
  - `progress` 0→1 over **900 ms linear** ("its speed *is* the information", `:35`).
  - The label changes to "Keep holding…".
- Fill: a flat `EMBER.accent` layer **translating in from the left** (`translateX: (p-1)*width`). The label is drawn twice, once on the pill (accent text over a `tint(accent, .16)` track) and once on the fill (`onGradient` text, counter-translated), so the text changes colour exactly at the fill edge. Transforms only (`:125-131`, `:153-170`, `:183-203`).
- **Haptics**: a Light impact at each quarter (25/50/75 %), going up only, fired via `useAnimatedReaction` so it lands on the frame (`:82-89`). A **Success notification** at completion (`:76-79`).
- Release early: `withSpring(0, MOTION_SPRING.snappy)` springs back from wherever it reached. `pressed` goes back over 160 ms (`:119-123`).
- After a failed request (busy true→false) it drains with `MOTION_SPRING.gentle {damping 18, stiffness 220, mass .9}` (`:98-102`).
- Busy: an `ActivityIndicator` replaces the icon, and the label is `busyLabel`.
- Disabled: opacity 0.45.
- **Accessibility**: one `button`. The `activate` action confirms **immediately** ("a screen-reader activation is never an accident", `:39-41`, `:143-151`).
- **Reduce Motion keeps the fill** ("it is progress, not decoration").
- **For the gradient redesign**: this is the natural home for the brand gradient as "the single primary action". The fill layer can become a `LinearGradient` without changing the transform mechanics. Keep linear timing, the quarter ticks and the double-drawn label. Contrast of `onGradient #5B1600` on the gradient's violet end needs checking, and it probably fails.

### 6.2 HeartPop (`components/blendn/HeartPop.tsx`)

- `trigger` is a counter: each increment plays once, and 0 never plays (`:25-26`).
- Scale is set to 0.4, then `withSpring(1, {damping 9, stiffness 320, mass 0.6})` (bouncy overshoot), hold 260 ms, then `withTiming(0.6, 180 ms)`.
- Opacity: 0→1 over 90 ms, hold 380 ms, →0 over 180 ms (`:42-49`). About 650 ms total.
- Glyph: Ionicons `heart` in **`EMBER.accent`**, sized `ICON.lg*1.5` (36) on grid faces and `ICON.lg*2` (48) on the PersonCard face. Centred, no pointer events.
- Reduce Motion: scale 1, fade in over 180 ms, hold 300 ms, fade out over 180 ms (`:37-41`).
- **No haptic** anywhere in the like path.

### 6.3 MatchMoment (`components/blendn/MatchMoment.tsx`)

- An RN `Modal` (`transparent`, `animationType="fade"`, `statusBarTranslucent`), with a full-screen `EMBER.backdrop` (black 60 %) Pressable that closes it (`:118-119`). Content is bottom-aligned with padding 24 and `insets.bottom+24`.
- **Stage** (`FACE 104`, `OFFSET 44`, so the faces overlap by 16 pt): your face starts at x −120, theirs at +120. Both `withSpring(0, MOTION_SPRING.gentle)` to meet (`:91-94`, `:112-115`). Both faces have a page-colour ring.
- **Three hearts** (`ARCS`, `:32-36`):
  - lift 72 / 104 / 56 pt
  - delays 0 / 90 / 180 ms after a **260 ms** beat
  - sizes 20 / 24 / 16
  - each `withTiming(1, {duration 560, easing bezier(0.33,0,0.2,1)})`
  - path: a quadratic arc from your face to theirs (`y = -4·lift·t(1-t)`)
  - each grows in the first 30 %, shrinks into their face over the last 20 %, with scale 0.5→1 (`:175-185`)
  - heart colour is **white** (`textPrimary`), because Say hi is the one accent (`:188-189`)
- **Landing**: when the last heart finishes (around 260+180+560 = **1000 ms**), their face **bumps** to 1.08 over 110 ms, then springs back (snappy), and the phone fires a **Success notification haptic on that frame** (`:100-104`, `:79-81`). `useRoom.celebrate` deliberately fires no haptic so this beat is not spent early (`lib/useRoom.ts:616-621`).
- Text block `FadeIn.delay(420).duration(220)`, exit `FadeOut 120` (`:133`):
  - "IT'S MUTUAL" (label)
  - "You and {name} matched" (`title`, max scale 1.4)
  - the reason line
  - an opener box (`surface`, radius 16) with "TRY" and "“{opener}”" (`openerFor`, `BlendnScreen.tsx:53-59`)
  - accent **Say hi** (56 pt; opens the DM with the opener as an editable draft, never sent for you)
  - **Keep looking** (no fill, no haptic)
- Reduce Motion: faces are placed, no hearts, the haptic still fires immediately (`:85-90`).
- Faces follow the reveal rules (§2.6). The moment shows once per conversation (`useRoom.ts:613-623`).
- "Flat: no confetti, no glow, no loop" (`:47-48`). The glass/orbs redesign could put orbs behind the stage here. It's the brand's peak moment and the one place a gradient might be earned.

### 6.4 TimeRing (`components/blendn/TimeRing.tsx`)

- Words set around a circle (Bump's "4H 18M" ring), replacing a breathing halo. Each glyph is an absolutely positioned view rotated about the centre. **Nothing animates**; it re-renders once a minute when the label changes (`:6-18`).
- Glyph: `TYPE.caption` (11 pt), `allowFontScaling={false}`, colour `textSecondary`.
- Radius = size/2 − 5.5 − 1. Arc step per glyph = (11·0.72/r) rad. The phrase is centred on the top (`:33-39`).
- Used once: 112 pt ring around your 72 pt face, text "IN THE ROOM · 1H 12M" (`RoomSections.tsx:140-144`).
- Hidden from accessibility; the wrapper says "You've been here {time}".
- With react-native-svg available, a `TextPath` version is now possible, which would give smoother kerning on curves.

### 6.5 ConfettiBurst (`components/motion/ConfettiBurst.tsx`, `lib/confetti.ts`)

- **72 pieces**: 60 % ribbons, 30 % squares, 10 % dots, 6–10 pt.
- Colours: `[EMBER.accent, '#FF6D8D', EMBER.violet, EMBER.warning, white]`. These are **not** the logo's #F15524/#925EA8 (`confetti.ts:37`).
- Fired **upward from the hold button**, spread across 280 pt: x0 within ±0.4×width of centre, apex 12–45 % from the top.
- Physics: drag 4/s, gravity 1900 px/s², stagger up to 90 ms, spin ±240°/s, a paper flip `scaleY=cos`, and sway after 0.6 s (`confetti.ts:20-31`, `92-122`).
- Duration **2200 ms** on one UI-thread clock. It fades through the bottom 15 % of the screen and over the last 300 ms. The follow-up tray waits **700 ms** (`CONFETTI_PEAK_MS`).
- Seeded by the trigger count, so two bursts differ. Reduce Motion: nothing is drawn.
- Used by the Blend'n hold and the event-detail CTA. Not used by the Pulse tray check-in.

### 6.6 IntroAnimation (`components/IntroAnimation.tsx`)

Covered in §4 (root layout) for when it runs. What it animates:

- Asset: `assets/logo/intro.webp`, animated WebP (658 KB, 720×346). 44 frames at 42 ms = **1848 ms**, play once.
  - Built from a ProRes master: trimmed to 0–5.50 s, sped up 3×, cropped, wordmark recoloured from ink #1B1931 to white (`scripts/build-intro-animation.sh`).
  - Content: the **monogram draws itself from nothing, slides left, and the wordmark writes on** with a coloured wipe.
- Timeline from mount:

| t (ms) | What happens |
|---|---|
| 0 | Overlay is `EMBER.bg`, `zIndex 10`. Meanwhile the native splash fades out over 200 ms |
| 0–180 | **Black hold** (`BLACK_MS`). The image is *not mounted* so expo-image can't start it early (`:132-135`) |
| 180 | Image mounts (`transition 0`, `autoplay`). **Travel** starts: `translateY` 0→`TRAVEL_Y` (333.2−478.5 = **−145.3 pt**) and `scale` 1→**0.9815** (196.3/200), over 1890 ms with `Easing.in(Easing.cubic)`, so it barely moves early and does most of the movement in the last third. Native driver (`:200-213`, `:127-128`) |
| 180+1890 | Last frame |
| +350 | `HOLD_MS` beat on the finished lockup |
| 2420 | `finish()`: opacity 1→0 over **260 ms** (native driver), then unmount and `onDone` (`:147-158`, `:216`) |

- Image box: 105 pt tall × 218.5 pt wide (105·720/346), max 88 % width (`:326`).
- The travel is aimed so the lockup lands exactly on **sign-in's** lockup (196.3×56 pt, centre y 333.2 on a 440 pt screen). **For a signed-in user it still flies to that spot and fades over the Pulse.**
- **Tap anywhere** skips straight to the fade (`onPress={finish}`).
- `onError` finishes immediately, so the overlay is never stuck black.
- Reduce Motion: no draw or travel, just the 260 ms fade. If the OS query fails, it counts as "motion fine" (`:160-185`).
- Hidden from accessibility (`:228-247`). **No haptics.**
- Android caveat: animated WebP relies on a bundled decoder, and APNG is the fallback (`:46-53`).
- Tests pin the timing, the transparent first frame, mount-after-splash, the lockup target, upward travel and the reduce-motion fallback (`__tests__/introTiming.test.ts:63-137`).
- Also relevant to the splash design: `docs/HANDOFF.md:105-135` (the black hold is load-bearing; the mark barely changes size; don't size against the tagline).

### 6.7 Other motion and haptics inventory (in scope)

| Where | Motion | Haptic |
|---|---|---|
| ScalePress (all uses) | scale to `pressedScale` (0.97 default), 120 ms CSS transition, `bezier(0.23,1,0.32,1)` | `selectionAsync` on press-in unless `haptic={false}` |
| `useInteractionFeedback` | — | `tap`=selection, `success`/`warning`/`error`=notification (`lib/useInteractionFeedback.ts`) |
| SwipeDeck | deal, throw, spring | Light impact on each committed swipe |
| ChatDock | lines `FadeInDown 220`, exit `FadeOut 120`, `LinearTransition 220`; pull-up follows at 0.5× (max 72 pt), opens past 48 pt or −700 pt/s, springs back snappy (`ChatDock.tsx:147-159`, `193-199`) | none (composer `haptic={false}`) |
| RisingSheet / SheetModal (PersonCard, ConnectSheet) | rises by its own height over **300 ms** `bezier(0.32,0.72,0,1)`; sinks over 240 ms; scrim fades in 300 / out 240; drag 1:1 down with rubber-banded up; dismiss past 30 % or 800 pt/s; spring `{400ms, .8}` (`RisingSheet.tsx:27-56`, `147-179`) | — |
| ActionTray | RN `Animated` opacity over 160 ms plus a 40 pt rise over 220 ms (`entrance` easing); exit is the Modal's fade; header drag dismisses past 80 pt or 800 pt/s (`ActionTray.tsx:92-128`) | — |
| RealtimeStatusBanner | `fadeInFast` 150 / `fadeOutFast` 120 | — |
| Going list | FadeInUp, row exit/reflow/restore | — |

---

## 7. Components: compact entries

Material layers for the glass redesign:
- **GC** = glass control layer (floating bars, chips, pills)
- **GS** = glass sheet (modal or docked panels)
- **SC** = solid content (cards, lists, faces)
- **PS** = over-photo scrim

**components/blendn/BlendnScreen.tsx**
- **Role**: the overlay's content controller: mode switch, trays, people, chat, match, confetti.
- **Used in**: `app/(tabs)/_layout.tsx:538`.
- **Variants**: tonight / room / ended / error / loading.
- **Interactions**: §2.6.
- **Motion and haptics**: mode crossfades; wave Medium haptic.
- **Layer**: top bar → **GC**; body → **SC** on the orbs backdrop.
- **Notes**: the top bar is opaque today; the error state blocks Tonight; the pseudonym isn't passed to the banner.

**components/blendn/RoomStage.tsx**
- **Role**: the open/close container transform and drag-to-close; exports `useStageScroll`, `centreButtonOrigin`.
- **Used in**: BlendnScreen.
- **Variants**: reduce-motion fade.
- **Interactions**: pan down.
- **Motion and haptics**: §2.2. No haptic.
- **Layer**: the stage itself is the backdrop host. The morph disc currently goes accent→page, and could go gradient→orbs.
- **Notes**: stale comment at `:101-102`; its geometry is coupled to the bar.

**components/blendn/TonightView.tsx**
- **Role**: the pre-check-in view: deck, empty/error, VenuePass.
- **Used in**: BlendnScreen.
- **Variants**: loading / error / empty / deck / deck+pass / pass only.
- **Interactions**: swipe, tap, See all, Browse, Try again, hold.
- **Motion and haptics**: deal, throw with a Light tick, pass FadeInDown 320.
- **Layer**: cards → **SC** with a **PS** foot gradient; TimeBadge and the "N there" pill → **PS**/GC chips on the photo; VenuePass → **GS** docked; hold pill → the gradient primary.
- **Notes**: no "saved today" emphasis; no photo fallback on the pass; three dead styles.

**components/blendn/RoomSections.tsx**: `RoomHero`, `MeetNext`, `GridFace`, `FaceGridHead`, `FaceGridMore`, `useNow`, `useGridCell`
- **Role**: room content blocks.
- **Variants**: arrivals vs first faces, "+N", fresh-arrival line, countdown, liked/matched/here marks, empty grid, more/loading.
- **Interactions**: tap, double-tap, accessibility actions.
- **Motion and haptics**: faceIn spring, layout spring, staggered fades, RollingNumber. No haptics.
- **Layer**: **SC**. The Meet next timer pill → **GC** chip.
- **Notes**: a still LIVE dot is required; reason lines are capped at 24 characters (`roomMoments.ts:14`).

**components/blendn/Face.tsx**
- **Role**: one person at any size: photo if revealed, else the pseudonym creature (emoji on a `pseudonymAvatar` 2-colour LinearGradient).
- **Used in**: hero, stack, Meet next, grid, PersonCard, MatchMoment, RoomRecap.
- **Variants**: `ring` (2 pt page-colour padding ring, because RN borders grow inward, `:19-22`), `ringColor`.
- **Motion**: none.
- **Layer**: **SC**.
- **Notes**: the emoji is sized `0.46×size` (a design exception). The same mark is used across the product.

**components/blendn/PersonCard.tsx**
- **Role**: a person sheet: face (112), name and age, top reason, all reasons panel, interest chips (≤8), actions, "View profile".
- **Used in**: BlendnScreen.
- **Variants**: matched (Say hi accent), liked (Liked neutral, disabled), requested (checkmark), wave sent / too soon ("{name} knows you waved" / "You waved a moment ago").
- **Interactions**: double-tap the face to like (HeartPop 48), Like, 👋 Wave (one in flight), ✈ Message → ConnectSheet, ⋯ report/block (`textTertiary`, low contrast by design), View profile → `/user/[id]` with pseudonym and roomSeed, drag down or scrim tap to close.
- **Motion and haptics**: RisingSheet rise/sink/drag; ScalePress selection ticks on the actions.
- **Layer**: **GS**. The sheet is currently `EMBER.bg` with radius 24 (`:255-262`).
- **Notes**: "Like is private until mutual" a11y hint; the Message hint says it reveals you.

**components/blendn/ChatDock.tsx**
- **Role**: the room chat docked at the bottom: the last 2 lines interleaved with system lines ("walked in", "waved at you 👋", "You matched with"), plus a composer-shaped pill "Say something to the room" and "Room chat · N".
- **Used in**: BlendnScreen.
- **Variants**: left ("You left this room's chat. Open it to rejoin."), history failed ("Couldn't load messages." + TRY AGAIN), quiet ("Nobody has said anything yet. Be the first."), lines.
- **Interactions**: tap the pill, pull up.
- **Motion and haptics**: line fades/slides, pull spring. No haptic.
- **Layer**: **GS** docked (currently `surfaceSunken` with top radius 24).
- **Notes**: a fixed 2-line height so the page never moves; read-only (the full chat is its own screen); the count is the total messages, not unread.

**components/blendn/HoldToConfirm.tsx**: §6.1.
- **Used in**: VenuePass only.
- **Layer**: the primary action, a gradient fill candidate.
- **Notes**: the cancel-after-rules state stays full; double Success haptic.

**components/blendn/HeartPop.tsx**: §6.2.
- **Used in**: GridFace, PersonCard.
- **Layer**: an overlay on **SC**.
- **Notes**: an accent heart, otherwise silent.

**components/blendn/MatchMoment.tsx**: §6.3.
- **Used in**: BlendnScreen.
- **Layer**: a full-screen moment over a backdrop; the text block could become **GS**, the stage could take orbs.
- **Notes**: the haptic fires on the landing frame; flat by rule.

**components/blendn/TimeRing.tsx**: §6.4.
- **Used in**: RoomHero.
- **Layer**: **SC**.
- **Notes**: static; the svg comment is stale.

**components/blendn/RoomRecap.tsx**: §2.7.
- **Used in**: BlendnScreen ended mode.
- **Layer**: **SC**, with the primary in gradient.
- **Notes**: no confetti by rule; Back never checks out.

**components/board/BoardSections.tsx**: `BoardMark`, `BoardEntry`, `BoardPostCard`, `BoardComposer`, `announce`, `AskState`
- **Role**: the board's pieces (§4 board).
- **Used in**: `app/board/[eventId].tsx`, `EventDetailScreen` (BoardEntry), BoardRequestsSection (BoardMark).
- **Variants**: offer / seeking / chat; mine vs others; ask idle/asking/settled/refused; full; composer offer vs seeking.
- **Motion and haptics**: none.
- **Layer**: cards and composer → **SC**; the composer could be **GS**.
- **Notes**: placeholder design; the marks are hidden from accessibility.

**components/board/BoardRequestsSection.tsx**
- **Role**: board asks in the Banter: incoming (Decline/Accept/More) and "YOU ASKED" outgoing (Waiting on them / They said yes / Closed / You withdrew this, Withdraw while live).
- **Used in**: `app/(tabs)/chat.tsx`.
- **Interactions**: Accept opens the DM, decline/withdraw are optimistic with restore, More opens report/block.
- **Motion and haptics**: none; toasts on error.
- **Layer**: **SC** rows.
- **Notes**: a decline is never surfaced; accept never draws the match opener (`__tests__/boardConversationNoOpener.test.tsx`).

**components/grid/ConnectSheet.tsx**
- **Role**: a connection request with a message.
- **Content**: Grabber, "Connect with {name}", the **disclosure above the field** ("{them} will see your name and photo. You'll still see them as {them} until they choose to reveal."), a multiline note (108–200 pt, `surfaceSunken`, radius 24, placeholder "Why do you want to talk?"), "They see this before deciding." plus a remaining counter (turns white under 40), accent **Send request** (`surface` when disabled, "Sending…"), and the footnote "You can only send one request to someone."
- **Used in**: BlendnScreen, `app/user/[id].tsx`.
- **Motion**: RisingSheet with keyboard avoidance.
- **Layer**: **GS**.
- **Notes**: the draft isn't cleared between people (§5.6). The name is server-resolved, never an assumed real name (`:37-41`).

**components/ActionTray.tsx**
- **Role**: the app's generic bottom tray (confirmations, refusals, check-in trays, presence prompts, safety sheets).
- **Variants**: size compact (35 %) / default (55 %) / expanded (80 %); layout row (2 per row) vs stack; button primary (accent) / secondary (`surface`) / destructive; loading; disabled; non-dismissible; children slot.
- **Interactions**: backdrop tap, header drag down, Android back, buttons (scroll when overflowing).
- **Motion and haptics**: fade 160 plus rise 220; Modal fade exit. No haptics.
- **Layer**: **GS**. Currently `surfaceSunken` with a hairline `separator` border and top radius 24.
- **Notes**: button order is caller-defined, which is inconsistent across check-in trays.

**components/SheetHost.tsx**
- **Role**: draws the global `lib/sheet.ts` sheet (safety flows, message menus) through one never-remounted ActionTray. Actions sheets are stacked; reason sheets are expanded, with radio rows (selected = white fill, dark text), an optional note (500 characters), Cancel and the primary submit, and a "Try again" relabel plus a destructive error line.
- **Used in**: `app/_layout.tsx:729`.
- **Layer**: **GS**.

**components/PresenceMonitor.tsx**
- **Role**: foreground-only geofence watcher. It samples on `SAMPLE_INTERVAL_MS`; null fixes break the eviction run; it needs 6 readings over 10 min to ask and honours "I'm still here" for 30 min.
- **UI**: a **non-dismissible** tray "Still at the event?" / "It looks like you've moved away. If you've left, we'll check you out so the room stays accurate." with **I'm still here** (primary) and **Check me out**. An automatic checkout shows "Checked out" / "You've been away from the venue for a while, so we checked you out. You can check back in any time you're there." with **Got it** (`lib/presence.ts:181-192`, `PresenceMonitor.tsx:220-263`).
- **Used in**: the root, signed in.
- **Layer**: **GS** via ActionTray.
- **Notes**: no haptic on an automatic checkout; the centre button updates via `checkInChanged`.

**components/RoomVisibilityBanner.tsx**
- **Role**: the always-on statement of how the room sees you.
- **Variants**:
  - **anonymous**: quiet `surfaceSunken`, `eye-off` icon, "You're anonymous in this room" / "You're in this room as X", action "SHOW WHO I AM".
  - **named**: `surface` with a `separator` border, `eye`, "People here can see your name and photo", "GO ANONYMOUS".
  - **hidden**: `cloud-offline`, "You're not listed here — Show online status is off", "TURN IT ON" → Settings.
  - **blocked**: reveal is disabled with a reason, "Add a photo to your profile first — that's what other people would see."
- Radius 32. Busy disables the action.
- **Used in**: the Room.
- **Layer**: **SC** (a persistent status strip; it should not be translucent over content).
- **Notes**: never collapses; one-directional gate (`:15-41`).

**components/RealtimeStatusBanner.tsx**
- **Role**: offline vs live-updates-paused.
- **Variants**: offline (destructive tint 22 %, "You're offline. Some actions won't work until you're back."); socket down for more than **3 s** (warning tint 16 %, "Live updates paused." + TRY AGAIN, or "Reconnecting…").
- **Used in**: the Room (and other screens).
- **Motion**: fade 150/120.
- **Layer**: **SC** status tint (keep the tints distinct).
- **Notes**: the 3 s grace stops a flash on every foreground (SCRUM-407).

**components/IntroAnimation.tsx**: §6.6.
- **Used in**: the root layout.
- **Layer**: a full-bleed brand moment (orbs candidate).
- **Notes**: runs for signed-in users too; tap to skip.

**components/motion/** (supporting, used in scope)
- `ScalePress`: press feedback, selection haptic.
- `SwipeDeck`: Tonight deck.
- `RisingSheet` / `SheetModal`: PersonCard, ConnectSheet.
- `ConfettiBurst`: check-in.
- `FadeInUp`: Going list.
- `presence.ts`: `popIn` / `popOut` / `fadeInFast` / `fadeOutFast`.

**lib/roomButton.ts**: §1. Pure and tested. `roomButtonLabel` is unused.

**lib/roomSignal.ts**: §1.1. A module store; skips no-op notifications; cleared on sign-out.

**lib/blendnOverlay.ts**: open/closed store with `useSyncExternalStore`. `openBlendn()` / `blendnClosed()` (the latter is called by RoomStage after the close animation). Calling `openBlendn` from a root-stack screen opens it underneath.

**lib/checkIn.ts**: §3.1. **lib/useCheckInFlow.ts**: §3.2–§3.3.

---

## 8. Product rules, collected (a redesign must keep these unless the owner reverses them)

- 18+ only. Hosts are organisers.
- Two mutually exclusive modes; the centre button is the mode switch and a status indicator, and **every state goes somewhere real** (`docs/NAVIGATION.md:28-46`, `104-106`).
- Live outranks check-in, which outranks today. Today counts **saved** events only. The check-in offer has no margin; the server is the gate.
- Checking in puts you on a roster, so it needs a deliberate act (the hold) and the a11y label states the consequence.
- Check out is one tap plus a confirm, always reachable from the room's top bar and the Pulse tray.
- Anonymous by default. Faces only where earned. Reveal is gated on having a name and photo; going anonymous never is. The visibility banner never hides.
- Like is private until mutual; wave is seen immediately (one per 10 min per pair); message reveals you, and says so before typing; one request per person.
- Meet next is a 15-min shared clock seeded by the event; reason lines never invent facts.
- The recap never checks you out; the rating is private; no confetti on the recap.
- Board: pseudonyms only, pre-doors only, no confirm on Ask, declines are never visible, 409s are states, and refusals use the server's words.
- Accent on at most one thing per screen; status as still marks, never motion; Reduce Motion fallbacks on every animation, but progress (the hold fill) and direct manipulation (drags) are kept.
- The tab bar floats over content (`TAB_BAR_CLEARANCE` 92), and the Pulse hero is sized against `tabBarTop()`.
- Fonts gate the splash; auth never does. The launch intro never blocks the app and is skippable.
