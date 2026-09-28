# Design system

Every screen takes its type, spacing, icon sizes, control heights, radii and
colours from `lib/theme.ts`. `npm test` fails if a file in `app/` or
`components/` uses a value that isn't on the scale (`scripts/check-design-tokens.js`;
run it directly with `npm run lint:design [files…]`). It checks:

- raw `fontSize`, `fontWeight`, `lineHeight`, `textTransform`
- padding, margin and gap off `SPACE`; icon sizes off `ICON` (any `*Icon` component too)
- raw colours (`'#hex'`, `rgba()`) and raw `borderRadius`
- shadows and `BlurView`
- retired tokens (`EMBER_TYPE`, `EMBER_GRADIENT`, `EMBER_CONTROL_HEIGHT`) and the
  `APP_*` palette — the last one in `lib/` too
- a number added to a safe-area inset (`insets.bottom + 16` → `+ SPACE.lg`),
  a literal `min/maxWidth/Height`, and a literal `opacity: 0.x` (use
  `OPACITY`, or a named constant for a decorative fade). Only the dev-only
  `app/preview/*` screens are exempt (`LATE_RULE_ALLOWLIST`)

It can't check the accent rule or "one row, one height" — those are review items.

## Spacing — `SPACE`

| token | pt | use |
|---|---|---|
| `xxs` | 2 | hairline nudges only |
| `xs` | 4 | icon ↔ its own label inside a badge |
| `sm` | 8 | icon ↔ text, items inside a chip |
| `md` | 12 | between items in a row (chips, buttons) |
| `lg` | 16 | inside cards and controls; heading → its content; title → search |
| `xl` | 24 | **`GUTTER`**: screen side margin; card padding; between cards |
| `xxl` | 32 | between sections |
| `xxxl` | 48 | top of a screen's empty state, rare |

- Every screen's content starts and ends at `GUTTER` (24). Horizontal
  carousels start their first item at `GUTTER` too (not centered).
- Between sections: 32. Heading → its content: 16. Items in a list: 12 or 16.
- Off-scale values snap to the nearest step (10→8 or 12, 14→12 or 16, 20→16 or 24).

## Type — `TYPE` / `<Text variant>`

| role | font | size/line | use |
|---|---|---|---|
| `display` | Jakarta ExtraBold | 34/40 | one per screen: the screen title |
| `title` | Jakarta Bold | 24/30 | card titles, sheet titles, empty-state titles |
| `heading` | Jakarta Bold | 20/26 | section headings |
| `button` | Jakarta Bold | 16/24 | button and action labels |
| `body` | Manrope Regular | 16/24 | reading text, inputs, messages |
| `bodyStrong` | Manrope SemiBold | 16/24 | names, list-row titles, chip labels |
| `meta` | Manrope Regular | 13/18 | dates, venues, timestamps, helper text (secondary colour) |
| `label` | Manrope Bold | 12/16 +1.2 tracking | uppercase: tags, field labels, eyebrows, text actions |
| `caption` | Manrope SemiBold | 11/14 | tab labels, badges, counts |

- `<Text variant>` caps the phone's text size per role (`MAX_FONT_SCALE`):
  `display`/`title` 1.2, `button`/`label`/`caption` 1.3 (fixed-height boxes),
  reading text 2.0.
- New code: `<Text variant="meta">` from `components/ui/Text`, or `...TYPE.meta`
  inside a `StyleSheet`. Change colour with the `color` prop / a `color` key —
  never `fontSize`, `fontWeight` or `fontFamily`.
- `label` text is uppercased in the string, not with `textTransform`.
- The old `EMBER_TYPE.*` aliases are gone; use the roles above.

## Icons — `ICON`

`sm` 16 inline with text · `md` 20 inside controls and rows · `lg` 24 navigation
and top-bar actions. Decorative illustrations may be 28+.

## Controls — `CONTROL`

`lg` 56 primary actions and form inputs · `md` 48 search fields, chips, pill
buttons and icon buttons · `sm` 32 tags · `badge` 18 an unread count pinned to an icon. **Things in one row share one
height.** Controls of the same kind in a row (chips, filter pills, a search
field and its filter button, two equal choices) also share one fill; a
primary + secondary button pair is the one row where fills differ (accent +
`surface`), and status badges keep their status tint. Pill controls use
`EMBER.surface`.

## Colour — `EMBER`

- Surfaces: `bg` page → `surfaceSunken` → `surface` (controls, cards).
- Text: `textPrimary`, `textSecondary` (details), `textTertiary` (helper),
  `textPlaceholder`. All four are AA (4.5:1) on `bg`, `surfaceSunken` and
  `surface` (`__tests__/themeContrast.test.ts`).
- Pressed and disabled controls dim by `OPACITY.pressed` (0.85) and
  `OPACITY.disabled` (0.45), nothing else.
- `accent` (orange) is for **at most one thing per screen** plus the tab
  bar's own chrome (the active tab and the Blend'n disc, which is the brand
  mark): the screen's primary action. "One thing" can repeat — the Like on
  every Room card is one action. A screen with no primary action may give it
  to the accent word of its title (Pulse), or have none (Settings). A modal,
  sheet or action tray is its own screen with at most one primary action;
  the empty or error state's single action ("Retry") is the primary action
  of that state.
- Everything else that used to reach for orange has one neutral answer, the
  same on every screen:

  | element | treatment |
  |---|---|
  | selected chip, segment or option | `textPrimary` fill, `bg` text |
  | switch | `SWITCH_COLORS` (on = `success`) |
  | unread dot, count badge | `textPrimary` fill, `bg` text |
  | presence / live dot | `success` |
  | saved / liked (heart, bookmark) | filled glyph in `textPrimary` |
  | text action ("Clear", "See all") | `label` in `textPrimary` |
  | spinner, pull-to-refresh | `textSecondary` |
  | back arrow, top-bar icons | `textPrimary` |
  | progress fill | `textPrimary` on `surfaceSunken` |
  | your own name, receipts, quote bars, rings | `textPrimary` / `textSecondary` / `textTertiary` — never `separator`, which is for hairlines and vanishes at 4pt |
  | eyebrows, emphasised words in body copy | `textSecondary` / `textPrimary` |
  | decorative icon wells and badges | `surface` fill, `textPrimary` glyph |
  | info toast / banner | `surface`, `separator` border; warnings and errors use `tint(warning/destructive)`, so the three never look alike |
- Primary button: flat `EMBER.accent` fill, `EMBER.onGradient` text, no glow.
  The text is dark on purpose: white on `#FF906D` fails contrast. Don't "fix" it.
- `destructive`, `success`, `warning`, `separator` for their jobs. Error text is
  `destructive`, never the gradient's pink.
- `violet`: the palette's one cool hue — the alternate glyph in a pair of
  amenity tiles on the event page. Nothing else.
- Over photos and behind sheets: `scrim` (page colour at 60%, pills on a
  photo), `bgClear` (the clear end of a photo → page fade), `backdrop` (behind
  every modal, sheet and lightbox), `skeleton` (loading blocks).
- A status tint is `tint(EMBER.success, 0.16)`, not a hand-written `rgba()`.
- The old `APP_*` palette (iOS blue accent) is gone from screens.

## Surfaces are flat

No shadows, no glows, no `BlurView` glass, no gradient fills. The primary
button is a flat `EMBER.accent`; a card or sheet separates from the page by
its fill (`surface` on `bg`) or a `separator` hairline. Photo scrims (dark →
clear `LinearGradient`) and generated pseudonym avatars (identity art from
`lib/pseudonymAvatar.ts`, not a surface) are the only places a gradient belongs.

## Radius — `EMBER_RADIUS`

`sm` 8 thumbnails/badges · `md` 16 rows/bubbles · `lg` 24 sheets · `card` 32
large cards · `pill` controls, inputs and anything round (a circle is `pill`,
not half its size).

## Exceptions

When a value truly cannot come from the scale (an emoji hero, a glyph sized to
an image), put `// design-exception: <reason>` on the line or the line above.
The reason is required and reviewed.
