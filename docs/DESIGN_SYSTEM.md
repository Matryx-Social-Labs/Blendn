# Design system

Every screen takes its type, spacing, icon sizes, control heights and colours
from `lib/theme.ts`. `npm test` fails if a file in `app/` or `components/` uses
a value that isn't on the scale (`scripts/check-design-tokens.js`; run it
directly with `npm run lint:design [files…]`).

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

- New code: `<Text variant="meta">` from `components/ui/Text`, or `...TYPE.meta`
  inside a `StyleSheet`. Change colour with the `color` prop / a `color` key —
  never `fontSize`, `fontWeight` or `fontFamily`.
- `label` text is uppercased in the string, not with `textTransform`.
- The `EMBER_TYPE.*` names still work and point at these roles. Don't add new uses.

## Icons — `ICON`

`sm` 16 inline with text · `md` 20 inside controls and rows · `lg` 24 navigation
and top-bar actions. Decorative illustrations may be 28+.

## Controls — `CONTROL`

`lg` 56 primary actions and form inputs · `md` 48 search fields, chips and pill
buttons · `sm` 32 tags and badges. **Things in one row share one height and one
fill.** Pill controls use `EMBER.surface`.

## Colour — `EMBER`

- Surfaces: `bg` page → `surfaceSunken` → `surface` (controls, cards).
- Text: `textPrimary`, `textSecondary` (details), `textTertiary` (helper),
  `textPlaceholder`.
- `accent` (orange) is for **one thing per screen** plus the active tab: the
  primary action, or the accent word of the title. Not for tags, text actions,
  logos and icons all at once.
- Primary button: flat `EMBER.accent` fill, `EMBER.onGradient` text, no glow.
- `destructive`, `success`, `separator` for their jobs.
- The old `APP_*` palette (iOS blue accent) is gone from screens.

## Radius — `EMBER_RADIUS`

`sm` 8 thumbnails/badges · `md` 16 rows/bubbles · `lg` 24 sheets · `card` 32
large cards · `pill` controls.

## Exceptions

When a value truly cannot come from the scale (an emoji hero, a glyph sized to
an image), put `// design-exception: <reason>` on the line or the line above.
The reason is required and reviewed.
