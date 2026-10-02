# Blend'n redesign: screen by screen

This file is the companion to [`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md). That file defines the system: tokens, materials, motion, haptics and components. This one applies the system to every screen in the app, grouped into the eight flows that Claude Design works through as separate projects ([`PROMPTS.md`](./PROMPTS.md)).

**Field-level detail lives in the audits.** Exact copy, every state, data sources and `file:line` references are in [`audit/`](./audit/), written from the code at `origin/dev` `54481d2` on 2026-10-02. When this file and an audit disagree about *what the screen does*, the audit wins. When they disagree about *how it should look*, this file wins.

## How to read an entry

| Field | Meaning |
|---|---|
| **Job** | Why a person opens the screen |
| **Primary** | The one brand-gradient action. "None" means the screen is monochrome |
| **Draw these states** | Every state needs its own frame, including the unhappy ones |
| **Direction** | What the redesign does here |
| **Motion / Haptics** | Uses the named tokens from DESIGN-BRIEF §9 and §10 (`H.select`, `M.settle`, …) |
| **Keep** | Product rules that hold whatever the look. Breaking one is a bug, not a style choice |
| **Fix while redesigning** | Defects the audit found that the new design should design out |

Abbreviations for the material layers (DESIGN-BRIEF §5):
- **L0**: backdrop (ink, orbs, grain)
- **L1**: solid content
- **L2**: glass chrome
- **L3**: sheet
- **L4**: moment (full-bleed takeover)

---

## Flow 1 · Launch and entry

Audit: [`audit/audit-core-loop.md` §4 (root layout, `/`)](./audit/audit-core-loop.md), [`audit/audit-entry-system.md` (sign-in, forgot-password)](./audit/audit-entry-system.md).

### Splash and launch intro: deferred
The native splash, the 180ms black hold, the 1848ms monogram draw-on (`components/IntroAnimation.tsx`) and the hand-off to the landing are **out of scope for this pass**. The owner will decide after the redesign whether Claude Design or Claude Code designs the new launch sequence. See DESIGN-BRIEF §20.

For now, keep a placeholder frame showing the static splash (monogram centred on ink, 118pt slot) so the landing screen's first frame can be checked against it.

### `/` · Landing (signed out)
- **Job:** the front door. Choose Google, Apple or email.
- **Primary:** none on purpose. Google's and Apple's buttons keep their own chrome, and the brand arrives through the mark. The unreachable state's **Try again** is that state's primary.
- **Draw these states:**
  - signed out
  - signed out + pending invite ("{name} invited you")
  - signed out + error (inline, persistent)
  - session-ended notice
  - Google busy
  - Apple busy
  - unreachable ("Can't reach Blend'n")
  - auth-resolving hold (the mark alone)
- **Direction:**
  - This is the one screen where the **orbs are allowed to be the hero**. Full-bleed L0 with an orange orb top-left and a violet orb lower right, the way the brand manual's cover does it.
  - Lockup centred in the upper half, tagline under it in `body`/secondary.
  - The buttons sit on a bottom glass dock (L2) so they read as controls floating over the brand art.
  - Google: white pill, ink text, the G. Apple: system WHITE button. Email: a hairline-outlined pill on the dock's fill (never glass on glass).
  - Draw it again with the orbs off; it must still hold up.
- **Motion:**
  - The lockup settles from the intro's last frame. The buttons rise in from 12pt below with a 40ms stagger, opacity and translate only.
  - The orbs drift on the slow ambient budget.
  - Reduce Motion: everything is placed, no drift.
- **Haptics:** none on press (the provider buttons aren't the app's primary). `H.error` when sign-in fails.
- **Keep:**
  - Errors are visible and stay put; never a toast.
  - Cancelling OAuth is not an error.
  - The Apple button is Apple's and the Google button is Google's.
  - Email is visually third (outlined).
  - The wordmark is never rendered as live text.
  - Never reveal whether an address has an account.
- **Fix while redesigning:** the two 21pt button labels render in the system font (`app/index.tsx:481,509`). Set them in the type system or keep them as an explicit, measured exception.

### `/sign-in` · Sign in / Create account
- **Job:** email + password, with a segmented switch between Sign in and Create account.
- **Primary:** **Sign in** / **Create account**.
- **Draw these states:**
  - both segments
  - typing
  - inline validation per field
  - server error
  - busy
  - rate-limited (the server's sentence)
  - password visibility on/off
  - the keyboard up on a 360dp-wide Android
- **Direction:**
  - A glass top bar with back.
  - The segmented control is a glass capsule with a white thumb that slides (`M.snap`).
  - Fields are solid L1 inputs with a 1pt `inputBorder` and a visible `focused` state (`focusRing`, DESIGN-BRIEF §4.1). Today there is no focus, error or filled styling, so all three need designing.
  - The primary CTA is docked above the keyboard.
- **Haptics:**
  - `H.select` when the segment changes.
  - `H.error` with the error shake (DESIGN-BRIEF §9.3 #20) when the server refuses. Under Reduce Motion, no shake, colour and text only.
  - `H.success` on success.
- **Keep:** never reveal whether an account exists.

### `/forgot-password` · Forgot password → Check your inbox
- **Primary:** **Send link**, then **Open mail app** on the confirmation.
- **Draw:** entry, busy, sent ("Check your inbox"), error.
- **Direction:** the same frame as sign-in. The "sent" state gets one small moment, an outlined envelope that settles in (`base`/`entrance`), not an illustration.

---

## Flow 2 · Onboarding (8 steps + Bring your friends)

Audit: [`audit/audit-entry-system.md`](./audit/audit-entry-system.md), sections "A1. Shared onboarding frame", every `/onboarding/*` section and "A2. Components"; also `docs/ONBOARDING.md`. Treat the audit as the authority over `ONBOARDING.md`; the doc has drifted.

**Shared frame** (`components/onboarding/OnboardingScreen.tsx`):
- **Header (L2 glass):** back + progress bar.
- **Body (L1 on L0):** orbs at low intensity behind it, so onboarding feels like the brand's world, not a form.
- **Footer (L2 glass dock):** primary + Skip.
- **Progress:** a thin capsule track just below the glass header (on the body, not on the glass), filled with the **brand gradient** and growing step to step on `M.settle`. It is one of the two listed exceptions to the one-primary rule (DESIGN-BRIEF §4.7).
- **Steps:** they push with the platform transition (iOS slide, Android default).
- **Haptics:** `H.primary` on the primary, `H.select` on every chip, `H.toggle` on custom switches.
- **Button copy:** use the audit's labels ("Continue", "Turn on notifications", "Allow location", "Start Blend'n", "Share my link"); this file paraphrases.

| Step | Route | Job | Primary | Direction notes |
|---|---|---|---|---|
| 1 | `basics` | Name, date of birth (18+ gate), gender. Cannot be skipped | Continue | The DOB field uses Geist Mono for DD/MM/YYYY. Under-18 shows a clear, kind refusal state (draw it). Chips: white fill + ink text when selected |
| 2 | `notifications` | Ask for push | Turn on notifications | `PermissionIllustration` becomes a small animated scene: a solid notification bubble drops in once and the screen holds still after. Draw granted / denied / blocked → "Turn this on in Settings" tray |
| 3 | `location` | Ask for location | Allow location | The map card with concentric rings: draw the rings once (one-shot ripple), then still. Draw granted / denied / blocked / precise-off. The copy has to explain the check-in fence |
| 4 | `preferences` | Looking for (5 photo cards), Stay anonymous, Show on profile | Continue | **Make the audience sentence visible:** "Only people you match or talk with will see it. Never a room." Today it is screen-reader only (`preferences.tsx:211`). Selected Looking-for card: a 2pt white ring + a solid white check badge. Replace the three photos with UI baked into them. Under 18 removes Dating |
| 5 | `journey` | Work, study, plans | Continue / Skip | Three `EmberCardSection`s. These solid cards are the reference shape for every content card |
| 6 | `details` | Bio (500 chars), interests, extra fields | Continue / Skip | The bio counter is in Geist Mono and turns `warning` under 40. The interest picker uses chips with a selected-count cap |
| 7 | `media` | Add photos (drag to reorder) | Continue / Skip | Tiles reflow on transforms only. Draw: empty, 1 photo, full, uploading (progress ring on the tile), failed (retry), moderation-pulled photo |
| 8 | `ready` | "You're all set, {name}" | Start Blend'n | **The one celebration in onboarding:** the gradient monogram assembles, the orbs brighten once, `H.success`. ≤1.5s, tap to skip. No confetti |
| — | `friends` | Bring your friends (invite link) | Share my link → Start Blend'n | Draw: link loading, link ready, **link failed + Try again** (today the CTA silently disables). The share sheet is native |

**Keep:**
- 18+ only.
- Steps 1 and 8 cannot be skipped.
- Weight comes from the font family, never `fontWeight`.
- Anonymous by default.

---

## Flow 3 · Discovery: the home map, the Pulse, the Scene, and around them

Audit: [`audit/audit-discovery.md`](./audit/audit-discovery.md), `docs/PULSE.md`, `docs/SCENE.md`, and `docs/PLACEHOLDER_SCREENS.md` §8–§10 for the home map and Places (newer than the audit).

**Unify the event card family first.** Three cards (featured, upcoming, nearby) disagree on text-on-photo, icon set, radius, save heart, long-press timing and date format, and there are seven date formats across the app (audit Part 1.4 and Part 3.1). Design one `EventCard` with three sizes: `hero`, `row` and `compact`. Use one date/time grammar in Geist Mono: `Tonight · 9:30 PM`, `Sat 4 Oct · 8 PM`, `In 25 min`, `Live`. Use one save affordance.

### `/(tabs)/events` · Home: the map and the drawer (Events | Places)
**New since the audit** (#363, 2026-10-02). Rules: `docs/PLACEHOLDER_SCREENS.md` §8–§10; design tickets SCRUM-541 (home) and SCRUM-542 (Places). Code: `components/home/`.

- **What it is:**
  - A full-screen **map**: plain and dark today; next, a MapLibre 3D map with the buildings under events and open venues lit in brand shades.
  - The **top bar** (wordmark, bell) floats over the map.
  - A **drawer** rests at three heights, `peek` / `half` (default) / `full`, and holds a segmented control: **Events | Places**.
    - **Events** is the Pulse (next entry), the same component moved into the drawer.
    - **Places** lists venues.
- **Primary:** none; the centre disc carries the call to action.
- **Draw these states:**
  - drawer at peek, half and full on each pane
  - the keyboard open from the Pulse's search (the drawer opens fully)
  - a screen reader on (the drawer opens full; the map leaves the reading order)
  - location denied (map centred on the chosen city)
  - city changed (the map moves)
  - Places: loading, list, refresh failed (inline Try again), empty city
- **Direction:**
  - **The drawer is the app's most important glass surface after the tab bar.** It is an Apple-Maps-style persistent sheet: L3 glass on iOS 26 at `peek` and `half`, becoming more opaque at `full`; Tier B on Android.
  - The handle and segmented control sit in its header. The segmented control is a capsule with a sliding white thumb (`M.snap`).
  - The top bar is L2 glass circles over the map.
  - **Map content** (lit buildings, pins) is content-layer art. It may use brand shades, but **no UI control on the map glows**, and pins are not glass.
  - Decide what `peek` shows (a one-line summary such as "12 on tonight · 4 places live" is open for design) and what the map shows at each height.
- **Motion:**
  - The drawer snaps between heights on `M.fling` with the finger's velocity.
  - The list scrolls independently and never moves the drawer.
  - `H.detent` when a drag settles at a different height.
- **Keep:**
  - **No check-in boundary is ever drawn on the map** (the owner's ruling; a test refuses the shapes).
  - The segmented control is always reachable (it's what `peek` leaves showing).
  - Switching panes never loses your place.
  - Every row is reachable at `half`.
  - 44pt handle and segments.
  - Media plays only when seen.
  - The map follows the city.

### Places (the drawer's second pane) and `/venue/[id]`
- **Rows:**
  - name, type, area, distance (Geist Mono), tonight's event if any;
  - **live as a bucket, never a number**: "Under 5 live", "5–9 live", "10–19 live", "20+ live". A count that ticks from 4 to 5 tells you someone just walked in.
- **Keep:**
  - **Never who.** Only how many, in buckets.
  - The server decides when a venue is hidden: from an hour before an event there starts until it ends, the venue drops out and the event's card says "at ‹Venue›". The app filters nothing by time.
- **`/venue/[id]`** is a placeholder until "Places live" (DESIGN-BRIEF §20): name, type, area, the live bucket, tonight's event. Draw it simply, and leave room for the live pill, countdown and Go Live.

### `/(tabs)/events` · The Pulse (the drawer's Events pane)
- **Job:** what's on, tonight and soon, in my city.
- **Primary:** none in the gradient. The title's accent word ("The **Pulse**") carries the brand. On the populated feed the only gradient on screen is the Blend'n disc in the tab bar. This is deliberate: the centre button is the call to action.
- **Content, in order:**
  1. Header: title, city + date line, search, filter, notification bell.
  2. **Tonight strip:** events live now or starting within ~6h. New, and see Direction.
  3. Featured carousel.
  4. Upcoming, grouped by day.
  5. Nearby.
  6. Nightlife in {city}.
  7. Interested.
- **Draw these states:**
  - first load skeleton
  - populated
  - pull-to-refresh
  - offline with cache (show the stale-data notice)
  - location denied (city order, no distances, an inline prompt to enable)
  - no events in city
  - search typing / results / no results
  - filters applied (show the applied filters as removable chips, not just a count)
  - city picker (searchable sheet, scalable past a handful of cities)
  - long-press preview
  - notifications sheet (bell): empty and populated
  - every empty kind and banner the audit lists (Part 2.1)
- **Direction:**
  - **The header is transparent over L0 at rest and becomes L2 glass on scroll** (scroll-edge), holding the condensed title, search and bell.
  - **Add the missing "now" layer.** Today there is no live dot on any card and no Tonight section; live state exists only as a small green line on the Scene. Add:
    - a `LivePill` (still green dot + "Live") on any card whose event is running, from its start and end times (available today);
    - a Tonight strip at the top: events running now or starting within ~6h, from the same feed (the Blend'n overlay already builds this list), as compact cards in a horizontal snap row;
    - **not** a live "N checked in now" on Pulse cards: the feed doesn't carry it (audit Part 2.1, "Not available"). Counts live in Blend'n, where the data exists.
  - **Event cards:**
    - The photo carries the colour.
    - Text sits on a bottom scrim (L1 + photo scrim), never on glass.
    - Info pills on photos are **scrim pills, not glass** (DESIGN-BRIEF §5).
  - **Long-press preview** becomes a real peek: the card lifts (`M.settle`, scale 1.03) over a dimmed, blurred backdrop, with an action menu: Save, Share, View details; **Check in** when inside the fence, which opens the Blend'n pass (check-in always goes through the hold); **Check out** when you're checked into this event. Use a native context menu where the platform offers one (iOS 26 morphs menus from their source).
- **Motion:**
  - First load: skeleton → content crossfade (`base`). Sections stagger in once per session (28ms), never on refocus.
  - Carousel snaps silently (passive browsing).
  - Pull-to-refresh: a branded refresh — the monogram stroke draws on as you pull, with `H.threshold` at the trigger point.
- **Haptics:**
  - `H.select` on chip/filter selection.
  - `H.longPress` when the peek opens.
  - `H.like` on save; none on unsave.
  - No haptic on scroll or carousel snap.
- **Keep:**
  - Every number on a card comes from a real column. Never invent "142 joined".
  - Upcoming is grouped by day, and each card shows only its time.
  - Show counts, not faces, before check-in ("blind regulars").
  - The hero card is sized for the drawer's header (since #363) and the tab bar's measured top.
  - Event cards say "at ‹Venue›" when the server names a linked venue, else the organiser's text.
- **Fix while redesigning:**
  - The door-policy pill can never show.
  - "N joined" may always be 0 before doors.
  - The long-press tray is text-only with no haptic.
  - The city picker doesn't scale.

### `/event/[id]` · The Scene (event detail)
- **Job:** decide to go, and later get in.
- **Primary:** the docked `SceneCTA`, which changes with time:
  - before doors: **I'm going** → **You're going**
  - during: **Blend in** → **You're in**
  - after: **Rate who you met** / **Rate the night** if you attended, **See what's on tonight** if not
  
  A full event still takes people, so capacity never disables it.
- **Order** (keep; a test pins it):
  1. top bar (back · mark · save · share · ⋯ with Report event, always reachable)
  2. hero (media, title, date, time, scarcity)
  3. "The Experience"
  4. body
  5. gallery
  6. attendees
  7. Board entry (before doors only)
  8. location card
  9. map
  10. CTA dock
  11. lightbox
- **Draw these states:**
  - before doors (going / not going)
  - live (inside fence / outside fence / checked in)
  - ended (attended / not attended)
  - cancelled
  - waitlisted
  - full
  - age-restricted
  - loading skeleton
  - failed
  - video hero
  - photo-only hero
  - no-photo hero (brand fallback art, not a grey box)
- **Direction:**
  - **Full-bleed hero under a transparent top bar.** The back, save and share buttons are **clear glass circles with a 35% dim gradient** at the top of the photo. Today a solid bar covers about 110–126pt of the photo and its page dots.
  - **Cover-tinted page:** the top ~40% of the page takes a gradient of the cover's dominant hue into ink, clamped so white text keeps ≥4.5:1. Fall back to the brand orb when the cover is grey.
  - Details become a small bento (time · venue · crowd · door policy) of solid L1 tiles, times in the `numeric` role. **No price**: the product shows none.
  - The CTA dock is an L2 glass bar holding the gradient primary. **Pad it by the bottom safe area**: today the pill may sit in the home-indicator zone.
- **Motion:**
  - Arriving from a card is a **shared-element continuation**: the card image expands into the hero (iOS zoom transition where available; otherwise a native push with the hero showing the same cached image).
  - The CTA label swaps with a vertical text slide (`quick`).
  - Saving pops the heart outline (`M.pop`, scale 1→1.2→1).
- **Haptics:**
  - No press haptic on the CTA: its handlers fire the outcome, so a press haptic would double-buzz. `H.success` when the RSVP is confirmed (none today).
  - `H.like` on save.
  - The check-in path: see Flow 4.
- **Keep:**
  - The two composition lists (screen and harness) match.
  - Board entry shows before doors only.
  - The rating is private.
  - "Rules and regulations" is **removed** from check-in (an owner ask still in code).
  - One CTA slot; never two primaries; quiet once done.
  - No price, no "LIMITED ACCESS"; the scarcity pill only says something true (10 or fewer left, under 20% remaining, or Full).
  - Report-event is always reachable, with no check-in gate.
  - Check out is not on this screen.
  - The map is a picture; a tap opens Maps.
  - "Running this event? Claim it" (curated events only): server-decided, quiet, **never a button and never in the CTA dock**; it links out to the dashboard host.
- **Fix while redesigning:** check-in from the Scene, the Pulse peek and the Blend'n pass behave three different ways. The redesign specifies **one** check-in flow (Flow 4).

### `/nearby-events` · Nearby ("See all")
- **Job:** a denser list of what's near, sorted by distance.
- **Primary:** none.
- **Draw:** list, map toggle (if kept), location denied, empty, loading, failed.
- **Direction:** the `EventCard.row` size with distance in Geist Mono. Show Live pills. Use a glass header with a sort control.

### `/event-preferences/[eventId]` · Why you're here / visibility (modal)
- **Job:** set your intent for this event, and whether people can see you.
- **Primary:** Save.
- **Direction:**
  - L3 sheet at full height.
  - Intent chips (white fill when selected).
  - Visibility as a two-option card choice: "Anonymous" (creature mark) vs "Named" (your photo). The consequence is printed under each option.
  - `H.select` on chips, `H.success` on save.
- **Draw:** first time (from check-in's "Why do you go out?"), editing later, anonymous, named, reveal blocked (no photo yet), saving, failed.
- **Keep:** going anonymous is never gated; revealing is gated on having a name and photo.

### `/rate/[eventId]` · After the night
- **Job:** privately rate the people you met, or the night.
- **Primary:** Done / Next.
- **Direction:**
  - Quiet and private by design: no stars, no celebration, skipping is free.
  - A person-by-person card stack, one decision per card.
  - Solid cards; the choice chips use `H.select`.
  - The end state is a single calm line, not confetti.
- **Draw:** nobody to rate, one person, several people, the night only (didn't meet anyone), skipped, submitted, failed.
- **Keep:** private, skippable, never shown to the other person.

---

## Flow 4 · The core loop: the tab bar, Blend'n, Tonight, the Room

Audit: [`audit/audit-core-loop.md`](./audit/audit-core-loop.md) (read all of it; this is the product's heart), `docs/NAVIGATION.md`.

### The tab bar (`app/(tabs)/_layout.tsx`)
- **Order:** `Pulse · Going · [Blend'n] · Banter · Me`.
- **Direction:** a floating **glass capsule** (L2), 64pt tall, radius 32, inset 16 from the screen sides, sitting above the home indicator (DESIGN-BRIEF §5.3).
  - **Labels and icons are monochrome.** White when selected, `textSecondary` when not, never orange.
  - A selection capsule of at least 22% white (56pt, radius 28) sits behind the selected item.
  - Icons are **outlined in both states**. Selected = a heavier stroke + the selection capsule, never a filled glyph.
  - The Me tab shows your photo (24pt) with a white ring when selected.
  - The centre disc is specified separately (next section).
- **Draw:** each tab selected; the bar over the brightest poster supplied and over plain white; the bar over ink; Reduce Transparency (solid); Increase Contrast; Android (DESIGN-BRIEF §13); the bar hidden under the open Blend'n overlay.
- **Motion:** the selection capsule slides between items (`M.snap`). A second tap on the focused tab scrolls to top.
- **Haptics:** none on tab change (DESIGN-BRIEF §10). The centre disc has `H.disc`.
- **Keep:**
  - The bar floats; screens pad by its measured height.
  - Every tab is reachable by VoiceOver and TalkBack.
  - While the Blend'n overlay is open, the bar is hidden from assistive tech.

### The Blend'n centre button: the signature
Full spec in **DESIGN-BRIEF §11**. Draw all four states (idle, today, check-in, live ± unread) as still frames, each transition as a short storyboard, and each again under Reduce Motion.

### The Blend'n overlay: Tonight → pass → Room → Recap
`components/blendn/BlendnScreen.tsx`. It is an **overlay that opens out of the disc** (a container transform), not a route. `/room` survives only as an address that opens this overlay for old links; there is nothing to design there.

**Open and close:**
- Keep the container transform: the disc becomes the room.
- The morph circle now goes **gradient → L0 (ink + orbs)**, where today it goes accent → flat page.
- 420ms open, 300ms close; drag down to close; Reduce Motion = a 200ms fade.
- Opening it gives no haptic beyond the disc's own press.

#### Tonight (not checked in)
- **Job:** what's on right now near me, and, if I'm at a door, let me in.
- **Primary:** the **hold-to-check-in pass** when inside a fence; otherwise none. The empty and error states' buttons are those states' primaries.
- **Draw these states:**
  - loading
  - deck (1, 3, 10 cards)
  - **saved-today emphasis** (today this state has no distinct treatment: "You're going · starts 9 PM" as a ribbon on that card, top of the deck)
  - inside-fence with pass
  - pass-only (no deck)
  - empty ("Nothing on near you right now" + Browse the Pulse)
  - error
  - location denied (draw it; today it silently falls back)
  - offline with cache
  - after check-in: the reveal offer (the first time, the full warning "Everyone here will see your name and photo…"; later, the short version), or the "Why do you go out?" question
  - the timeout tray ("Still checking you in": Cancel / Retry)
  - the seven refusal sheets, each in the server's words: Not quite there yet (+ Open Maps), Doors aren't open, This one's over, Not open to you, At capacity, Already checked in, Check-in failed
  - the location trays: services off, permission needed, timeout, weak GPS
- **Direction:**
  - The deck of tall photo cards (radius 32) fans on L0 with orbs.
  - `TimeBadge` ("Live" with a still dot / "In 25 min" / "9:30 PM") and "N there" are **scrim pills** on the photo.
  - **The VenuePass is the signature surface of the whole app.** It docks at the bottom as an L2 glass panel: venue thumbnail (with a brand-art fallback, not nothing), "You're here", the title, "N inside now" (rolling), a taste teaser (blank discs with "?"), and the **HoldToConfirm** pill.
- **The hold, redesigned:**
  - The pill's track is a `surfaceSunken` fill (the VenuePass around it is already glass).
  - The fill is the **brand fill gradient**, translating in from the left, linear over 900ms, with the label drawn twice so it changes colour exactly at the fill edge (keep this mechanic).
  - Quarter ticks: `H.tick` at 25/50/75%, ramping in intensity.
  - At 100%: `H.commit` (committed, not yet successful).
  - With a screen reader, Switch Control or Voice Control, activating the pill checks in directly; the label states the consequence. The hold is never required (today's behaviour; keep it).
  - Then straight into checking in, **with no rules tray afterwards**. The hold *is* the consent.
- **Check-in success** (the one ceremony):
  1. `H.success` fires once, when the server confirms. Today it fires twice.
  2. The pass's gradient floods upward through the panel (`M.settle`: a fill is an effect, so it never bounces).
  3. The overlay crossfades from Tonight into the Room.
  4. The centre disc is hidden under the overlay, so its check-in → live animation (one ripple, the ring filling to a dot) plays when the overlay next closes.
  
  **The pour replaces today's 72-piece confetti.** That is the owner's choice, not the research's: one study kept the confetti, another wanted the moment small and on the button. Show the pour next to a small on-button version in the direction pass. Reduce Motion: a crossfade, keeping the haptic.
- **Refusal:**
  - One `H.error`, never after a success haptic.
  - The pass drains back (`M.settle`).
  - The refusal sheet uses the server's sentence. "Not quite there yet" offers **Open Maps**.
- **Location problems:** the trays for disabled / permission / timeout / weak GPS. **"Try Again" must resume the check-in.** Today it drops the fix.

#### Room (checked in)
- **Job:** who's here, who to meet next, and the room's chat.
- **Primary:** none on the room surface. **Like** inside the PersonCard is the repeating primary.
- **Content, in order:**
  1. glass top bar: close · **Check out** chip · room settings
  2. realtime banner
  3. RoomHero: LIVE dot · title · rolling headcount · face stack · "Priya walked in" · your face in the TimeRing
  4. visibility banner
  5. Meet next: 3 cards + the shared 15-minute countdown
  6. "Everyone here" grid
  7. Show more
  8. ChatDock (L2 glass, docked)
- **Draw these states:**
  - loading (**skeleton** of hero / Meet next / grid, not a spinner)
  - empty room ("Nobody else is here yet")
  - populated (6, 30, 100 people)
  - someone walks in (stack animation)
  - an incoming wave (toast + dock line)
  - hidden from roster
  - anonymous / named
  - realtime paused
  - offline
  - error, which must not block Tonight for someone who isn't checked in
- **Direction:**
  - Today this is the most static surface in the app. Make it the most alive *without moving when nothing happens*.
  - **Alive through change:**
    - a face entering the stack springs in;
    - the headcount rolls;
    - the Meet-next cards reshuffle together on the shared clock;
    - "walked in" lines tick into the dock.
  - **Calm otherwise:** no ambient motion on the grid.
  - Face grid cells are solid. Liked/matched marks are outline glyphs on a small solid badge. The "here" dot is green and still.
  - The visibility banner is solid (status, never translucent) and **includes the pseudonym**: "You're in this room as Cosmic Panda".
- **PersonCard** (an L3 sheet):
  - Face (112), name + age, the top reason, the reasons panel, interest chips.
  - Actions: **Like** (the gradient primary), 👋 Wave, Message (→ ConnectSheet, which says up front that it reveals you), ⋯ report/block.
  - Double-tap the face to like: HeartPop (an outlined heart, scaled, in brand orange) + **`H.like`** (none today).
- **ConnectSheet:** the disclosure above the field. **Clear the draft between people.** Today it carries over.
- **MatchMoment** (L4, **the one full-screen celebration**):
  - The two faces slide in to meet.
  - Three outlined hearts arc across.
  - The orbs flare once behind the stage.
  - "It's mutual", the reason line, the opener card.
  - **Say hi** (the gradient primary) and Keep looking.
  - `H.match` lands on the frame the last heart arrives.
  - ≤1.2s, tap to skip. Reduce Motion: placed + haptic.
- **Check out:**
  - A chip in the top bar (and in the Pulse peek) → a confirm sheet ("You'll leave the room…", Stay / Check out).
  - `H.destructive` on the Check out tap. On success the disc drains (live → idle) and the overlay closes; no second haptic.
- **Keep:**
  - Faces only where earned.
  - Likes are private until mutual.
  - One wave per pair per 10 minutes.
  - Message reveals you, and says so first.
  - Meet next is seeded per event.
  - Reason lines never invent facts ("Both at N nights before", never "Met at").
  - The LIVE dot is still.
  - Check out always confirms.
  - The visibility banner never auto-hides.
- **Fix while redesigning:**
  - An incoming wave fires two haptics; it should fire **one** `H.arrive`.
  - Double-tap like has no haptic.
  - The board's "Open the room" opens the overlay *under* the board.

#### Recap (the event ended)
- **Job:** close the night.
- **Primary:** **Rate who you met** / **Rate the night**.
- **Direction:**
  - Your face; "That's a wrap" in `moment` type; two solid stat tiles (time in the room, matches) in Geist Mono.
  - Orbs at rest.
  - **No confetti, by rule.**
- **Draw:** with matches, with no matches, with no photo of you, rate already done.
- **Keep:** Back never checks you out.

### `/board/[eventId]` · The Board (before doors)
- **Job:** "Going alone? Find someone to go with." Pseudonymous offers and requests.
- **Status:** today's screen is an explicit **placeholder** ("logic is final, layout is not"), so design it fresh.
- **Primary:** **Write a post**, and **Post** inside the composer.
- **Draw these states:**
  - loading
  - empty
  - populated (offers first)
  - composer: offer with spaces stepper / seeking
  - post refused
  - your post (N asked · Take down)
  - others' post: idle / asking / settled / refused / full
  - closed (doors open → **Open the room**, which must dismiss to the tabs first)
  - refused gate (age / not here / not on this board)
  - failed
- **Direction:**
  - Offers and seekings are **two shapes**:
    - an offer is a solid card with "2 spaces left" in `title` + Geist Mono;
    - seeking is words-first with no panel.
  - Pseudonym marks only.
  - The composer becomes an L3 sheet.
  - "Ask to join" is a strong neutral (white fill), not the gradient.
- **Haptics:** `H.success` when a post goes up. Ask: no press haptic and no confirm (by rule); `H.success` when the ask is recorded.
- **Keep:**
  - No confirm on Ask.
  - Declines are never shown.
  - Refusals use the server's words.
  - A 409 is a state.
  - Before doors only.

### `/(tabs)/going` · Going
- **Job:** the events that are yours.
- **Primary:** none when populated. The empty/error button is that state's primary.
- **Content, in order:**
  1. "Going"
  2. **Next up** hero
  3. your RSVPs by day
  4. Saved
  5. Past (Rate who you met)
- **Draw these states:**
  - loading
  - empty
  - all failed
  - partial failure (a toast)
  - next up: tonight / live now / tomorrow / cancelled / waitlisted
  - removed-save with Undo
- **Direction:**
  - The Next up hero becomes a ticket-like solid card: photo top, details bottom, date/time in Geist Mono.
  - Actions in a solid button group inside the card: Directions · Calendar · Share.
  - When Next up is **live now**, the hero gains the LivePill and an **Open Blend'n** action, the missing bridge to the core loop.
- **Haptics:** none on removing a save (the Undo toast is the feedback). No haptics while scrolling.
- **Keep:**
  - No Remove on an RSVP row.
  - The hero's actions are siblings of its button, so screen readers reach them.

---

## Flow 5 · The Banter and chat

Audit: [`audit/audit-social.md` §1 (Banter, room chat, room info, DM)](./audit/audit-social.md), `docs/CHAT.md`, `docs/BANTER.md`, `docs/api/client-chat-moderation-guide.md`. Where `CHAT.md` and the audit disagree, the audit is current. The doc has the wrong bubble corners, replies and receipts.

### `/(tabs)/chat` · The Banter (inbox)
- **Job:** the people and rooms I'm talking to.
- **Content:**
  1. glass header (title, search, mark all read)
  2. **Live now** (the room you're checked into)
  3. requests (board asks, message requests)
  4. matches and DMs
  5. past rooms
- **Draw these states:**
  - loading
  - empty
  - live room
  - no live room
  - requests present
  - unread / read
  - muted room
  - room locked/muted for you (a status chip, not drawn like a message)
  - search
  - failed
  - offline
- **Direction:**
  - **Live now becomes the hero row:** the event cover full-bleed with a scrim, a still LIVE dot, a rolling "N in the room", and the last line.
  - **Unify the three avatar systems** (photo, creature on gradient, square cover) into one family:
    - circles for people (photo or creature);
    - rounded squares for rooms (cover).
  - Requests are solid cards that read as "needs an answer", with 44pt Accept/Decline. Today the pills are 32pt.
  - One heading system.
  - Decide where the total chat unread lives (the audit notes the bell counts notifications, not chats).
- **Motion:**
  - An unread dot pops in/out (`M.pop`).
  - Rows enter once (18ms stagger).
  - Mark-all-read (DMs only; rooms can't be marked read) clears the dots with a short stagger; no haptic.

### `/chat/[id]` · Event room chat (anonymous)
- **Primary:** **Send**. It is the gradient disc in the composer.
- **Bubble system:**
  - Group consecutive messages from one sender: avatar on the last, name on the first, time per group.
  - Inbound names in `meta`/secondary, so the speaker doesn't compete with the speech.
  - Tails on the sender's side.
  - One time format, not device-locale.
- **Draw these states:**
  - loading
  - empty ("Start the room conversation" + Write a starter)
  - history failed
  - first-run guidelines notice
  - a long active feed with grouping
  - reply in progress
  - typing (1 person / many)
  - reactions
  - failed send
  - removed-by-moderation (own)
  - withheld at send (inline placeholder + toast, not a modal)
  - broadcasts: **announcement** (organiser identity) and **sponsored** (labelled, quieter, optional media)
  - scroll-to-newest with an unread count
  - **every composer state** in audit §0.7: normal, failed (shown on the bubble), muted, auto-muted with an expiry, locked by the organiser, room closed, rate-limited (timed), not checked in, banned/removed, left the room (Rejoin). There is deliberately **no "sending" state**: a sent message appears at once
  - the message action sheet and the report-reasons step
  - realtime paused
- **Direction:**
  - **A glass header** with the square cover, room name, and a live "N in the room".
  - **A truly floating glass composer.** The feed scrolls under it, with the reply preview attached to the composer's glass.
  - A restricted composer is a designed state: icon + reason + what to do + expiry. Not a grey line.
  - **Reactions:** a contextual reaction bar anchored to the long-pressed bubble (six emoji) instead of a generic sheet. Counts roll.
  - Broadcasts are full width, with no tail and no avatar. Announcements carry the organiser's mark. Sponsored is labelled and quieter, and may carry an image.
- **Motion:**
  - **Send:** the text lifts out of the composer and becomes the bubble (DESIGN-BRIEF §9.3 #12). Only *your* sends animate in; history never does.
  - Typing dots share the bubble shape.
- **Haptics:**
  - `H.send` on send (none today).
  - `H.longPress` on the bubble menu.
  - `H.threshold` at the swipe-to-reply trigger.
  - `H.reaction` on a reaction pick.
  - `H.error` on a failed send.
  - **No haptic for incoming messages while open.**

### `/chat-info/[id]` · Room info
- **Direction:**
  - The cover as a scrimmed hero with the title.
  - **Members as a "crowd" grid of creature marks** with role badges (Organiser, Moderator), not a settings list.
  - Mute shows as a still bell-slash chip near the title.
  - Leave room sits apart in a danger zone.
- **Haptics:** `H.select` on a mute option, `H.destructive` on Leave room.
- **Keep:**
  - Mute is yours alone and nobody is told.
  - Leave is undoable by checking in again, and the copy says so.
  - Members are drawn exactly as their bubbles.

### `/private-chat/[conversationId]` · Direct message
- **Primary:** Send.
- **Draw these states:**
  - pseudonymous both ways
  - one-way reveal (each direction)
  - both revealed
  - **reveal asked** (today the button never changes after asking)
  - accepted message request (named, no reveal bar)
  - match opener header ("You both said yes.")
  - empty
  - unread divider
  - receipts (sent / delivered / read)
  - **ended**: the composer is removed (today it remains); never say whether you were blocked
  - failed
  - typing
  - rate-limited
  - **image messages** (the API supports them and the client drops them)
- **Direction:**
  - **Make the reveal a moment.** Today it is a grey pill in a strip. Use a two-sided you/them visual of who can see whom.
  - "Show them who you are" is a strong-neutral (white) button, not the gradient (Send is this screen's primary), with the irreversibility copy *before* the tap.
  - When both have revealed, the names and photos resolve in with a single `M.settle` crossfade and `H.success` (DESIGN-BRIEF §9.3 #23).
  - Receipts sit under your last bubble, not above it.
  - The typing indicator aligns with the bubbles (today it's indented for an avatar DMs don't have).
  - The DM composer placeholder is its own ("Message {name}"), not the room's.
- **Keep:**
  - There is one reveal control.
  - There is no "declined" state.
  - "End conversation" for non-matches, "Unmatch" for matches.
  - Receipts are DM-only.
  - The match opener is a permanent header.

---

## Flow 6 · People and profile

Audit: [`audit/audit-social.md` §1 (friends, invite, user profile, Me, edit profile, blocked)](./audit/audit-social.md), `docs/PROFILE.md`. That doc still describes a removed "Preview" and is stale.

### `/(tabs)/profile` · Me
- **Job:** my profile as others see it, plus my nights.
- **Direction:**
  - **One merged profile page.** The owner removed the separate Preview.
  - Photo stack hero; name, age, work; intents; interests.
  - **Nights out** as a memory grid (MemoryTile).
  - Counts (nights, matches, crews) in Geist Mono with `RollingNumber` on first load only.
  - Settings is a glass icon button in the header.
- **Draw these states:**
  - full profile
  - no photo
  - partial profile (completion prompts)
  - nights-out loading / failed (+ retry, keeping the last good data)
  - first night not yet
- **Motion:** first-load entrance at `long` (520ms, seen once). Never on refocus.

### `/edit-profile` · Edit profile
- **Primary:** Save.
- **Direction:**
  - Sectioned solid cards.
  - The photo grid (PhotoManager) with drag-reorder on transforms.
  - States per tile: uploading, failed, **moderation-pulled** (the photo is gone, with a short explanation), blurred-photo variant.
  - Replace `assets/images/icon.png`: it is the Expo template placeholder, still used as a photo placeholder.
- **Haptics:** `H.drag` on pick-up, `H.select` on each reorder slot, `H.success` on save.

### `/user/[id]` · Someone else's profile
- **Direction:**
  - The same layout as Me, read-only.
  - The room's pseudonym and creature mark if they haven't revealed. Their photo if they have.
  - **Like** is the primary when you reached them from an event (it drops to a neutral "Liked" once sent). Connect / Requested / Message is the secondary. ⋯ report/block. Without an event there is no Like and no gradient on the screen.
- **Keep:** the server resolves name and photo; route params are only a first paint.

### Friends: `/friends`, `/friends/add`, `/friends/requests`, `/friends/[userId]`
- **Direction:**
  - Friends list, plain and warm. **No presence or recency**: no data is behind it.
  - Add **by invite link only**. There is no people search, by rule. The empty state sells the invite link.
  - Requests are solid cards with 44pt Accept/Decline. "Not now" and "Remove friend" are silent; the other person is never told.
  - The friend profile is its own identified screen, **deliberately not `/user/[id]`**: in rooms a friend is still a pseudonym unless they chose otherwise.
- **Haptics:** `H.success` on accept, `H.primary` on Send request.

### `/f/[token]` · Invite link landing (modal)
- **Direction:**
  - An L4 brand moment: orbs + the inviter's face and name + "{name} wants to blend with you".
  - Accept (the gradient primary) / Not now.
  - Draw: valid, expired, already friends, your own link, signed out.

### `/blocked-users`
- **Direction:** a plain solid list with Unblock (confirm). No decoration. Empty state: "No blocked users".

---

## Flow 7 · Settings and system

Audit: [`audit/audit-entry-system.md` (settings, about, support, components)](./audit/audit-entry-system.md).

### `/settings`
- **Direction:**
  - iOS-style grouped solid sections on L0.
  - Toggles use the platform switch with brand colours (DESIGN-BRIEF §12).
  - The "Show online status" toggle explains its consequence inline.
  - **Keep the test-pinned section order:** Blocked users under Safety, no "Discovery" section, Delete account last under its own spaced header. **Sign out asks first and is not red.**
  - No primary action on this screen, by design.
- **Draw:** the sign-out confirm, the delete-account flow, every toggle on and off.
- **Haptics:** `H.toggle` (custom toggles only; the native switch plays its own); `H.destructive` on destructive confirms.

### `/about` and `/support`
- **Direction:** short, quiet pages. About shows the lockup, the version in Geist Mono, legal links and the font credit ("Satoshi © Indian Type Foundry"). Support says what the email draft will include, then **Email support** (the gradient primary) opens the person's own mail app. Nothing leaves the app until they press send there.

### System pieces (every flow uses them)
- **Toast:**
  - A glass capsule at the top. Success/error/info differ by icon + tint + copy, never colour alone.
  - Undo action where the action allows it.
  - Motion: DESIGN-BRIEF §9.3 #19.
  - **Android:** a snackbar at the bottom, above the tab bar (DESIGN-BRIEF §13).
- **ActionTray / sheets:**
  - L3. Glass at partial height on iOS 26, solid at full height and on Android.
  - **Button order is fixed app-wide.** The primary is last (bottom) on iOS-style stacks and trailing in rows. Today callers reorder it.
- **RealtimeStatusBanner:**
  - Offline uses a destructive tint; live updates paused uses a warning tint. They must never look alike.
  - Solid L1, never glass.
  - It keeps the 3s grace before showing.
- **Empty and error states:**
  - One `EmptyState` component: an outlined icon in a solid well, title, one line, one action.
  - One `LoadError` with Try again.
- **Skeletons:** shaped like the content they replace, and static: no shimmer, no pulse (DESIGN-BRIEF §9.3 #17).
- **The one sheet** (`lib/sheet.ts`): every confirmation, report and block flow is a step of one sheet, never a stacked modal and never a system alert. Draw the report-reasons step and the block confirmation here, once, for every flow to reuse.
- **PresenceMonitor tray:** a non-dismissible "Still at the event?" → I'm still here / Check me out. An automatic checkout shows a calm notice with no haptic (it's unsolicited).

---

## Flow 8 · Consistency audit (the last pass)

Run this after the flows are drawn, before any hand-off:
1. Every screen has exactly one gradient primary or none, and the disc in the tab bar is the only other gradient.
2. No glass in L1 content, no glass on glass, no text directly on clear glass over a photo without the dim layer.
3. Every state in the "Draw these states" lists exists as a frame.
4. Type roles only from the scale; prices and times in the numeric role.
5. Icons are one outlined set, with no filled glyphs.
6. Every motion has a Reduce Motion frame; every haptic is from the vocabulary.
7. Every state at iPhone 402×874pt; the main state of each screen at Android 412×915dp; one 360dp-wide compact check per flow (as in PROMPTS.md).
8. Every frame that uses orbs still works with the orbs off.
9. Nothing on the DESIGN-BRIEF §18 avoid list, and every accessibility rule in §14 holds (contrast over the white test backdrop, gesture alternatives, focus states).
