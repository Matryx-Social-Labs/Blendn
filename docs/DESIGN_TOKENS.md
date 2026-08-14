# Liquid Ember — the token layer

For designers and for whoever builds the next screen against it. The tokens
live in `lib/theme.ts`; this explains what each one is *for*, which is the part
a hex value cannot say.

Source: the Figma file `Zi2KcUzhEcLRdqyit22LdQ`, canvas **🕓 Updates**. The
onboarding frames (`1141:3928` and its siblings) are what these were measured
off.

---

## Two palettes, on purpose

`APP_COLORS` is what the app renders today. `EMBER` is Liquid Ember. Both are
exported and both are live.

This is not an unfinished rename. Repointing `APP_COLORS.backgroundBase` from
`#000000` to `#0F0E0E` would restyle **twenty-six files in one commit** with
nobody having looked at any of them — and the two palettes differ in more than
shade:

| | `APP_COLORS` | `EMBER` |
|---|---|---|
| Background | `#000000`, true black | `#0F0E0E`, warm near-black |
| Primary action | one flat blue | a two-stop gradient |
| Text on primary | white | **dark** (`#5B1600`) |

A screen migrates when someone has designed it in Ember and looked at the
result. `APP_COLORS` is deleted when the last one has.

---

## Colour

| Token | Value | What it is for |
|---|---|---|
| `bg` | `#0F0E0E` | The page. Warm near-black — `#000` reads blue next to the gradient |
| `surface` | `#272525` | Inputs, and the large content cards |
| `surfaceSunken` | `#211F1F` | Unselected chips, the progress track. One step darker than `surface` |
| `surfaceMedia` | `#141313` | The well behind the "curation phase" image. Darker than the page |
| `textPrimary` | `#FFFFFF` | Headlines, input values, unselected chip labels |
| `textSecondary` | `#AEAAAA` | Body copy, field labels, the progress percentage |
| `textTertiary` | `#787574` | Helper text under a field. Deliberately dimmer than secondary |
| `textPlaceholder` | `#6B7280` | Inside an empty input. Cool grey, so empty never reads as filled |
| `gradientFrom` → `gradientTo` | `#FF906D` → `#FF6D8D` | The primary action, at 135° |
| `onGradient` | `#5B1600` | Text on a gradient **button** |
| `onGradientChip` | `#2D0700` | Text on a selected gradient **chip** — darker, because smaller type |
| `accent` | `#FF906D` | The gradient's warm end, flat, for eyebrow text and icons |

**Why two "on gradient" colours.** The button is 18pt bold; the chip is 16pt
medium. Smaller and lighter type on the same background needs more contrast to
hold, so the chip's text is darker. They are not interchangeable.

**Why the text on the gradient is dark at all.** White on `#FF906D` fails
contrast. The design is right about this and it is worth not "fixing".

### The gradient

`EMBER_GRADIENT` — 135°, expressed as `start: {x:0, y:0}` → `end: {x:1, y:1}`.

`expo-linear-gradient` takes unit-space points, not an angle. 135° in CSS runs
**top-left to bottom-right**, so the default `{x:0, y:1}` (straight down) is
wrong and looks close enough to be missed.

### Atmosphere

`EMBER_ATMOSPHERE` — two blurred circles behind every onboarding screen:
`rgba(255,144,109,0.05)` at 60px blur, and `rgba(255,109,141,0.05)` at 50px.

5% is not a mistake. At full strength this is a colour wash; at 5% under a
60px blur it is the faint warmth that keeps flat `#0F0E0E` from reading as
dead. Positions are per-screen — only the colours and radii are shared.

### Glow

`EMBER_GLOW.button` and `.progress`. The button carries a `#FF906D` shadow at
20% opacity, 15px, offset 10px down; the progress fill carries the same colour
at 30% with no offset, so it reads as emission rather than as a drop shadow.

---

## Type

Two families. **Weight comes from the family name, never from `fontWeight`** —
a custom font on Android ignores `fontWeight` and silently renders regular, so
`Manrope_400Regular` at `fontWeight: '700'` is bold on iOS and not bold on
Android from identical code.

- **Plus Jakarta Sans** — ExtraBold and Bold. Headlines and buttons only.
- **Manrope** — Regular, Medium, SemiBold, Bold. Everything else.

Loaded in `lib/fonts.ts`, which `app/_layout.tsx` hands to `useFonts`.
`__tests__/fonts.test.ts` checks that every family `EMBER_TYPE` names is one
that gets loaded — a typo there falls back to the system font without throwing
or warning, which on a dark screen looks like a slightly different weight
rather than like a bug.

| Style | Family | Size / line | Tracking | Colour |
|---|---|---|---|---|
| `display` | PJS ExtraBold | 56 / 56 | **−2.8** | white |
| `subtitle` | Manrope Regular | 16 / 24 | — | `textSecondary` |
| `fieldLabel` | Manrope SemiBold | 14 / 20 | **+1.4** | `textSecondary` |
| `input` | Manrope Regular | 16 | — | white |
| `inputCentered` | Manrope Regular | 18 | — | white |
| `helper` | Manrope Regular | 12 / 16 | — | `textTertiary` |
| `chip` | Manrope Medium | 16 / 24 | — | set per state |
| `button` | PJS Bold | 18 / 28 | −0.45 | `onGradient` |
| `eyebrow` | Manrope Bold | 9.6 / 14.4 | **+2.88** | `accent` |
| `progress` | Manrope Bold | 16 / 24 | — | `textSecondary` |

The three bold tracking values are not optional. `display` at 56pt with default
tracking is a visibly different screen. `eyebrow` at 9.6pt is only legible
*because* of the 2.88 tracking — tighten it and it becomes a smudge.

Field labels are uppercased **in the string**, not with `textTransform`, so
what is in the code is what appears.

---

## Shape and size

- `EMBER_RADIUS.input` / `.card` = **32**. `APP_RADIUS` tops out at 24, which
  is why Ember has its own — a 64pt-tall control at radius 32 is a pill, and
  that is the whole look.
- `EMBER_CONTROL_HEIGHT` = **64**. Every input and the primary button. Well
  over the 44pt touch-target floor.
- Chips are `EMBER_RADIUS.pill` with 24px horizontal and 12px vertical padding.

Spacing comes from the existing `APP_SPACING` — Ember introduces no new scale.
Screen padding is 24; the gap between form sections is 40; between the headline
block and the form, 48.

---

## What is deliberately not a token

Anything used once stays inline at its call site. A token that has one consumer
is a rename, not a system, and it costs a jump to another file to read the
screen.
