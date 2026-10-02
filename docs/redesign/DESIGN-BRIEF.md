# Blend'n — the design brief

**For:** Claude Design, building the complete design system and redesigning every screen of the Blend'n client app (iOS and Android).
**From:** the owner, Matrix Social Labs. Written 2026-10-02 from the brand manual, a full audit of the app's code (`origin/dev` `54481d2`), and online research. Sources are in [`research/`](./research/).
**Companion files:**
- [`SCREENS.md`](./SCREENS.md): every screen and state.
- [`PROMPTS.md`](./PROMPTS.md): the order of work.
- [`audit/`](./audit/): what each screen does today, with `file:line`.
- [`research/`](./research/): the sources behind every number here.

---

## 0. Read this first

### 0.1 What this brief overrides

The app has a written design system, and parts of it **ban what this brief asks for**. This brief is the owner's deliberate reversal of those rules. Where it conflicts with the files below, **this brief wins**:

| Old rule | Where | Now |
|---|---|---|
| "Surfaces are flat: no shadows, no glows, no `BlurView` glass, no gradient fills" | `docs/DESIGN_SYSTEM.md` "Surfaces are flat" | Glass is allowed **on the control layer only** (§5). Gradients are allowed on the mark and the one primary action (§4). |
| "No glows, blooms or glass stacks." The owner rejected a frosted-glass CTA with an orange bloom and a pulsing halo on the room button as "very AI generated" | `tasks/lessons.md` | **Still half true, and the difference matters.** What was rejected: frosted panels used as content, a bloom behind a CTA, a perpetually pulsing halo. None of that comes back. What's new: Apple-style material on navigation and controls only, and **one** static glow in the whole app (§11, state c). |
| "A logo that changes colour depending on whether you are near an event is not a logo" | `docs/NAVIGATION.md` | Reversed for the centre button (§11). The **mark** stays the brand gradient, and what changes is the **disc** it sits on. |
| Accent `#FF906D`, "violet" `#F79EFF`, flat primary button with dark text | `lib/theme.ts` | Replaced by the brand manual's colours and gradient (§4). |
| Plus Jakarta Sans + Manrope | `lib/fonts.ts` | Satoshi (brand typeface) + Geist Mono (numbers) (§6). |
| "Ink on orange, never white", and the "honest state of the design system" section | `docs/PLACEHOLDER_SCREENS.md` | Stale. White labels go on `gradientFill` (§4.3); ink only on flat `brandOrange`. The rest of that file (rules per placeholder screen) still holds. |
| Filled glyphs for active tabs and "liked/saved" | `docs/DESIGN_SYSTEM.md` | **Outlined icons only**, as the brand manual requires (§8). |

**What does not change:** every product **behaviour** rule (§16): who sees whom, what one tap does, the order of precedence, privacy. This is a visual and interaction redesign. If a design seems to need a behaviour change, propose it; never assume it.

### 0.2 What to deliver

Deliver in the order of [`PROMPTS.md`](./PROMPTS.md):
1. The design system: foundations, motion, haptics, components, the centre button.
2. One direction pass on the core journey.
3. Every screen in every state, flow by flow.

Frames:
- **iPhone 402×874 pt** (9:41 status bar, home indicator).
- **Android 412×915 dp** (gesture-nav pill, edge-to-edge).
- A 360×800 dp compact check per flow.

Dark only. Prototypes use real timings.

### 0.3 You are expected to research

Where §17 says so, go online, look at current apps and guidance, and show what you found before you draw. Cite it. **If you can't browse the web, say so** and work from [`research/`](./research/) instead. Never invent a URL or a citation. This brief gives direction and hard constraints; it deliberately leaves the expressive layer to you.

---

## 1. The product in one page

**Blend'n** gets people out to events and helps them meet the people who are actually there. It is built for Bengaluru first, strictly **18+**, and runs on nightlife: gigs, bars, pop-ups, community nights.

**The loop:**
1. **Discover** on the home screen: a map with a pull-up drawer holding **the Pulse** (events: what's on tonight and soon in my city) and **Places** (venues, and how live they are).
2. **Commit**: save an event or say "I'm going". It lands in **Going**.
3. **Arrive**: at the venue, the app knows you're inside the event's GPS fence. The centre **Blend'n** button changes to invite you in.
4. **Check in**: hold the **VenuePass**. You're now in the event's **Room**.
5. **Meet**: the Room shows who's here (anonymous creature avatars until people choose to reveal) and "Meet next" suggestions, and you can like, wave or message. A mutual like is a **Match**.
6. **Talk**: **the Banter** holds your DMs and the event's anonymous group chat.
7. **After**: the Room closes into a **Recap**; you privately rate the night.

**Two modes.** The app has two modes and they are mutually exclusive: you are either *looking for* an event or *in* one. The centre tab button is the switch between them **and** the status light that says which one you're in. That is why it is the signature element (§11).

**Navigation:** `Pulse · Going · [Blend'n] · Banter · Me`. Blend'n is not a tab. It opens an overlay that grows out of the button.

**Vocabulary:**

| Term | Meaning |
|---|---|
| Pulse | Home feed |
| Scene | Event detail |
| Tonight | What's on now, in the Blend'n overlay |
| VenuePass | The hold-to-check-in panel |
| Room | The live event, its people |
| Board | Pre-event "going alone?" posts |
| Banter | Inbox |
| Me | Profile |

**Who uses it, and when.** This drives half the decisions below:
- **At night, in dim rooms, often one-handed, often on low battery and patchy network.** Dark-only is a product need, not a style.
- **About 93% of mobile traffic in India is Android** (StatCounter), much of it on mid-range phones (the test device is a Galaxy A34). Everything must look finished **without** blur, and glass is an enhancement. iPhone users get the full material.
- People are anonymous by default and reveal themselves deliberately. The design must make **who can see me** obvious at every moment.

---

## 2. The north star

**Feeling:** *a warm room, lit from behind.* Night-time, intimate, confident, unhurried. The light comes from the brand's two colours glowing softly behind the interface, the way the brand manual's cover does it, and from the event photos themselves.

**Not:** a rave, a neon club flyer, a dating app's pink, a corporate events tool, a SaaS dashboard, or a generic "AI-generated dark UI with a purple gradient".

**Spend the boldness in one place.** Most of the screen is calm: ink, photos, white type. The brand gradient appears in exactly **two** kinds of places:
1. the Blend'n **mark**;
2. the screen's **one primary action**.

Glow appears **once** in the whole app: the centre button when you can check in.

**The memorable detail: the disc that fills.** The centre button is an empty glass disc holding the gradient mark. When you arrive at a venue it **fills with the brand gradient**, like light pouring into it. When you're inside it is full and quiet. *How full the disc is = how close you are to being in a room.* That one idea is the brand's signature, and it should echo elsewhere:
- the hold-to-check-in pill **pours** full;
- the check-in moment **floods** the pass;
- the Recap **drains** it.

**"Alive" means responsive, not restless.** Things move when something happens: a person walks in, a count changes, you press, you send. Nothing loops for attention. Idle screens are still.

---

## 3. The brand foundation (from the brand manual)

The manual is 10 pages. What it fixes:

**Logo**
- A monoline monogram combining **B** and **N** (it reads as a house, as B&N, as layered depth, and as blended edges). It is stroked in the brand gradient.
- **Lockup:** monogram + "Blend'n" wordmark. The space between symbol and wordmark is set by the manual's construction square.
- Minimum lockup height **35 px**. Keep the exclusion zone clear.
- **Monogram tiles** (the manual's page 5), all allowed:
  - gradient on black
  - white on black
  - black on white
  - black on orange
  - black on violet
  - violet on black
  - orange on black
  - violet on white
  - orange on white
- **Vector:** [`assets/blendn-monogram.svg`](./assets/blendn-monogram.svg) (gradient) and [`assets/blendn-monogram-white.svg`](./assets/blendn-monogram-white.svg), extracted from the manual.
  - The app today only has PNGs, which is why its mark can only be tinted one flat colour.
  - The outline is a **filled path** (an expanded stroke), not a stroke, so a literal "draw-on" needs the path re-stroked. Masks, gradients and fills work on it as-is.
  - Its enclosed counters (the spaces inside the B and the arrow) can take a translucent fill; see §11.

**Colour** (the manual's page 6, corrected):

| Role | Value | Note |
|---|---|---|
| Primary orange | `#F05423` | CMYK 0/83/100/0 |
| Primary violet | `#925DA9` | **The manual prints `#925D46`, which is brown.** Red and green match, so the blue channel is a typo. `#925DA9` is confirmed by the logo's RGB export (gradient end `#945FA9`) and the CMYK 47/74/0/0. |
| Primary gradient | `#F05423 → #BE5C71 → #925DA9` | Diagonal, orange at top-left, violet at bottom-right, as on the logo |
| Secondary | `#FFFFFF`, `#0D0C0C` (ink), `#BE5C71` (rose, the gradient's midpoint) | |

**Type:** Satoshi (the manual shows Medium) for presentation and digital.

**Icons:** "The icon must always be used in its outlined form, consistent with the logo style and never as a filled version." The manual's icon sheet is a rounded, even-stroke outline set.

**Mood art:** near-black canvas with large, very soft orbs of orange (top-left), magenta-violet (top-right) and a faint violet below. Use this as the backdrop language (§4.4).

**Company:** the brand is "Matrix Social Labs" and the legal entity is "Matryx Social Labs Private Limited". They are one company. Only About and legal pages ever show either name.

---

## 4. Colour

Dark only. Every pair below was checked against WCAG 2.x.

### 4.1 Neutrals (warm, never blue-black)

| Token | Value | Use |
|---|---|---|
| `ink` | `#0D0C0C` | Page. The brand near-black. |
| `surfaceSunken` | `#1A1818` | Wells, tracks, unselected chips |
| `surface` | `#242121` | Cards, inputs, rows |
| `surfaceRaised` | `#2E2A2A` | A card on a card, menus on Android |
| `textPrimary` | `#FFFFFF` | |
| `textSecondary` | `#B3AEAD` | Details. ≥6.4:1 on every surface |
| `textTertiary` | `#9A9594` | Helper text. ≥4.8:1 on every surface |
| `textPlaceholder` | `#8F949D` | Cool on purpose, so an empty field never reads as filled. ≥4.6:1 |
| `hairline` | `rgba(255,255,255,0.10)` | Dividers, outlines on glass |
| `hairlineStrong` | `rgba(255,255,255,0.16)` | Hairlines on photos; the centre disc's edge |
| `inputBorder` | `rgba(255,255,255,0.38)` | 1pt outline on every text field (3.5:1 on `ink`; a `surface` field alone is only 1.22:1 against the page) |
| `focusRing` | `#FFFFFF` | 2pt ring, 2pt offset: the `focused` state of every interactive component (keyboard, Switch Control, Voice Control) |
| `scrim` | `rgba(13,12,12,0.60)` | Pills on photos |
| `backdrop` | `rgba(0,0,0,0.60)` | Behind sheets and modals |

These are starting values. You may tune them, but every text token must stay **≥4.5:1 on `ink`, `surfaceSunken` and `surface`**. The app has a test that enforces this.

### 4.2 Brand

| Token | Value | Use | Contrast on `ink` |
|---|---|---|---|
| `brandOrange` | `#F05423` | Orange as a colour: text accents, the gradient start | 5.58:1 |
| `brandRose` | `#BE5C71` | Gradient midpoint. **Never text** (3.77:1 on `surface`) | 4.61:1 |
| `brandViolet` | `#925DA9` | Gradient end, graphics only | 4.06:1 (graphics only) |
| `brandVioletText` | `#A47BBF` | Violet when it must be text | 5.73:1 |

- **Brand colours as text:** only `brandOrange` and `brandVioletText`, and only on `ink`, `surfaceSunken` or `surface`. Never on `surfaceRaised`, orbs, photos or the cover tint. `brandRose` is never text.
- **Lead with orange, not violet.** Violet-dominant reads as "generic AI purple", and as District (Zomato), the Indian category leader. Violet is the far end of the gradient, not a theme colour.

### 4.3 The two gradients

| Token | Stops | Angle | Use |
|---|---|---|---|
| `gradientBrand` | `#F05423 → #BE5C71 → #925DA9` | 135° (top-left → bottom-right) | The mark, large graphics, the orbs' palette, the centre disc's fill |
| `gradientFill` | `#D83F0F → #BB556B → #925DA9` | 135° | **Any surface with white text on it**: primary buttons, the hold pill's fill, the Send disc |

- **Why two:** white on `#F05423` is only **3.50:1**, which fails AA for a 16pt button label. `gradientFill` deepens the orange end just enough for **white text ≥4.5:1 at every point**:

  | Point on `gradientFill` | White text |
  |---|---|
  | Orange end | 4.53:1 |
  | Rose | 4.54:1 |
  | Violet end | 4.82:1 |

- Dark text fails at the violet end (`ink` on `#925DA9` is 4.06:1), so **primary labels are white on `gradientFill`**.
- The old system's "dark text on orange" rule (`onGradient #5B1600`) is retired, and the test that pins it must be rewritten (§19).

### 4.4 Backdrop: orbs and grain (L0)

- Two or three huge, fully feathered radial orbs, each 280–360pt across:
  - orange `#F05423` at **30–40%**
  - violet `#925DA9` at **25–30%**
  - optionally rose `#BE5C71` at ~20%
- **Placement:**
  - **At most two orbs visible, covering at most a third of the frame.**
  - On brand moments, one may sit in the bottom third so the glass tab bar has colour to bend. On feeds they stay at the top.
  - **Never place an orb directly behind the centre disc or a primary button.** That is the bloom that was rejected.
  - **Every frame that uses orbs must still work with them switched off.** Draw both.
- **Grain:** one static 256px noise tile at 3–6% over the orbs only. It kills gradient banding on OLED near-black.
- **Render as an image or SVG**, not stacked live gradients. Stacked gradients have a known glass bug (`'clear'` glass over `expo-linear-gradient` renders white) and cost GPU.
- **Motion:** drift very slowly (§9.3 #22), **on iOS only**. Static on Android, and frozen under Reduce Motion, Low Power Mode or Battery Saver, and the in-app "Ambient motion" setting (§14).
- **Where the orbs live:**
  - **Brand moments only, at full strength:** landing, onboarding, the Blend'n overlay, the Match, the Recap, the invite landing.
  - **Feeds** (Pulse, Going, Banter): faint, around 50% of those values, and only at the top, behind the header.
  - **Not behind lists or text-heavy cards.** The exceptions are photo-led brand surfaces: the Tonight deck and the onboarding body.
  - **Text never sits directly on an orb-lit area**, except `textPrimary` at `title` size or larger.
- **Under Increase Contrast:** halve the orb alpha.

### 4.5 Photo-derived tint (the Scene)

- The event page's top ~40% takes a gradient of the cover's dominant hue into `ink`.
- Clamp it so the tint's luminance behind any text is **≤0.05**. That keeps `textSecondary` legible, not just white. No brand-coloured text on the tint.
- Text on photos is `textPrimary` only, over a scrim of at least 60%.
- If the cover is grey or monochrome, use the brand orb instead.
- **Never tint the tab bar, the centre disc or any primary button.** Those stay brand-constant.
- *Implementation note:* compute the hue server-side at upload and store it, rather than extracting it on the phone.

### 4.6 Status

| Token | Value | Use |
|---|---|---|
| `live` | `#30D158` | Live and presence dots, "you're in". 9.66:1 on ink. Always **still** |
| `warning` | `#FFBC5C` | Caution: filling up, connection paused, a timed lock |
| `destructive` | `#FF5A4F` | Error text and destructive text actions (≥4.6:1 on every surface) |
| `destructiveFill` | `#D92D20` | A filled destructive button with white text (4.83:1) |

- A status tint is the token at 16% alpha, e.g. `rgba(255,188,92,0.16)`.
- **Offline, paused and info banners must never look alike:** destructive tint, warning tint and neutral `surface` (banners are always solid). Each also has **its own icon and a lead word** ("Offline.", "Updates paused.") so they differ in greyscale.

### 4.7 The one-primary rule (kept, sharpened)

At most **one** thing per screen wears `gradientFill`: that screen's primary action. Repeats of the same action count as one (the Like on every person card). A sheet or modal is its own screen. **The complete list of exceptions:** the tab bar's centre disc (and its state-(b) ring), and the onboarding progress bar. Nothing else.

Everything that used to reach for orange gets one neutral answer:

| Element | Treatment |
|---|---|
| Selected chip, segment, option | `textPrimary` (white) fill, `ink` text |
| Unread dot, count badge | White fill, ink digits (19.5:1). **Never red**: white on red is 3.41:1 |
| Live / presence | `live` green dot, still |
| Saved / liked | Polarity flip: the outlined glyph moves into a solid white badge, drawn in ink (§8) |
| Text action ("See all", "Clear") | `label` role in `textPrimary` |
| Spinner, pull-to-refresh | `textSecondary`, or the branded refresh (§9) |
| Switch on | White track, ink thumb (off: `#959090` track, white thumb) |
| Progress fill | `gradientBrand` in onboarding; `textPrimary` elsewhere |

---

## 5. Materials: the glass system

### 5.1 Five layers

| Layer | What | Material |
|---|---|---|
| **L0 · Backdrop** | Page colour, orbs, grain, cover tint | `ink` + art |
| **L1 · Content** | Cards, lists, rows, photos, faces, bubbles, banners | **Solid.** `surface` / `surfaceSunken`. Never glass |
| **L2 · Chrome** | Tab bar, top bars, floating circle buttons, the chat composer, CTA docks, toasts, the VenuePass, ChatDock | **Glass** (iOS 26+), blur fallback (older iOS), solid fallback (Android, Reduce Transparency) |
| **L3 · Sheets** | PersonCard, ConnectSheet, trays, quick views, menus | Glass at partial height (iOS 26+), **opaque at full height** and on Android |
| **L4 · Moments** | Match, check-in success, invite landing, onboarding "ready" | Full-bleed L0 art at full strength + type. Short, skippable |

### 5.2 Rules for glass

These come from Apple's Liquid Glass guidance and the production bugs in the research:
1. **Glass is for controls and navigation, never content.** No glass cards, glass list rows or glass chips inside a scroll.
2. **No glass on glass.** Anything sitting on glass (the centre disc, a button in the composer, the input field inside the composer) is a **fill**, not more glass.
3. **"Regular" glass by default.** **"Clear"** glass only for controls over a single hero photo, and then always with a black dimming gradient under it of **at least 45%**. Apple suggests 35%, but over a white poster that leaves white icons at 2.3:1.
4. **Monochrome on glass.** Tab labels, icons and text on glass are white/grey, never brand-coloured. Colour on glass means "the one primary".
5. **Design for the clearest setting.** iOS 27 lets people slide glass from ultra-clear to fully tinted, so every glyph on glass must pass at the clear end: **4.5:1 for text, 3:1 for icons**.
   - Test every glass surface over `#FFFFFF` and `#808080` backdrops, and over the brightest poster supplied.
   - Passing takes at least **60% ink** under text (tab labels, toasts, the composer) and **45% ink** under icon-only controls and the status-bar band. Where the system's own glass doesn't reach that, tint it with `ink` at that alpha.
   - Labels on glass use opaque tokens (`textPrimary`, `textSecondary`), never white at partial alpha.
6. **Never fade glass by opacity**, nor anything containing glass, including the 0.85 "pressed" dim. Glass appears and disappears by switching its effect on or off, and presses are shown with **scale**, not opacity.
7. **Budget:**
   - one glass group for the bottom chrome (the tab bar plus any CTA dock directly above it, sharing one sampling region);
   - at most ~4 standalone glass controls per screen;
   - zero glass inside scroll content.
8. **Hand-rolled "glassmorphism" is banned:** blur + gradient + glow + coloured border stacks. That is the look that was rejected. Hierarchy comes from layout and the layers above, not decoration.

### 5.3 The surface map

| Surface | iOS 26/27 | iOS 16.4–25 | Reduce Transparency | Android 12+ | Android < 12 |
|---|---|---|---|---|---|
| **Tab bar**: a 64pt capsule, radius 32, inset 16 from the sides | Glass, regular, dark, tinted with `ink` as needed to keep labels ≥4.5:1 over a white backdrop (§5.2 rule 5) | `systemChromeMaterialDark` blur + 0.5pt hairline | Solid `surfaceSunken` + hairline | Tier B surface (§13) + hairline; blur only after a frame test on a Galaxy A34 | Solid |
| **Floating circle buttons**, 44pt (48dp on Android): back, close, share, filter | Glass, regular | Thin-material blur | Solid `surface` | Solid `surface` + hairline | Same |
| **Controls over a hero photo** | **Clear** glass + ≥45% dim gradient | Ultra-thin blur + dim | Solid `surface` | `scrim` circle | Same |
| **Info pills on photos in cards** (date, price, "12 going") | **Not glass.** `scrim` capsule + `hairlineStrong` | Same | Scrim at 85% | Same | Same |
| **Top of tab screens** | No glass slab at rest. Title in content; glass appears on scroll (scroll-edge) | Same, blur | Solid on scroll | Solid on scroll | Same |
| **Detail screen headers** | Native glass header, transparent at rest | Blur header | System | Solid | Same |
| **Quick-view sheets** (PersonCard, event peek) | Native sheet, glass at partial detent | Opaque `surface`, radius 24 | System | Opaque `surface`, radius 24 | Same |
| **Task sheets** (report, edit, filters) | Opaque at full height | Opaque | Opaque | Opaque | Opaque |
| **Primary button** | **Solid `gradientFill`** capsule. Never glass, never tinted glass | Same | Same | Same | Same |
| **Chat composer** | Glass capsule. Input inside is a fill (`rgba(255,255,255,0.08)`); Send is a `gradientFill` disc | Blur | Solid `surfaceSunken` | Solid + hairline | Solid |
| **Toasts** | Glass capsule, top | Blur | Solid | Solid | Solid |
| **Cards, lists, profile, Board posts, banners** | **Solid**, always | Same | Same | Same | Same |

### 5.4 One `Material` component

Every glass surface in the design system is one component with a `role` (`bar` · `control` · `mediaControl` · `sheet` · `toast`). It resolves to glass, blur or solid by platform, OS version and accessibility setting. Draw each role's three tiers side by side in the design system so the fallbacks are designed, not accidental.

### 5.5 Depth without drop shadows

- Content has **no drop shadows**. Depth comes from the layer order, surface steps, and glass edges: a 0.5pt hairline plus a faint top specular line at `rgba(255,255,255,0.18)`.
- The single exception is the centre disc's state-(c) glow (§11).

---

## 6. Typography

**Families:** Satoshi (brand) + Geist Mono (numbers and eyebrows). No third family.

**Why Geist Mono:** Satoshi has **no ₹** and no no-break space, and its digits are proportional by default. Prices, times, dates, counts and codes go in Geist Mono, which has ₹ and fixed-width digits and reads like a ticket stub or a door list. That suits nightlife.

**Licence (affects implementation, not design):**
- Satoshi (ITF Free Font License v2.0) may be embedded in the app.
- It may **not** be committed to the public repo or served publicly through a design tool.
- Keep Satoshi artifacts org-internal. Geist Mono is OFL and free to use anywhere.

**Weights in use:** Regular 400, Medium 500 (the brand manual's weight), Bold 700, Black 900. **No Light below 20pt.** Satoshi has no 600; anything that was SemiBold becomes Medium or Bold.

| Role | Family (weight) | Size / line (pt) | Tracking | Max scale | Use |
|---|---|---|---|---|---|
| `moment` | Satoshi Black | 44 / 48 | −1.3 | 1.3 | At most once per screen: "You're in.", "That's a wrap", "It's mutual" |
| `display` | Satoshi Bold | 34 / 40 | −0.7 | 2.0 | One per screen: the screen title |
| `title` | Satoshi Bold | 24 / 30 | −0.4 | 2.0 | Card and sheet titles, event name |
| `heading` | Satoshi Bold | 20 / 26 | −0.2 | 2.0 | Section headings |
| `button` | Satoshi Bold | 16 / 20 | 0 | 2.0 | Button labels |
| `body` | Satoshi Regular | **17** / 24 | 0 | 2.0 | Reading text, inputs, messages |
| `bodyStrong` | Satoshi Medium | 17 / 24 | 0 | 2.0 | Names, row titles, chip labels |
| `meta` | Satoshi Regular | **14** / 20 | 0 | 2.0 | Venue, helper text, timestamps |
| `caption` | Satoshi Medium | **12** / 16 | +0.1 | 1.3 | Tab labels and badges only, with the iOS large-content viewer. **Floor: 12** |
| `label` | Geist Mono Medium | 12 / 16 | +0.6, UPPER | 2.0 | Eyebrows, tags, field labels. Sparingly |
| `numeric` | Geist Mono Medium | max(role size − 1, 12) | 0 | per role | Every price (₹), time, date, count, code |
| `numericDisplay` | Geist Mono Bold | 40 / 44 | −1.0 | 1.5 | Countdown, headcount hero, ticket price |

Rules:
- **Text reaches 200% (WCAG 1.4.4).** Controls grow taller with their text (minimum heights, wrapping) instead of capping it. Test the tab bar, the VenuePass and the composer at 200% on a 360dp screen.
- **Body is 17, not 16, and nothing is below 12.** Satoshi's x-height (0.484 em) is about 10% smaller than today's Manrope, so equal point sizes read smaller.
- **Sentence case everywhere.** Uppercase only in the `label` role, and not as a habit: "badge above headline" stacks of all-caps micro-labels read as templated.
- **Don't design with Satoshi's stylistic sets** (single-storey a/g). React Native can't reach them, even though a web prototype can.
- Every `numeric` text uses tabular figures.
- "Blend'n" always uses the typographic apostrophe `’` (U+2019).
- **Bold Text accessibility setting:** body steps to Medium and bodyStrong to Bold.
- **Check three screens at the largest accessibility text size:** the Pulse, the Scene and room chat.

---

## 7. Space, radius, size

**Spacing.** Keep the current scale; it works.

| Token | pt |
|---|---|
| `xxs` | 2 |
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 24 |
| `xxl` | 32 |
| `xxxl` | 48 |

- **Screen gutter 24.**
- Between sections 32. Heading → content 16. List items 12–16.

**Radius: concentric.** Use `outer − padding = inner`, and continuous ("squircle") corners everywhere.

| Element | Size | Radius |
|---|---|---|
| Tab bar | 64h capsule | 32 |
| Disc / tab selection capsule (inset 4) | 56 | 28 |
| Primary button | 56h capsule | 28 |
| Glass circle buttons | 44 (48dp Android) | 22 (24) |
| Chips, scrim pills | 32–48h | capsule |
| Content card | — | **32** |
| Media inside a card (8 padding) | — | 24 |
| Rows inside a card (16 padding) | — | 16 |
| Thumbnails in a row | — | 8 |
| Sheets (fallback / Android) | — | 24 (iOS 26+: system, don't override) |

**Controls.**

| Height (pt) | For |
|---|---|
| 56 | Primary actions, inputs |
| 48 | Search, chips, pill buttons, icon buttons |
| 32 | Tags |
| 18 | Badges |

- **Things in one row share one height.**
- **Touch targets** are at least **44×44pt** on iOS and **48×48dp** on Android. Visible size may be smaller if the hit area isn't.

**Icon sizes:** 16 inline with text · 20 inside controls and rows · 24 navigation and top-bar actions.

---

## 8. Iconography

- **One outlined icon set across the whole app.** Pick one with a rounded, even stroke close to the logo's monoline, available as React Native SVG components.
  - Candidates: Lucide, Phosphor (Regular/Light), Tabler.
  - Show the three against the logo and the brand manual's icon sheet, then pick one. Justify it.
  - Stroke: 1.5pt at 24, scaled proportionally.
- **No filled glyphs, ever.** Today 36 of the app's 86 Ionicons glyphs aren't outline variants (23 of them genuinely filled), plus Material amenity icons sent by the server.
- **Map the amenity names from the server** to the chosen set. List the mapping in the design system.
- **State without fill.** A selected or active state changes:
  1. the **container**: selection capsule, white chip fill, a solid badge behind the glyph;
  2. the **stroke weight**: 1.5 → 2.25 (a supporting cue only; too subtle on its own at 16–20pt);
  3. the **colour**.

  Never the glyph's fill. Each state must be legible in greyscale, so colour is never the only change.
  - **Liked / saved:** a polarity flip, like a selected chip. Unliked is the bare white outline heart; liked is the same outline heart in `ink` inside a solid white badge, with the word "Liked" wherever there's room. The accessibility label stays "Like" and the state is exposed as selected.
  - **Active tab:** the selection capsule (at least 22% white), heavier stroke, white label. Unselected labels are `textSecondary`.
- Provider marks (the Google "G", the Apple logo) are exempt; they are the providers' own.
- **The creature avatars** (pseudonym marks: an animal on a two-colour disc) are illustrations, not icons. Unify their disc treatment so a pseudonymous person and a named person read as the same family (circle, same ring). Avoid emoji-as-UI anywhere else.

---

## 9. Motion

Source: [`research/research-haptics-motion.md`](./research/research-haptics-motion.md) §3–4, which also has the spring maths.

### 9.1 Principles

1. **Responsive:** a press shows within 100ms, on press-in.
2. **Continuous:** things come from somewhere and go somewhere. The disc becomes the room; a card becomes the event; a sent message leaves the composer.
3. **Interruptible:** every gesture-driven motion can be grabbed mid-flight; releases carry the finger's velocity.
4. **Calm at rest. Two hard rules:**
   - **only the orbs move while idle** (plus the typing dots while someone types);
   - **effects never bounce**: opacity, colour, blur and glass changes never overshoot.
5. **Every motion has a still-frame end state and a Reduce Motion version.**
6. **Spend celebrations once:** check-in and the match. Everything else is quiet.

### 9.2 Tokens

**Springs.** Seven, one family for both platforms. They are expressed as Apple's duration/bounce and as M3-style physics with mass 1, so they read Apple-like on iOS and M3-Expressive on Android.

| Token | Feel (Apple duration, bounce) | Physics `{mass, stiffness, damping}` | Overshoot | Use |
|---|---|---|---|---|
| `M.press` | 0.16s, 0 | `{1, 1542, 78.5}` | 0 | Press scale in/out, tiny nudges |
| `M.snap` | 0.30s, 0.12 | `{1, 439, 36.9}` | 0.3% | Chips, toggles, tab/segment indicator, badges, small moves |
| `M.settle` | 0.42s, 0 | `{1, 224, 29.9}` | 0 | **Default spatial**: reflow, inserts, programmatic sheet moves, drains |
| `M.travel` | 0.50s, 0 | `{1, 158, 25.1}` | 0 | Large surfaces: disc → stage, card → detail, full sheets |
| `M.fling` | 0.40s, 0.20 | `{1, 247, 25.1}` | 1.5% | Any release after a gesture, carrying its velocity |
| `M.pop` | 0.45s, 0.30 | `{1, 195, 19.5}` | 4.6% | Playful confirmations: like, reaction landing, faces meeting |
| `M.celebrate` | 0.60s, 0.35 | `{1, 110, 13.6}` | 6.8% | Once-per-session peaks: the match headline, the check-in pour |

**Durations** (ms), for timing-based effects:

| Token | ms | Use |
|---|---|---|
| `instant` | 0 | Reduce Motion endpoints |
| `press` | 100 | |
| `quick` | 160 | Exits, small fades |
| `base` | 220 | Default effect, crossfades |
| `medium` | 320 | Shake |
| `long` | 520 | First-load entrances seen once |
| `moment` | 1000 | The total budget for a choreographed peak |
| `ambient` | 28000 / 36000 | The two orb drift periods (incommensurate, so the pattern never visibly repeats) |

**Easings:**

| Token | Curve | Use |
|---|---|---|
| `standard` | (0.2, 0, 0, 1) | On-screen moves |
| `entrance` | (0.16, 1, 0.3, 1) | Enters |
| `exit` | (0.4, 0, 1, 1) | Exits |
| `gentle` | (0.33, 1, 0.68, 1) | Soft fades |
| `snapOut` | (0.23, 1, 0.32, 1) | Press release, pop-ins, throws |
| `sheet` | (0.32, 0.72, 0, 1) | Timed sheet rise/fall |
| `linear` | — | Progress only (the hold fill) |

**Staggers:** 18 / 28 / 40ms. The whole window is ≤200ms; items after the 8th enter together. Never stagger on pagination or during scroll.

**Press:**
- Scale 0.97 on `M.press` for buttons and cards, and 0.90 for the centre disc. Never an opacity dim on anything containing glass.
- Android adds ripple and the pressed-shape change (§13).

### 9.3 Choreography (draw each as a storyboard with timings, plus its Reduce Motion version)

| # | Transition | Sequence | Reduce Motion |
|---|---|---|---|
| 1 | **App open → Pulse** | Orbs already at rest (no entrance). Tab bar present. Cached content or a skeleton at t0. The first 6 cards fade + rise 8pt (`base`/`entrance`, 28ms stagger). The current 2.4s intro should play **only on first launch / signed out** (§20). | Fade only |
| 2 | **Tab switch** | The selection capsule slides on `M.snap`. The selected icon's stroke weight steps at t0. Content crossfades over `quick`, opacity only (tabs are peers, nothing translates). Scroll positions persist. | Capsule jumps; crossfade stays |
| 3 | **Push / pop** | The native platform transition (iOS slide, Android default), interruptible. The destination's main block is there at t0; secondary blocks fade in at +60ms. | System cross-fade |
| 4 | **Event card → Scene** | iOS 18+: the card image **zooms** into the hero (Expo Router zoom transition; alpha, so behind a flag). Elsewhere: the card presses 0.97, then a native push; the hero shows the same cached image (no blank flash) and the title/meta rise 8pt. | Default push |
| 5 | **Sheet** | Rises from its own height on `M.travel`; the scrim fades over `base`. Drag tracks 1:1 with rubber-band above the top detent. Release snaps to the nearest detent on `M.fling` with velocity. Dismiss past 30% or 800pt/s. The material gets more opaque as it nears full height (iOS 26 behaviour). | 200ms fade; drag still tracks |
| 6 | **Modal** | Scrim fades `base`; content rises 24pt on `M.settle`; exit is a `quick` fade + 8pt drop | Fade |
| 7 | **Blend'n open / close** | The disc's circle grows to cover the screen (420ms, `standard`), its fill going `gradientBrand` → L0 (ink + orbs). The page fades in from 45% progress and rises 24pt. Close reverses it into the disc (~300ms). Drag down closes past 140pt or 900pt/s. | 200ms fade from page colour |
| 8 | **Hold to check in** | The fill translates in, **linear 900ms** (its speed is the information). The label changes colour exactly at the fill edge. Ticks at 25/50/75%, commit at 100%. The pill shows busy until the server answers. | Fill kept (it's progress) |
| 9 | **Check-in success** (the pour: the owner's choice over today's 72-piece confetti) | On server OK: `H.success`. The pass's gradient floods upward through the panel (a fill is an effect, so `M.settle`, no bounce). The orbs lift once (~600ms, effects only). At ~700ms the overlay crossfades Tonight → Room; the Room hero enters on `M.travel` and its sections stagger at 28ms. The centre disc is under the overlay, so its c → d transition (§11.4) plays when the overlay next closes. | 200ms crossfades; haptic kept |
| 10 | **Check-in refused** | `H.error`. The pass drains on `M.settle`, not a bounce. Then the refusal sheet. | Crossfade |
| 11 | **Match** (≤1.2s, skippable) | Scrim `base`; orbs behind the stage lift once. Faces slide from ±120pt on `M.pop` and meet ~450ms. Three outlined hearts arc from your face to theirs at 260/350/440ms (560ms each). At ~1000ms their face bumps to 1.08 and `H.match` lands **on that frame**. Text at +420ms; **Say hi** at ~1100ms, tappable once visible. A tap anywhere skips to the end. Everything is in the accessibility tree from t0. | Faces placed, no hearts, haptic immediately, 200ms text fade |
| 12 | **Message send** | The composer clears; `H.send`. The new bubble starts at the composer field's position and travels to its slot over 300ms on **split axes** (vertical `(0.2,0.01,0.28,0.91)`, horizontal `snapOut`), so it arcs slightly (Telegram's recipe). Its fill crossfades from field colour to bubble colour. The list shifts on `M.settle`. | Bubble fades in place |
| 13 | **Message arrives** | At bottom: rises 12pt + fades (`base`). Scrolled up: no list motion; a glass "New messages ↓" pill pops in (`M.snap`). Bursts coalesce. No haptic. | Opacity only |
| 14 | **Typing** | Three dots, opacity 0.35↔1 and Y 0↔−2, 1200ms cycle, 160ms phase offset. Runs only while someone types. | Static "typing…" |
| 15 | **Like** | HeartPop at the touch point: scale 0.4→1 on `M.pop`, hold 260ms, fade `quick`. A Like button: stroke weight + colour swap at t0 + `M.pop` 0.85→1. Already liked: nothing. | Fade 180 / hold 300 / fade 180 |
| 16 | **List enter** | First load only: fade + 8pt rise (`base`/`entrance`), 28ms stagger, ≤8 items. Pagination/scroll inserts: no entrance. Removal: `quick` fade, then reflow on `M.settle` | Opacity only |
| 17 | **Skeleton → content** | No skeleton for waits under ~300ms. Skeletons match the final geometry and are **static**: nothing loops. Crossfade to content over `base` | Same |
| 18 | **Pull to refresh** | Branded: the monogram's outline traces as you pull (0.5× resistance); `H.threshold` when armed; holds while loading; returns on `M.settle` | Unchanged (direct manipulation) |
| 19 | **Toast** | Enters translateY −16→0 + fade on `M.snap`; dwells at least 5s (+1s per 8 words; 10s or more with Undo or a screen reader on; paused while touched); exits `quick` + 8pt drift; swipe to dismiss on `M.fling`. A toast is never the only copy of an action. (Android: snackbar from the bottom) | Fade |
| 20 | **Error shake** | translateX 0, −8, 8, −6, 6, −3, 0 over 320ms. The error text/border appear at t0; `H.error` at t0 | No shake |
| 21 | **Centre button states** | §11.4 | §11.4 |
| 22 | **Orbs** | Two pre-rendered blobs; transform only (±24pt, scale 0.96–1.04), periods 28s and 36s, ease-in-out alternate. **Paused** when unfocused or backgrounded, in Low Power Mode, under Reduce Motion, with the keyboard open, in chat/DM screens, and during active scroll on glass-heavy screens. They react only at the peaks: check-in (9), the match (11) and onboarding's Ready moment. Static on Android | Static |
| 23 | **Reveal in a DM** (both revealed) | The name and photo resolve in with an `M.settle` crossfade, the avatar's creature mark dissolving into the photo; `H.success` | Crossfade |
| 24 | **Morphing loader, rolling numbers** | The loader morphs monogram outline ↔ circle while waiting (under 5s). Numbers roll only the digits that changed, on `M.snap` | Loader: a static monogram plus a text label. Numbers change instantly |

---

## 10. Haptics

Source: [`research/research-haptics-motion.md`](./research/research-haptics-motion.md) §1–2, [`research/research-android-m3e.md`](./research/research-android-m3e.md) §3.

You can't play haptics in a prototype. **Annotate** them: every interactive element in a frame names its haptic token, or "none".

### 10.1 Rules

1. **One event, one haptic.** At most one outcome haptic per action.
2. **Nothing unsolicited.** No haptics for presence, counts, arrivals, state changes or incoming messages. The one exception is a social signal aimed at *you* while you're in the Room (a wave, a like back).
3. **Outcome after truth.** Success and error fire when the server answers, not when the finger lifts.
4. **On the frame.** Press cues fire on press-in, threshold cues on the threshold frame (once per crossing), landing cues on the landing frame.
5. **Most taps are silent.** Only the screen's one primary action, the centre disc and the actions below have a haptic. Secondary buttons, tabs, rows and cards have **none**.
6. **Reduce Motion never turns haptics off.** They often replace the motion. The app's own "Haptics" setting does.
7. **Android uses system haptic constants only.** Never the raw 40–60ms vibrations: on cheap motors they play at full strength and buzz. "No haptic beats a buzzy one" (Google).
8. **Never the only cue.** Every haptic goes with a visible change, because people turn haptics off.

### 10.2 The vocabulary

| Token | iOS | Android (min API → fallback) | When |
|---|---|---|---|
| `H.primary` | impact Light | `VIRTUAL_KEY` (5) | Press-in on the screen's one gradient primary. Skip it when the action's own outcome haptic follows within ~1s (the Scene CTA) |
| `H.disc` | impact Medium | `VIRTUAL_KEY` (5) | Press-in on the centre Blend'n disc |
| `H.select` | selection | `SEGMENT_TICK` (34) → `CLOCK_TICK` (21) | A chip, segment or option changes value (not on re-tap); picker detents |
| `H.toggle` | impact Light (custom toggles only; the native switch plays its own) | `TOGGLE_ON` / `TOGGLE_OFF` (34) → `CLOCK_TICK` | A switch changes |
| `H.threshold` | impact Light; **Medium for swipe-to-reply** | `GESTURE_THRESHOLD_ACTIVATE` (34) → `SEGMENT_TICK` → `CLOCK_TICK` | Pull-to-refresh armed, swipe-to-reply armed, deck card past its threshold. Once per crossing |
| `H.longPress` | impact Medium | `LONG_PRESS` (3) | A context menu or peek opens |
| `H.drag` | impact Medium | `DRAG_START` (34) → `LONG_PRESS` | Picking up a photo to reorder |
| `H.like` | impact Soft | `TOGGLE_ON` (34) → `VIRTUAL_KEY` | A like (double-tap or button). None on unlike or an already-liked |
| `H.tick` | 25% Soft · 50% Light · 75% Medium (a ramp) | `SEGMENT_TICK` (34) → `CLOCK_TICK` | Hold-to-check-in quarters |
| `H.commit` | impact Rigid | `LONG_PRESS` (3) | The hold reaches 100% (committed, not yet successful) |
| `H.success` | notification Success | `CONFIRM` (30) → (important moments only) notification Success | Server confirmed: check-in, RSVP, post, save profile, reveal complete |
| `H.error` | notification Error | `REJECT` (30) → (blocking failures only) notification Error | Server refused / submit failed. Not for as-you-type validation |
| `H.send` | impact Light | `VIRTUAL_KEY` (5) | A message is committed from the composer |
| `H.reaction` | selection while scrubbing; impact Soft when it lands | `SEGMENT_TICK` → `KEYBOARD_TAP`; `TOGGLE_ON` → `VIRTUAL_KEY` on landing | The reaction bar |
| `H.destructive` | impact Rigid | `CONFIRM` (30) → `VIRTUAL_KEY` | The destructive button in a confirm (unmatch, leave, delete, check out). None when the sheet opens |
| `H.detent` | impact Light | `SEGMENT_TICK` (34) → none | A dragged sheet settles at a different detent |
| `H.arrive` | impact Light, once | `CLOCK_TICK` (21) | A wave or like-back aimed at you, while in the Room |
| `H.match` | **"lub-dub"**: impact Medium, then impact Soft at +180ms | `CONFIRM` (30) → notification Success | The match landing frame. The app's one signature haptic |

**None:**
- tab switch
- secondary / tertiary buttons
- rows and cards
- carousel snap
- the centre disc changing state
- rolling numbers
- incoming messages while the chat is open
- toasts
- skeletons
- list entrances
- the automatic check-out notice

**Fixes this map makes** (current defects):
- An incoming wave fires two haptics; it should fire one (`H.arrive`).
- Check-in fires Success twice; a refused check-in fires Success then Error. The fix is `H.commit` at 100% and `H.success`/`H.error` on the server answer.
- Like, send and reaction have none today.
- Every Android press currently buzzes 50ms.

**Later, if wanted:** richer custom patterns (a true heartbeat for the match, a swelling hold) need `react-native-pulsar`, which uses Core Haptics on iOS and composition primitives on Android. Not for v1.

---

## 11. The centre Blend'n button

This is the signature. Get it right first.

### 11.1 What it is

- A 56pt disc in the middle of the tab bar.
- Tapping it **always** opens the Blend'n overlay, which grows out of the disc (a container transform), and that screen picks its own mode (Tonight, Room, Recap).
- The disc **also** shows which of four states you're in. The state is computed by the app (`lib/roomButton.ts`) and is not yours to change. Precedence is **live > check-in > today > idle**:

| State | When | Today's look | Accessibility label (keep the meaning) |
|---|---|---|---|
| **(a) idle** | Nothing on | Flat orange disc, no dot | "See what's on near you" |
| **(b) today** | You saved an event that starts today | **Identical to idle**, a known gap | "Open tonight's event" |
| **(c) check-in** | You're inside a running event's GPS fence, not checked in | White dot | "You're at an event. Check in to see who else is here" |
| **(d) live** | You're checked in (may carry an unread count) | Green dot; the unread badge is designed but never shows (a bug) | "Open the room" / "…N unread messages" |

### 11.2 Hard rules

1. **Every state is legible as a still frame**: in a screenshot, with Reduce Motion on, and in greyscale. Motion may *announce* a state change. It may never *be* the state.
2. **No colour-only differences.** Orange and violet are only 1.38:1 apart in luminance, so a palette shift cannot signal anything. Change **value** (light vs dark), **shape** (ring, hollow vs solid) or **text**.
3. **Nothing loops.** An attention burst on entering a state is allowed only if it lasts **≤5 seconds** and then holds still (WCAG 2.2.2). Battery matters: state (c) happens late at night, at the venue, on a low battery.
4. **The disc is not glass**: it sits *on* the glass bar, and glass on glass is banned. It is a fill (dark or gradient).
5. **(d) is quieter than (c).** Attention should track *need for action*. (c) asks you to do something; (d) is a status you hold for hours, and a glowing (d) becomes a light nobody sees.
6. Unread badge: a white pill with ink digits, a 2pt `ink` cut-out ring, capped at "9+". **Never red** on the gradient.
7. Rings and dots are their own absolutely positioned layers (React Native grows borders inward, which would shrink the disc).
8. Touch target ≥56pt; the label names the consequence.

### 11.3 The recommended treatment: "the disc fills"

| | (a) idle | (b) today | (c) check-in | (d) live |
|---|---|---|---|---|
| **Disc** | Dark disc: `ink` + `hairlineStrong` edge (the mark's violet end is 4.06:1 on `ink`, only 2.94:1 on `surfaceRaised`) | Same | **Filled with `gradientBrand`** | **Filled with `gradientBrand`** |
| **Mark** | Gradient mark (vector) | Same | **Ink** mark | Ink mark |
| **Ring** | None | **1.5pt gradient ring, 1pt outside the disc**, static (disc and ring must fit inside the 64pt bar) | None (the glow replaces it) | None |
| **Glow** | None | None | **Static** soft glow: two-layer shadow, orange core + rose outer, ≤28pt blur. If Android can't render a coloured blurred shadow, use a pre-rendered glow image. (c) must still differ from (d) without the glow | **None** |
| **Marker** (at 1–2 o'clock) | None | None | **Hollow white ring**, 12pt, with a 2pt `ink` ring around it ("door open") | **Solid green dot**, 12pt, with a 2pt `ink` ring (that ring is what makes green read on the gradient; without it, 1.7–2.4:1). Replaced by the unread pill when unread > 0 |
| **Label** | — | — | A **persistent** glass pill above the disc: **"Check in · {venue}"**, held for as long as (c) holds (tapping it = tapping the disc) | — |
| **Greyscale test** | Dark disc, mid-grey mark | + light ring | **Polarity flip** (light disc, dark mark) + halo + ring + text | Light disc, dark mark, solid dot |

**The owner's ask** is the logo filling with the palette or a neon glow when check-in is available. That is (c): the disc pours full of the gradient, and the mark flips to ink inside it.

Entering (c) is announced once, politely, to screen readers: "You're at {venue}. Check in from the Blend'n button."

Two further ideas are now possible because the vector mark exists:
- **Fill the mark's counters** (the enclosed spaces inside the B and the arrow) with a translucent gradient at 25–40% in (c). The mark itself looks "lit from inside" while its outline stays intact. A solid flood-fill destroys the mark; a translucent counter fill doesn't. Prototype both and show me.
- **A gradient stroke draw-on** for the (a) → (b) ring and, later, the splash. The path is an expanded stroke, so re-stroke it first.

### 11.4 Transitions

All of these are one-shot and run on the UI thread.

| From → to | Animation | Haptic | Reduce Motion |
|---|---|---|---|
| a → b | The ring **draws on** around the disc, ~450ms ease-out | none | 200ms fade |
| a/b → c | The gradient **rises inside the disc** from the bottom (~500ms, ease-out). The mark crossfades gradient → ink at the midpoint. Optional one-shot **sheen** sweeping the gradient stops (~700ms). This is where a "palette transition" belongs: as decoration on a state the fill already shows. Then **one `M.snap` pulse** (scale 1 → 1.06 → 1) and the glow **holds still**. The whole entry stays under 1.5s. (A glow that breathes 3 times, ≤5s in total, is a variant to show in §11.5, not the default: it sits close to the pulsing halo the owner rejected.) | **none** (an unsolicited buzz in a pocket is wrong; the state changed, the person didn't act) | Instant or 200ms crossfade to the final still frame |
| c → d (check-in succeeded; plays when the overlay closes, since the overlay covers the bar) | The glow **collapses into the disc** (~350ms). **One ripple** ring expands from the edge (scale 1→1.35, fading, ~600ms). The hollow ring **fills** into the green dot | `H.success` (fired by the check-in's server answer, once) | Crossfade, no ripple, haptic kept |
| d → a (checked out / event over) | The fill **drains** downward (~400ms); the dot fades | none | Crossfade |
| unread 0 ↔ n | The pill pops in/out; digits roll | none | Instant |
| Re-entering c on foreground | Repeat the single pulse, at most once per foreground | none | none |

**Press:** the disc squashes to 0.9 (`M.press`) with `H.disc` on press-in. That is the only haptic the disc itself makes.

### 11.5 Research this before drawing (required)

Go online and show me what you find, with links:
1. How current apps show **available vs dormant vs active**: DICE's ticket that activates on the day, Instagram's story ring (gradient = something to open, grey = seen), iOS status dots, Live Activities and Dynamic Island, Material 3's state layers, Apple's `.glass` vs `.glassProminent`.
2. **Techniques for "lighting up" a control**: gradient fill rising from empty, a stroke → fill, an animated conic border, a sheen sweep, a layered neon glow, a breathing halo. For each, say:
   - how it reads as a still frame;
   - what it does under Reduce Motion;
   - what it costs on a mid-range Android;
   - whether it is on the current "AI-generated look" lists (rotating aurora borders and coloured glows are).
3. Current guidance on **enabled vs inactive vs selected vs disabled** styling on dark translucent UI, and why "dormant" must never look "disabled".

Then show 2–3 variants of the four states (the one above is the recommendation, not the only option) as still frames and as a prototype, and recommend one.

### 11.6 Later, not now

A Lock Screen **Live Activity** (and the Android 16 Live Update) while you're checked in: "In the room · Toit, Indiranagar · 3 unread", counts only and never names. It meets Apple's definition of a Live Activity (a defined start and end, a few hours). It is a separate ticket, but sketch it in the design system so it shares the language.

---

## 12. Components

Name them exactly like this; the code will use these names. Every component needs:
- all its states (default, pressed, selected, disabled, loading, error as applicable);
- its iOS and Android variants where §13 says they differ;
- its Reduce Motion behaviour;
- its haptic;
- a `focused` state (`focusRing`), for keyboard, Switch Control and Voice Control.

**Actions**
- `Button`: `primary` (gradientFill, white label, 56h), `secondary` (glass on L0 only; on L2 a `rgba(255,255,255,0.08)` fill, because glass on glass is banned; `surface` on L1), `tertiary` (text), `destructive` (destructiveFill) · sizes `lg` 56 / `md` 48 · states: pressed (scale 0.97, no opacity), disabled (45%, on a solid surface, never on glass), busy (spinner replaces label, width locked).
- `IconButton`: `glass` (44, L2) / `solid` / `scrim` (over photos).
- `HoldToConfirm`: the VenuePass pill (§11, SCREENS Flow 4). The fill translates in linearly over 900ms, the label is drawn twice so it changes colour at the fill edge, `H.tick` at the quarters, `H.commit` at 100%, then `H.success`/`H.error` on the server's answer. Keep this mechanic. Reduce Motion keeps the fill (it is progress, not decoration). **Accessible path:** with VoiceOver, TalkBack, Switch Control or Voice Control, activating the pill checks in directly, with a label that states the consequence ("Check in. Other people at this event will see you."). The hold is never required. That is today's behaviour; keep it.
- `ButtonGroup`: e.g. Directions · Calendar · Share.

**Selection**
- `Chip`: idle `surface` + hairline / selected white fill + ink text / disabled.
- `SegmentedControl`: a glass capsule with a sliding white thumb.
- `Toggle`: on = white track, ink thumb; off = `#959090` track, white thumb (3.15:1). Not the brand gradient, or Settings would show one on every row. Use the platform switch shape (§13).
- `Stepper`.
- `LookingForCard`: a photo choice card.
- `RadioCard`: e.g. Anonymous vs Named.

**Input**
- `TextField`: 56h `surface` capsule with a 1pt `inputBorder`. States: focused (`focusRing`), filled, error (destructive text below; `H.error` only when a submit fails, never while typing), disabled.
- `TextArea` with a Geist Mono counter.
- `SearchField`.
- `DateField`: DD/MM/YYYY in Geist Mono.
- `Composer`: the chat composer, glass, with every state in SCREENS Flow 5.

**Navigation**
- `TabBar` and `CentreButton` (§11).
- `TopBar`: transparent at rest → glass on scroll; a large title that condenses.
- `SheetGrabber`.
- `ProgressBar` for onboarding.

**Containers**
- `Card` (solid, radius 32).
- `Sheet` (L3) and `ActionTray`: compact / default / expanded; **button order fixed app-wide**.
- `Toast`: success / error / info / with Undo.
- `Banner`: offline / paused / info / visibility, solid.
- `EmptyState`.
- `LoadError`.
- `Skeleton`, shaped per component.

**Events**
- `EventCard` in `hero` / `row` / `compact`, with photo, scrim, title, Geist Mono time, venue + distance, `LivePill`, save, "N here now". One date grammar (SCREENS Flow 3).
- `TonightCard`: the deck card.
- `VenuePass`.
- `TimeBadge`: "Live" / "In 25 min" / "9:30 PM" / "Ended" (sentence case, the one date grammar).
- `LivePill`: a still green dot + "Live".
- `Price`: Geist Mono, ₹, "Free".
- `AmenityTile`.
- `MapCard`.
- `DayHeading`.
- `SectionHeader` with an optional text action.

**People**
- `Avatar`: photo / creature / initials, with sizes 24–112 and an optional ink cut-out ring.
- `Facepile`: up to 5 + "+N".
- `PersonCard`: a sheet.
- `MeetNextCard`.
- `GridFace` with liked / matched / here marks.
- `TimeRing`: words set on a circle around your face.
- `VisibilityBanner`: anonymous / named / hidden / blocked.
- `RevealBar`: the DM reveal, designed as a moment.
- `RollingNumber`.

**Chat**
- `ChatBubble`: in/out, grouped first/middle/last, reply quote inside, edited, failed + retry, removed-by-moderation (dashed), image.
- `ReactionBar`: six emoji, anchored to the bubble.
- `ReactionPill`.
- `SystemNotice`: day separators and room narration.
- `BroadcastNotice`: announcement (organiser identity) / sponsored (labelled, optional media).
- `TypingIndicator`.
- `ReplyPreview`, attached to the composer.
- `UnreadDivider`.
- `ReceiptMark`: sent = one outlined check; delivered = two; read = two plus the word "Read" under your last bubble.

**Moments**
- `MatchMoment`.
- `CheckInMoment`: the pour + ripple.
- `RecapTiles`.
- `ReadyMoment`: onboarding.

**Every gesture has a tap or screen-reader alternative.** Draw them:
- chat bubble: Reply, React, Copy, Report as actions (swipe and long-press are shortcuts);
- like: a Like button (double-tap is a shortcut, turned off while a screen reader runs);
- deck and carousels: adjustable ("Card 2 of 10") with Next and Previous;
- photo reorder: Move earlier / Move later;
- reaction bar: stays open after the finger lifts;
- sheets: a visible Close;
- event-card peek: Save, Share and Preview reachable as actions;
- every threshold haptic has a visible armed state.

**Board**
- `BoardPostCard` (offer / seeking).
- `BoardComposer`.

**Profile**
- `PhotoStack`.
- `PhotoTile`: empty / uploading / failed / pulled by moderation / blurred.
- `MemoryTile`.
- `InterestChip`.

---

## 13. iOS and Android

**One brand, two native feels.**
- Android is ~93% of the audience, so **Android is not a port of the iOS design**.
- Take Material 3 Expressive's *mechanics* (spring physics, pressed-shape change, emphasised weight for selected states, a morphing loader) and leave its *look* behind: tonal pastels, dynamic colour and stock components would make Blend'n read like Google Messages.
- Google's research found 87% of 18–24-year-olds prefer the expressive approach, and that is this app's crowd ([research](./research/research-android-m3e.md) §1).

**"Glass" on Android, two tiers.**
- **Tier B (the default, and the real design):**
  - near-opaque tinted surfaces, `rgba(26,24,24,0.92–0.96)` (`surfaceSunken`), so the orbs bleed through faintly;
  - a 1px top hairline at 10% white;
  - a 0→6% white inner highlight over the top 12dp;
  - a baked 3% noise tile.
  - **Make Tier B look finished, not degraded.**
- **Tier A (later, by flag):** real blur, **only on the tab bar and the scrolled top bar**, from one shared blur source, on Android 12+ devices that pass a capability check. The check also turns blur off under Battery Saver and the "Reduce blur effects" accessibility setting.
- **Sheets never blur on Android.** They are separate windows and the blur can't see behind them. Material doesn't blur sheets either.

| Component | iOS | Android |
|---|---|---|
| **Tab bar** | Glass capsule 64pt, radius 32, inset 16; selection capsule; labels white | Same capsule and metrics (M3E's nav bar is also 64dp); Tier B surface; indicator pill **56×32dp** behind the icon, white 10%; label **not bold** when selected. **No haptic on tab switch** (Material bars don't vibrate). Back from Going/Banter/Me returns to the Pulse, then exits |
| **Top bar** | Centred title on detail screens; chevron back; native glass header, scroll-edge effect | **Start-aligned** title; **arrow** back; 64dp; transparent at rest with a gradient protection band under the status bar; Tier B surface once scrolled |
| **Press feedback** | Scale (0.97) + highlight | **Ripple** (white ~10%, foreground on photo cards, borderless on icon buttons) on rows, cards, chips, icon buttons and tabs. **Scale only on hero objects**: the centre disc, the primary CTA, deck cards |
| **Primary button** | gradientFill capsule, scale on press | The same capsule; **squares off to a ~12dp corner while pressed** (M3E pressed-shape) on the fast spatial spring, plus ripple |
| **Chip** | White fill + ink when selected | The same colours, deliberately: the Android research suggested an orange 16% tint, which would break the one-primary rule. The selected label gets the emphasised (heavier) weight; ripple |
| **Toggle** | Native `UISwitch` proportions, brand-fill track | **Material switch geometry**: 52×32 track, thumb 16→24dp (28 pressed), 2dp outline when off; brand-fill track when on |
| **Sheet** | Native sheet, glass at partial detent, grabber | Opaque `surface`, top radius 24, **32×4dp** drag handle, scrim 50%; **system back dismisses every sheet** |
| **Dialog** (destructive confirms only) | Alert: centred, stacked buttons | Opaque `surface`, radius **28**, buttons right-aligned, confirm on the right |
| **Toast** | Glass capsule at the top | **Snackbar** at the bottom, above the tab bar: `surface` capsule, 48/68dp, one action, auto-dismiss 4–10s, swipe to dismiss. Never the system `Toast` |
| **List row** | Inset-grouped for settings | Full-bleed rows, or M3E "segmented" groups for settings (16 radius group, 4dp item corners) |
| **Loading** | Spinner in `textSecondary` | **Morphing brand loader** for waits under 5s: the monogram outline ↔ circle, drawn as a path morph. Use it on both platforms if it reads well |
| **Haptics** | `expo-haptics` impact/notification/selection | **Only `performHapticFeedback` constants** (§10). **No haptic on ordinary taps.** The current 50ms `selectionAsync` on every press is a raw vibration that buzzes on cheap motors |

**Android platform rules the layout must honour**
- **Edge-to-edge is mandatory.** Play requires target SDK 36 since 31 Aug 2026.
  - The status bar and the gesture bar are transparent.
  - Draw content behind them, with gradient protection where it scrolls under.
  - **Nothing tappable in the bottom gesture zone.** The floating tab bar sits at `insets.bottom` + 8–12dp.
  - Horizontal carousels and the swipe deck must not start at the screen edge (system back gesture).
- **Predictive back** stays off this cycle because of React Native bugs. But design screen transitions so they could later match its preview: the exiting screen scales to 90% with an 8dp edge margin.
- **Themed (monochrome) icon.** Android 16 auto-generates one if the app doesn't supply it, so draw a deliberate single-colour monogram for the adaptive icon's monochrome layer (108dp canvas, 66dp safe zone).
- **Material You dynamic colour** does not apply: it is opt-in and the app never opts in. The brand colours are fixed.
- **The system splash** is one solid colour + one icon (160dp circle with an icon background, 192dp without). The orbs can never be in it. Relevant later, for the splash decision.

**Shared motion foundation.** M3E's springs are pure physics, so both platforms use one spring table (§9). On iOS they read as Apple-like springs; on Android they read as M3E.

---

## 14. Accessibility

- **Contrast:**
  - text ≥ **4.5:1**, icons and state indicators ≥ **3:1**;
  - on glass, measured against the worst backdrop at the clearest glass setting.
- **Never colour alone.** Every state also differs in value, shape or text.
- **Reduce Motion:** every animation needs a designed alternative, usually a short crossfade.
  - No zooming, sliding or blurring transitions; no ambient drift.
  - Progress (the hold fill) and direct manipulation (drags) are kept.
  - Haptics are kept.
- **Reduce Transparency:**
  - every glass surface has a solid version;
  - **iOS 26+ glass** handles this itself;
  - **every fallback (older iOS, Android) must implement it explicitly**.
- **Increase Contrast:**
  - hairlines to 50% white at 1pt;
  - unselected tab labels stay `textSecondary` (brightening them would shrink the selected/unselected gap), and the selection capsule gains a 1pt white outline;
  - scrims +20% alpha;
  - orbs at half alpha.
- **Dynamic Type / font scale:** honour the per-role caps in §6. Fixed-height controls cap at 1.3×; reading text goes to 2×.
- **Bold Text:** step weights up one.
- **Targets:** 44pt iOS / 48dp Android minimum.
- **Screen readers:**
  - every glyph-only button has a label that names the consequence;
  - the Blend'n overlay is modal, so it hides the tab bar from VoiceOver and TalkBack.
- **WCAG 2.2.2:** any auto-starting motion stops within 5s, except the orbs, which an in-app **"Ambient motion"** setting (on by default) turns off together with attention bursts. Android's "Remove animations" is rarely on.
- **Announcements (WCAG 4.1.3):**
  - Errors are assertive. Banners, an incoming wave, the check-in result and the match are polite.
  - Messages in an open room are silent; when scrolled up, announce "N new messages" once.
  - Counters and the typing indicator are never live regions.
  - Entering state (c) and an automatic check-out are announced once.
- **Focus:** sheets, trays and the overlay move focus to their title on open, and return it to what opened them (the disc, for the overlay) on close.
- **Timeouts:** "Meet next" never reshuffles while a PersonCard or ConnectSheet is open, or while screen-reader focus is inside it. It shows "Refreshes in 12 min" as text, with a text warning 30s before.
- **Irreversible actions** use one pattern: the consequence stated above the buttons, buttons named with the verb ("Reveal me", "Delete account"), never "OK".
- **Plain words for visibility.** Not "roster": "Other people at this event will see your name and photo" (or "your nickname"). Each VisibilityBanner state has its own icon and sentence.
- **Passwords:** paste and password managers always work (WCAG 3.3.8).
- **Low Power Mode and Battery Saver:** treated like Reduce Motion for ambient and attention motion. One-shot feedback stays.

---

## 15. Performance budget

This is a design constraint, because mid-range Android is the majority of users.

- Glass surfaces on screen at once: one bottom group + ≤4 controls.
- No live blur inside lists. No blur on Android until measured on a Galaxy A34 at 60fps.
- Orbs: pre-rendered images, slow transform drift, frozen when off-screen or in Low Power.
- Animate **only transform and opacity** (never opacity on glass). No layout animations on views containing blur.
- No new heavy dependency for decoration. Skia, Lottie and mesh-gradient libraries need a case of their own.
- If a design idea needs one of them, say so and say why; the owner decides.
- Skeletons and shimmer: one pass, then static.

---

## 16. Product rules that must survive (non-negotiable)

They come from the product docs and the code, and each one is there because breaking it was a real bug or a real harm. Full lists with `file:line` are in the audits (`audit-core-loop.md` §8, `audit-social.md` §0.8, and each screen's "Rules to keep" in `audit-discovery.md` Part 2 and `audit-entry-system.md`).

**Privacy and people**
- Anonymous by default.
- Faces only where earned: a photo appears only after that person revealed.
- Revealing is gated on having a name and photo; going anonymous never is.
- The visibility banner in the Room never hides.
- Likes are private until mutual.
- A wave is seen at once, at most one per pair per 10 minutes.
- Message = a connection request that **reveals you**, and the UI says so **before** you type.
- One request per person.
- Reveal in a DM is irreversible, and the copy says so before the tap.
- There is no "declined" state, ever, anywhere. A declined ask is never shown or inferable.
- Before check-in, show **counts, not faces**.
- **There is no search for people.** Friends arrive only by invite link. Friend presence or recency has no data behind it. "Not now" and "Remove friend" are silent.
- **Matching data is special-category.** A networking user is never asked their gender. Dating fields appear only while Dating is chosen, and Dating is offered only to an age that may date.
- Reason lines never invent facts ("Both at 3 nights before", never "Met at").

**The loop**
- Check-in requires a deliberate act (the hold) and states its consequence ("puts you on a roster other people can see").
- Check out always confirms. It is reachable from the Room's top bar **and** the Pulse peek, and never from the Scene.
- Every check-in goes through the hold, or a screen-reader activation. Never a one-tap menu item.
- Report-event is always reachable on the Scene, with no check-in gate.
- Live > check-in > today > idle.
- Every centre-button state goes somewhere real.
- Meet next is a shared 15-minute clock seeded by the event.
- The Recap never checks you out.
- Rating is private and skippable.
- Board: pseudonyms only, before doors only, no confirm on Ask, refusals in the server's words, a 409 is a state not an error.

**Content honesty**
- Every number on a card comes from real data; never invent "142 joined".
- **No event price anywhere**: no price on event cards or the Scene, and no "LIMITED ACCESS". (Blend'n+ will show its own in-app-purchase prices; that is the `Price` component's job.)
- **No check-in boundary is ever drawn on the home map.** A drawn outline is a map of where to stand to be counted.
- **Live at a venue is a bucket, never a number** ("Under 5 live", "5–9 live"…), and never who.
- **Not available without a server change** (don't design them in): host bylines on cards, attendee faces before check-in, a live "N checked in now" on Pulse cards, an editorial "featured" flag, reservations, friends-here.
- Status (live, presence) is a still mark.
- Broadcasts look like broadcasts: full width, no tail, no avatar. Sponsored is labelled and quieter than an announcement.
- Prices in-app never offer a payment that bypasses the stores' rules. Paid features (Blend'n+) are in-app purchases only.

**Platform and safety**
- 18+ only; the under-18 path refuses kindly.
- Errors on the auth screens are inline and persistent, never toasts.
- Provider sign-in buttons keep their providers' design.
- Never reveal whether an email has an account.
- Sign out asks first and is **not** red. Settings' section order is test-pinned: Blocked users under Safety, no "Discovery" section, Delete account last under its own header.
- Support composes an email in the person's own mail app. Nothing leaves the app until they press send there.
- Every confirmation, report and block flow is a step of **one sheet**, never a stacked modal or a system alert.

---

## 17. Research you should do (and cite)

Before drawing, research online and show your findings with links:
1. **Liquid Glass in production (iOS 26/27):** the best-regarded third-party apps that adopted it well, and what they did with tab bars, floating buttons, sheets and scroll edges. What iOS 27 changed (the clear↔tinted slider, darker edges). Apple's HIG on materials, tab bars, sheets and buttons.
2. **Material 3 Expressive:** the motion physics (springs), shape, emphasised type, and how a branded dark app should feel native on Android without looking like stock Material.
3. **Active/dormant states**: §11.5.
4. **Event and social apps people love now:** Apple Invites, Partiful, Luma, Timeleft, DICE, Posh, Hinge, Bumble's 2025–26 reset, District by Zomato (the Indian incumbent), Airbnb's 2025 redesign, Instagram/Threads presence, Spotify's listening activity. What makes each feel alive, how each shows "live / now / who's here". The research file has a start; go further.
5. **Chat:** current best practice for grouped bubbles, reaction bars, reply previews, read receipts and restricted/muted composer states (iMessage on iOS 26, WhatsApp, Telegram, Instagram DMs).
6. **What currently reads as AI-generated design**, so you can avoid it (§18).
7. **Haptics in the apps above**: where they fire and where they deliberately don't.

---

## 18. Avoid

- Purple-to-blue gradients, or violet as the dominant colour.
- Glassmorphism on content cards; frosted panels with coloured glows; glass on glass.
- Coloured drop shadows and glows anywhere except §11 state (c).
- Rotating conic "aurora" borders; perpetual pulsing or breathing.
- Confetti. The check-in "pour" and the Match replace it; the Recap is deliberately calm.
- Emoji as UI (navigation, empty states, buttons). The creature avatars are the one illustrated system.
- All-caps eyebrow labels on every card; "badge above headline" stacks; identical icon-topped cards in a grid ("the SaaS card kit").
- Inter/Roboto/system-font look; mixing a third typeface.
- Stock 3D or skeuomorphic icons (they break the outlined-icon rule).
- Fake urgency: countdowns that aren't real, scarcity that isn't in the data.
- An Instagram-style gradient ring on avatars (it reads as Instagram).
- A swipe deck for people in the Room (the category is moving away from swiping; in a bar you need a glanceable card).
- A frame that only works because of the orbs. If it falls apart with them off, it isn't designed.
- Abstract or gradient placeholder images. Use the real event and profile photos supplied (PROMPTS.md).

---

## 19. What implementation will change (for context, not for you to design)

When flows are handed to Claude Code, these old guards are rewritten in the same change, never silently deleted:
- `scripts/check-design-tokens.js` currently fails on any blur, shadow or raw colour, so it will allow the `Material` component, the §11 glow and the gradient tokens.
- `__tests__/themeContrast.test.ts` pins dark text on the accent; it will pin white on `gradientFill` instead.
- `__tests__/roomButton.test.ts` bans a ring, glow or loop on the disc; it will ban loops and allow the static (c) glow.
- `__tests__/pulsePalette.test.ts` forbids a root background gradient.
- `__tests__/fonts.test.ts` gets the new families.
- `docs/DESIGN_SYSTEM.md` and `docs/NAVIGATION.md` are rewritten to match the published design system.

---

## 20. Out of scope for this pass

- **The splash and launch animation.** It will be decided after the redesign (PROMPTS.md has a ready prompt). Keep a static splash frame (the monogram centred on `ink`) so the landing's first frame can be checked against it. What is already known, for that decision:
  - **Android's system splash** is one solid colour plus one icon (fits a 160dp circle with an icon background, 192dp without; an animated vector icon ≤1s, Android 12+ only). **The orbs can never be in it**, so any brand animation is a hand-off in the app's first frame.
  - The committed Android splash colour is `#000000`, not the page colour. Fix it with the redesign.
  - Expo's splash fade is iOS-only.
  - Today's 2.4s intro (`components/IntroAnimation.tsx`) plays on **every** cold launch, even for signed-in users, flying the lockup to the sign-in position over the Pulse. It should play on first launch / signed-out only.
  - Claude Design can prototype it with exact timings, but it has no Lottie or video export. The shippable version is rebuilt in Reanimated.
- **Light mode.** Dark only.
- **The Live Activity / Android Live Update**: sketch only (§11.6).
- **New features.** If a screen seems to want one, note it; don't design it in.

**Coming next** (product-completion plan v2, `ROADMAP.md`). Don't draw these now, but make sure the system has room for them:

| Step | Feature | What it will need from the system |
|---|---|---|
| 5 | **Places live** | The venue screen, a **Go Live** sheet (20 / 45 / 60 min / Stay), a live pill with a countdown, an expiry prompt, the hand-off to event check-in, "Own this place? Claim it" |
| 9 | **Crews** | Create from friends, crew chat, "We're here", crew cards (an anonymous menagerie, then a revealed collage), a Blend room in the Banter's Live now |
| 10 | **Matching v2** | Person and crew cards with one sentence of overlap; profile fields for languages, home state, this-or-that, an opt-in sign, IPL teams |
| 11 | **Blend'n+** | The paywall: ₹199/mo · ₹499/quarter · ₹1,499/yr · Night Pass ₹49, **App Store / Play in-app purchase only**; restore and manage |
| 12 | **Regulars** | A **live, animated door pass** (one per day; staff tap "Redeemed"). It's the cousin of DICE's activating ticket, and a natural place for the "disc fills" language. Plus a revocable "Let this venue know I'm a regular" opt-in |
