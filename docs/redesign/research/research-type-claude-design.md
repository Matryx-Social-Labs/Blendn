# Research: Satoshi typography + Claude Design, for the Blendn redesign brief

Researched 2026-10-02. Sources are primary wherever possible. Three kinds of evidence are used:

- **[src]**: stated by the linked source, fetched today.
- **[measured]**: checked directly against the official font files (Fontshare download, `fontTools` 4.60) or against the Blendn client repo through the GitHub API (`Matryx-Social-Labs/Blendn@dev`).
- **UNVERIFIED**: inference, secondary-source claim or not testable today. Each one is marked inline.

---

## TL;DR

1. **Satoshi may be embedded in a commercial iOS/Android app.** ITF Free Font License v2.0 (17 Aug 2026) §01 says so directly. It is free, and attribution is optional.
2. **The catch is the repo, not the app.** The FFL forbids putting the font files in a "repository … publicly accessible servers". The Blendn client repo is **public** (GitHub API: `visibility: public`). Committing `Satoshi-*.otf` there would be redistribution. Keep the files out of git, or get written consent from ITF.
3. **Satoshi has no ₹ (U+20B9)** [measured, all 12 files]. It also has no no-break space (U+00A0). Every price in the app needs a deliberate treatment.
4. Satoshi's x-height is small: 0.484 em, against 0.54 for the current Manrope and 0.508 for SF Pro [measured]. At equal point size it reads about 10% smaller than today's body text. Size body up to 17 and keep text at 12 or above.
5. Satoshi's default figures are **proportional** (the 1 is half the width of the 0). `tnum` exists and React Native can reach it with `fontVariant: ['tabular-nums']`. The stylistic sets ss01 to ss04 **cannot** be reached from RN.
6. **Recommended pairing: Satoshi + Geist Mono** (OFL). Geist Mono has ₹ and monospaced digits, so it covers prices, times, counts and eyebrows. It ships as `@expo-google-fonts/geist-mono` and may be committed to a public repo. Skip a serif (YAGNI).
7. **Fallbacks:** General Sans, Switzer and Cabinet Grotesk are under the **same** ITF FFL. If the license blocks Satoshi, it blocks them too. The real escape is OFL: keep Plus Jakarta Sans, or use Geist or Figtree. All three have ₹ and `tnum`.
8. **Claude Design is real.** It is an Anthropic Labs product launched 2026-04-17 and is now in beta. Since 2026-09-16 it is also a "Design" template inside any Claude chat, and inside Claude Code via `/design` and `/design-sync`.
9. Claude Design can import a design system from GitHub, a local folder, Figma files, PDFs/decks, logos and fonts. It builds HTML/JS prototypes on a canvas and exports ZIP, PDF, PPTX or HTML, or sends to partner tools. It hands off to Claude Code as a bundle. It has **no native video or Lottie export** and **no version history**.
10. **Feed it a curated set of folders, never the local checkout root.** The main client checkout has git-ignored `upload-keystore.jks`, `upload_certificate.pem` and `.env` in its working tree [measured]. Build and publish the design system first, then do one project per flow.

---

# PART A: Typography

## A1. Satoshi license (ITF Free Font License, distributed on Fontshare)

**Which license.** The Fontshare API reports `license_type: "itf_ffl"` for Satoshi. The publisher is Indian Type Foundry and the designer is Deni Anggara. Source: https://api.fontshare.com/v2/fonts?q=satoshi [src]

The official download ships the license text as `License/FFL.txt`. It is headed **"ITF Free Font License (FFL) Version 2.0 - 17 Aug 2026"**. Source: https://api.fontshare.com/v2/fonts/download/satoshi [src, file read today]

The Fontshare web pages are a JS-only SPA and returned no text to a fetch: https://www.fontshare.com/fonts/satoshi and https://www.fontshare.com/licenses/itf-ffl. So the file inside the official zip is the text quoted below. **UNVERIFIED:** that the web page currently shows identical wording.

### Embedding in a commercial app: permitted

> "You are hereby granted a non-exclusive, non-assignable, non-transferable and terminable license to access, download, install, store and use the Font Software for personal or commercial purposes, free of charge and for an unlimited period of time" (§01)

> "You may use the Font Software in any media, including Print, Websites, Mobile or Desktop Applications, … at any scale and in any location worldwide." (§01)

> "**You may embed the Font Software in mobile or desktop applications** and digital documents for the uses permitted under this License." (§01)

> "Logos and wordmarks created using the Font Software may be registered as trademarks." (§01)

> "Where the Licensee is an organization, the Font Software may be installed, stored, copied and shared internally among its employees … Such internal sharing does not constitute redistribution" (§01)

### Attribution: optional

> "You may, but are not required to, identify or credit Indian Type Foundry or Fontshare in works created using the Font Software." (§01)

There is a conflict. The font files themselves (v2.000, © 2017–2021) carry an older license string in name-table ID 13 [measured]:

> "You agree to identify the ITF fonts by name and credit the ITF's ownership of the trademarks and copyrights in any design or production credits."

The FFL v2 text is the newer and governing document. A one-line credit costs nothing and removes the doubt either way.

### Restrictions that matter for Blendn

> "You may not modify, edit, adapt, … or otherwise alter the Font Software … This includes modifying or replacing glyphs, **subsetting, format conversion**, or altering font names…" (§02)

> "The Font Software may not … be distributed, … given away or otherwise made available to any other person or entity … This includes distributing the Font Software through another font website, font library, marketplace, **repository**, download service, application or platform, or by email, removable media, **publicly accessible servers**, file-sharing services…" (§02)

> "You may not provide the Font Software directly to external designers, agencies, **contractors**… Any third party wishing to use the Font Software must obtain their own copy directly from Fontshare" (§02)

> "You may not host, serve, embed or otherwise make the Font Software available for use by third parties through any website, application, online service, SaaS platform, **design tool**, template editor or similar service." (§02)

> "nothing in this Section 02 restricts the self-hosting, embedding or other use of the Font Software by the Licensee for the Licensee's own websites, applications or other permitted uses" (§02)

Two other provisions:

- **Custom terms.** §09 says ITF may be contacted for "exceptions to any restrictions … additional … characters or language extensions". This is the route for asking for ₹ or for public-repo consent.
- **Jurisdiction.** Governing law is India, with exclusive jurisdiction in the courts of Ahmedabad (§09).

**What changed in v2.** Secondary sources describing the earlier FFL say that self-hosting a webfont needed ITF's written consent (https://madegooddesigns.com/fontshare/, UNVERIFIED for the old text). v2.0 now says self-hosting "is permitted and recommended". Any guidance written before August 2026 may be stale.

### Implication for Blendn

- **Shipping Satoshi inside the IPA/APK is explicitly allowed.** No fee and no attribution are required. Still add "Satoshi © Indian Type Foundry" to the in-app licenses screen.
- **The public client repo is the problem.** The GitHub API reports `Matryx-Social-Labs/Blendn` as `"private": false, "visibility": "public"` [measured]. Committing the OTFs puts them on a "publicly accessible server" through a "repository", which §02 forbids. Today's fonts come from `@expo-google-fonts/*`; those are OFL, so there is no problem now. Three options:
  - **(a)** Git-ignore `assets/fonts/satoshi/`. Supply the files to builds from a private store: an EAS secret file, or the build Mac, since the client already ships via `eas build --local`. Mock fonts in Jest.
  - **(b)** Ask ITF for written consent under §09.
  - **(c)** Make the repo private. Memory notes this would bring back the Actions billing problem.

  The lazy and safe default is **(a)**.
- **No font tooling that subsets or converts.** That rules out pyftsubset and woff2 conversion of the files. Ship the official OTFs as they are.
- **Do not send the font files to an outside agency or contractor.** They must download their own copy from Fontshare.
- **Claude Design is a legal grey zone (UNVERIFIED reading).** Uploading Satoshi to Claude Design for the organisation's own design system looks like "internal sharing among employees". Publishing a Claude Design artifact "to anyone with the link" serves the font (inlined as a data URI) to the public through a third-party design tool. Keep Satoshi-bearing artifacts org-internal, or ask ITF.

---

## A2. Satoshi specs (measured from the official files)

Sources: Fontshare API metadata at https://api.fontshare.com/v2/fonts?q=satoshi [src]. Font files from https://api.fontshare.com/v2/fonts/download/satoshi, inspected with fontTools [measured].

| Item | Value |
|---|---|
| Version / dates | Files "Version 2.000", © 2017–2021. On Fontshare since 2021-03-12. |
| Static styles | Light 300, Regular 400, Medium 500, Bold 700, Black 900, **each with a true italic** (10 files). There is no SemiBold 600 and no ExtraBold 800. |
| Variable | `Satoshi-Variable.ttf` + `Satoshi-VariableItalic.ttf`. One axis, `wght` 300–900, with the default at 900. |
| Formats in zip | OTF (statics), TTF (variable), and WEB folder (TTF/WOFF/WOFF2/EOT + CSS) |
| Glyphs | 504 glyphs, 431 mapped code points, Latin only. ~150 languages listed (Fontshare API). **No Devanagari or Kannada.** |
| UPM / metrics | UPM 1000. x-height 484 (Regular) to 500 (Black). Cap height 716. Ascender 1010, descender −240, lineGap 100, `USE_TYPO_METRICS` on. |
| `₹` U+20B9 | **Missing, in all 12 files** |
| `’` U+2019 (for "Blend’n") | Present. `‘ “ ” – — … · • → ← ↗ ✓ × ° € £ $` are also present. |
| `ʼ` U+02BC (modifier apostrophe) | Missing. Use U+2019 for "Blend’n". |
| NBSP U+00A0 / thin U+2009 / figure U+2007 / narrow NBSP U+202F | **All missing** |
| Default figures | Proportional lining. Digit advances run 334 ("1") to 683 ("0"). |
| OpenType GSUB | `aalt case ccmp dlig dnom frac liga locl numr ordn pnum salt sinf ss01 ss02 ss03 ss04 subs sups tnum` |
| Stylistic sets | ss01: single-storey **a**, alternate **G**, ®. ss02: single-storey **g**. ss03: alternate **t**. ss04: alternate **Q**. |
| GPOS | `kern`, `mark` |

Fontshare's own description says the lining figures "have the same height as the uppercase letters." It also says "three other styles of numbers are included … tabular lining figures, as well as numerators and denominators." Source: Fontshare API `story` field [src].

Fontshare tags Satoshi for "Branding, Logos, Magazines". It does not tag it for UI [src].

### Small sizes on a phone (11–13 pt)

x-height in points at common UI sizes [measured]:

| Family | x-height/em | 11 pt | 12 pt | 13 pt | 16 pt | 17 pt |
|---|---|---|---|---|---|---|
| **Satoshi** | 0.484 | 5.3 | 5.8 | 6.3 | 7.7 | 8.2 |
| SF Pro (system) | 0.508 | 5.6 | 6.1 | 6.6 | 8.1 | 8.6 |
| Manrope (current body) | 0.540 | 5.9 | 6.5 | 7.0 | 8.6 | 9.2 |
| Plus Jakarta Sans (current display) | 0.536 | 5.9 | 6.4 | 7.0 | 8.6 | 9.1 |
| Geist Mono | 0.530 | 5.8 | 6.4 | 6.9 | 8.5 | 9.0 |

A specimen was rendered locally at @3x on a near-black ground, at 11/13/16 pt in Regular, Medium and Bold [measured; image not saved]. What it showed:

- The open, wide forms stay clean and distinct at 13 pt and above.
- At 11 pt, Regular looks noticeably smaller than the same size in Manrope or General Sans.
- **Capital I and lowercase l are near-identical plain stems**, so "Il" in names or codes is ambiguous. The "1" has a flag, and 0 and O are distinguishable.
- `₹` renders as a missing-glyph box in a renderer with no fallback.

Apple's HIG says: "avoid light font weights … Ultralight, Thin, and Light … can be difficult to see, especially when text is small". It also says that with a custom font "with a thin weight, aim for larger than the recommended sizes". Source: https://developer.apple.com/design/human-interface-guidelines/typography [src]

### Implication for Blendn

- **Price rendering must be designed, not left to fallback.** In RN, a missing glyph falls back to the system font. Both iOS SF Pro and Android Roboto contain ₹ [measured: macOS `SFNS.ttf` and Google's Roboto have U+20B9; that iOS's copy matches is inferred]. That means "₹499" would mix SF/Roboto's ₹ with Satoshi digits, and the weight may not match. Ways to avoid that:
  - Set prices in the numeric family (Geist Mono, which has ₹; see A3).
  - Or build a `<Price>` component that sets ₹ in an explicit nested `<Text>` in the system font at a matched weight.
  - Or ask ITF to add ₹ under §09.

  Keep any ₹ fix inside one shared component so callers never handle it.
- **Avoid NBSP in Satoshi text.** For example `Intl` output or `"₹ 499"`. Fallback supplies the space from another font, which is harmless visually but changes spacing. **UNVERIFIED:** whether the platform `Intl` time formats in Hermes emit U+202F before AM/PM on current iOS/Android. Test the event-time strings once.
- **Never use Light (300) for text below about 20 pt.** Use Regular for body and Medium or Bold for small labels.
- **Don't design with ss01 to ss04** (single-storey a/g). RN's `fontVariant` only accepts `small-caps`, `oldstyle-nums`, `lining-nums`, `tabular-nums` and `proportional-nums`. Source: https://reactnative.dev/docs/text-style-props [src]. Tell Claude Design this explicitly, because a web prototype *can* use `font-feature-settings` and would then show a look the app cannot ship.
- **Use the static OTFs, not the variable TTF.** Expo says: "Android and iOS support variable fonts in SDK 58 and later. On earlier versions, use static font files." Blendn is on SDK 57 (`expo ~57.0.25`). Source: https://docs.expo.dev/develop/user-interface/fonts/ [src]
- **Always set an explicit `lineHeight`.** Satoshi's natural line box is 1.35 em (1010 + 240 + 100 gap), which pads buttons and badges unevenly by default.

---

## A3. Is Satoshi alone enough? Pairing recommendation

**Satoshi alone can technically cover display, body and labels.** It has five weights, true italics, `tnum` and `case`. Two gaps push toward a second family: there is no ₹, and the figures are proportional by default with tabular figures only through a feature.

**Evidence of the pattern in production.** dub.co's live CSS declares `font-family: var(--font-satoshi)` for display, Inter for body, and `GeistMono` for code and numbers [measured: CSS fetched from https://dub.co today]. Search results also attribute Satoshi to Contra and Layers (https://fontpair.co/fonts/fontshare/satoshi); that is **UNVERIFIED**, because their HTML did not reference Satoshi when checked. Fonts In Use lists only branding and editorial uses, no mobile apps: https://fontsinuse.com/typefaces/238110/satoshi [src].

**Candidate companions** [measured: ₹ coverage and x-height from official files]:

| Role | Candidate | License | ₹ | Notes |
|---|---|---|---|---|
| **Numeric/eyebrow (recommended)** | **Geist Mono** | OFL ([METADATA](https://raw.githubusercontent.com/google/fonts/main/ofl/geistmono/METADATA.pb)) | yes | x-height 0.53. Monospaced digits by construction. `@expo-google-fonts/geist-mono@0.4.3` is on npm, so it can sit in the public repo. |
| Numeric alt | IBM Plex Mono | OFL | yes | `@expo-google-fonts/ibm-plex-mono` exists |
| Numeric alt | Space Mono | OFL | yes | quirkier. Already an old Expo-template asset in the client. |
| Numeric (reject) | JetBrains Mono, DM Mono | OFL | **no** | — |
| Editorial serif (optional) | Fraunces | OFL | yes | variable, expressive |
| Editorial serif (optional) | Zodiak, Sentient, Boska (Fontshare) | ITF FFL (same repo problem) | yes | Gambetta has **no** ₹ |
| Editorial (reject) | Instrument Serif | OFL | **no** | — |

### Recommendation

**Satoshi + Geist Mono.** Use Geist Mono only for the `numeric` and eyebrow roles: prices, times, dates, countdowns, counts and ticket codes. It reads as "ticket stub / door list", which suits nightlife. It also fixes ₹ and tabular alignment without per-call `fontVariant`.

Two rules for mixing the two families in one line:

- Geist Mono's x-height is about 10% taller than Satoshi's, so set it about 1 pt smaller.
- Never use more than two families. Apple's HIG says: "Minimize the number of typefaces you use" (https://developer.apple.com/design/human-interface-guidelines/typography) [src].

**No serif now.** Add one only when a specific editorial surface exists, such as a recap or share card. Skipped until then.

### Implication for Blendn

Tell Claude Design about the two families and the roles each one may take. Forbid any third family. Make every price use the numeric role.

---

## A4. Fallbacks if Satoshi's licensing blocks it

All values are measured from official files. Fontshare zips come from `https://api.fontshare.com/v2/fonts/download/<slug>`. Google Fonts files come from https://github.com/google/fonts.

| Family | License | ₹ | `tnum` / default digits | Weights | Variable | x-height | Character vs Satoshi |
|---|---|---|---|---|---|---|---|
| **Satoshi** | ITF FFL v2 | **no** | yes / proportional | 300–900 + italics | yes | 0.484 | baseline |
| General Sans | **ITF FFL v2 (same)** | yes | **no** / proportional | 200–700 + italics (no Black) | yes | 0.527 | closest sibling, softer, larger x-height |
| Switzer | **ITF FFL v2 (same)** | **no** | no feature, digits **tabular by default** | 100–900 + italics | yes | 0.531 | neutral Swiss, less personality |
| Cabinet Grotesk | **ITF FFL v2 (same)** | yes | **no** / proportional | 100–900, **no italics** | yes | 0.480 | display-only, tight and quirky. Not a body face. |
| Plus Jakarta Sans (current) | OFL | yes | yes | 200–800 + italics | yes | 0.536 | already shipped, friendlier |
| Geist | OFL | yes | yes | 100–900 | yes | 0.530 | close modernist alternative |
| Figtree | OFL | yes | yes | 300–900 | yes | 0.500 | geometric, warm |

### Implication for Blendn

General Sans, Switzer and Cabinet Grotesk are **not** escapes from a licensing problem, because they carry the identical FFL v2. If Satoshi is blocked, choose an OFL face:

- **Plus Jakarta Sans** costs nothing; it is already loaded.
- **Geist** is the closest Satoshi-like OFL option, and Geist Mono gives it a family match.

General Sans is the only Fontshare option that fixes ₹. It does not fix tabular figures.

---

## A5. Mobile type-scale practice (2026) and a proposed Blendn scale

### iOS Dynamic Type, default ("Large") size

Source: Apple HIG Typography → Specifications, fetched via https://developer.apple.com/tutorials/data/design/human-interface-guidelines/typography.json [src].

| Style | Weight | Size / leading (pt) | Emphasized weight |
|---|---|---|---|
| Large Title | Regular | 34 / 41 | Bold |
| Title 1 | Regular | 28 / 34 | Bold |
| Title 2 | Regular | 22 / 28 | Bold |
| Title 3 | Regular | 20 / 25 | Semibold |
| Headline | Semibold | 17 / 22 | Semibold |
| Body | Regular | 17 / 22 | Semibold |
| Callout | Regular | 16 / 21 | Semibold |
| Subhead | Regular | 15 / 20 | Semibold |
| Footnote | Regular | 13 / 18 | Semibold |
| Caption 1 | Regular | 12 / 16 | Semibold |
| Caption 2 | Regular | 11 / 13 | Semibold |

More from the same page:

- **Default and minimum sizes on iOS: 17 pt default, 11 pt minimum.**
- AX5 reaches Body 53/62 and Large Title 60/70.
- HIG changelog: "December 16, 2025: Added emphasized weights to the Dynamic Type style specifications".
- SF Pro tracking as used by the system: 11 pt +0.06; 13 pt −0.08; 15 pt −0.23; 17 pt −0.43; 20 pt −0.45; 22 pt −0.26; 28 pt +0.38; 34 pt +0.40. These values are SF-specific and should not be copied to Satoshi.
- "Implement accessibility features for custom fonts. System fonts automatically support Dynamic Type … and respond when people turn on accessibility features, such as Bold Text. If you use a custom font, make sure it implements the same behaviors."

**iOS 26 (Liquid Glass).** WWDC25 session 356, "Get to know the new design system", says:

> "Typography has been refined to strengthen clarity and structure, now bolder and left-aligned to improve readability in key moments like alerts and onboarding."

Source: https://developer.apple.com/videos/play/wwdc2025/356/ [src, transcript]

Apple's newsroom adds: "the San Francisco typeface has been uniquely crafted to dynamically scale the weight, width, and height of each numeral" on the Lock Screen clock. Source: https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/ [src]

The HIG Dynamic Type size tables themselves did **not** change for iOS 26 [src: the table above is current]. Large titles in navigation bars have long been left-aligned. The iOS 26 change is bolder, left-aligned type in alerts and onboarding.

### Android Material 3 type scale, baseline and emphasized (M3 Expressive)

Source: androidx `TypeScaleTokens.kt` at https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt [src].

The m3.material.io page (https://m3.material.io/styles/typography/type-scale-tokens) is JS-only and could not be fetched.

| Role | Size / line (sp) | Tracking | Weight | Emphasized weight |
|---|---|---|---|---|
| Display L/M/S | 57/64, 45/52, 36/44 | −0.2, 0, 0 | Regular | Medium |
| Headline L/M/S | 32/40, 28/36, 24/32 | 0 | Regular | Medium |
| Title L/M/S | 22/28, 16/24, 14/20 | 0, 0.2, 0.1 | Regular, Medium, Medium | Medium, Bold, Bold |
| Body L/M/S | 16/24, 14/20, 12/16 | 0.5, 0.2, 0.4 | Regular | Medium |
| Label L/M/S | 14/20, 12/16, 11/16 | 0.1, 0.5, 0.5 | Medium | Bold |

The emphasized set is the same sizes, one weight step up. **Android 14** scales fonts up to 200%, non-linearly:

> "large text doesn't scale at the same rate as smaller text"

The same page says "Always define lineHeight using sp", and "Don't use sp units for padding". Source: https://developer.android.com/about/versions/14/features#non-linear-font-scaling [src]

### React Native specifics

Sources: https://reactnative.dev/docs/text, https://reactnative.dev/docs/text-style-props, https://reactnative.dev/docs/pixelratio, https://reactnative.dev/docs/accessibilityinfo [src]

- `allowFontScaling` defaults to `true`.
- `maxFontSizeMultiplier` caps growth. Its values: `null/undefined` inherits, `0` means no max, `>= 1` sets the cap.
- `PixelRatio.getFontScale()` returns the current scale factor.
- `AccessibilityInfo.isBoldTextEnabled()` and the `boldTextChanged` event exist, iOS only. This is how to honour Bold Text with a custom font.
- `fontVariant: ['tabular-nums']` is the only route to `tnum`. **UNVERIFIED on device:** that iOS applies it to Satoshi. CoreText usually maps it to the font's `tnum`. Check one countdown on iOS and on Android.

### The Android custom-font-weight pitfall

React Native's documentation describes `fontWeight` like this:

> "Not all fonts have a variant for each of the numeric values, in that case the closest one is chosen."

That is only true when the family has those weights registered. Expo's documentation covers what happens otherwise:

> "If you provide only the font file paths in an array, the file name becomes the font family name on Android."

Each weight is then its own family, and `fontWeight` does nothing.

Expo's documented fix is the config plugin's `android.fonts[].fontDefinitions` with a `weight` per file. It embeds an XML font family so that `{fontFamily:'Satoshi', fontWeight:'700'}` works. Source: https://docs.expo.dev/develop/user-interface/fonts/ and https://docs.expo.dev/versions/latest/sdk/font/ [src].

On iOS, "the font family name is always taken directly from the font file". Satoshi's naming is split [measured]:

- Regular, Italic, Bold and BoldItalic have name ID 1 = "Satoshi".
- Light, Medium and Black have ID 1 = "Satoshi Light" / "Satoshi Medium" / "Satoshi Black", with typographic family ID 16 = "Satoshi".
- PostScript names are `Satoshi-Regular`, `Satoshi-Medium`, and so on.

**UNVERIFIED:** that iOS groups all five weights under one "Satoshi" family for `fontWeight` selection.

**Blendn already solves this.** `lib/theme.ts` and `lib/fonts.ts` on the client's `dev` branch load each weight as its own family key. `__tests__/fonts.test.ts` checks the `TYPE` names against the loaded keys [measured via GitHub API]. Keep that pattern: register `Satoshi-Regular`, `Satoshi-Medium`, `Satoshi-Bold` and `Satoshi-Black` as keys, and drop Light. Do not switch to `fontWeight`.

### Current Blendn scale

Client `lib/theme.ts@dev` [measured]. Nine roles are defined; screens pick a role, never a size:

| Role | Current setting |
|---|---|
| display | PJS ExtraBold 34/40, −1 |
| title | PJS Bold 24/30, −0.4 |
| heading | PJS Bold 20/26, −0.2 |
| button | PJS Bold 16/24 |
| body | Manrope Regular 16/24 |
| bodyStrong | Manrope SemiBold 16/24 |
| meta | Manrope Regular 13/18 |
| label | Manrope Bold 12/16, +1.2 |
| caption | Manrope SemiBold 11/14 |

`MAX_FONT_SCALE` is 1.2 for display/title, 1.3 for button/label/caption, and 2 for heading/body/bodyStrong/meta. The structure is sound; keep it.

### Proposed Blendn scale (Satoshi + Geist Mono)

`letterSpacing` is in pt, as in RN. Line heights are absolute.

| Role | Family key (weight) | Size / line | Tracking | Case | Max scale | Used for |
|---|---|---|---|---|---|---|
| `display` | Satoshi-Bold (700) | 34 / 40 | −0.7 (≈ −2%) | Sentence | 1.2 | one per screen ("Tonight", "The basics") |
| `title` | Satoshi-Bold | 24 / 30 | −0.4 (≈ −1.5%) | Sentence | 1.2 | card/sheet titles, event name on detail |
| `heading` | Satoshi-Bold | 20 / 26 | −0.2 | Sentence | 2 | section heads |
| `button` | Satoshi-Bold | 16 / 20 | 0 | Sentence | 1.3 | actions in fixed ≥ 44 pt boxes |
| `body` | Satoshi-Regular (400) | **17 / 24** | 0 | Sentence | 2 | reading text, inputs (iOS default body 17; offsets the small x-height) |
| `bodyStrong` | Satoshi-Medium (500) | 17 / 24 | 0 | Sentence | 2 | names, row titles, chips (Medium = brand-manual weight) |
| `meta` | Satoshi-Regular | **14 / 20** | 0 | Sentence | 2 | venue, helper text (13 in Satoshi ≈ 12 in Manrope) |
| `label` (eyebrow) | Geist Mono Medium (500) | 11 / 16 | +0.6 | UPPER | 1.3 | eyebrows, tags, field labels |
| `caption` | Satoshi-Medium | **12 / 16** | +0.1 | Sentence | 1.3 | tab labels, badges. **Floor: 12** for Satoshi (HIG floor is 11, but Satoshi 11 ≈ SF 10.5) |
| `numeric` | Geist Mono Medium | inherits role size −1 pt | 0 | — | per role | prices (₹), times, dates, counts, codes |
| `numericDisplay` | Geist Mono Bold (700) or Satoshi-Black + `tabular-nums` | 40 / 44 | −1.0 | — | 1.1 | countdown, ticket price hero |
| `moment` (optional) | Satoshi-Black (900) | 44 / 48 | −1.3 (≈ −3%) | Sentence | 1.1 | at most once per flow ("You're in.") |

Rules that come with the scale:

- **Line-height ratios.** Display 1.15–1.2. Title and heading 1.25–1.3. Body 1.4. Small text 1.33–1.45.
- **Tracking.** Negative tracking scales with size. Only uppercase eyebrows get positive tracking.
- **Weights in use: Regular, Medium, Bold and Black.** Drop Light.
- **Bold Text.** When `isBoldTextEnabled()` is on, step body from Regular to Medium and bodyStrong from Medium to Bold.
- **Accessibility test.** At AX sizes, verify 3 key screens: event list, event detail and chat.

### Implication for Blendn

The token *structure* stays as it is; only the values change. That is a small diff in `lib/theme.ts`, `lib/fonts.ts` and the font test. Hand Claude Design the table above as the type spec, so it does not invent its own.

---

# PART B: Claude Design (Anthropic)

## B1. What it is

It is an Anthropic Labs product. From the launch announcement (Apr 17, 2026):

> "Today, we're launching Claude Design, a new Anthropic Labs product that lets you collaborate with Claude to create polished visual work like designs, prototypes, slides, one-pagers, and more."

> "Claude Design is powered by our most capable vision model, Claude Opus 4.7, and is available in research preview for Claude Pro, Max, Team, and Enterprise subscribers."

Source: https://www.anthropic.com/news/claude-design-anthropic-labs [src]

**Status today.** The help center says it is "available in beta on Pro, Max, Team, and Enterprise plans. It's on by default on Pro, Max, and Team plans. On Enterprise plans, it's off by default". Source: https://support.claude.com/en/articles/14604416-get-started-with-claude-design [src]

**Since 2026-09-16 it also runs inside ordinary chats.** The release notes say:

> "Claude Design works inside your conversations with all of its features, including on-canvas editing and importing your design system."

Source: https://support.claude.com/en/articles/12138966-release-notes [src]

**Plans.** Artifacts are on every plan including Free, but "Templates (Claude Design, Claude Slides, and Claude Docs) are in beta on paid plans only." Source: https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them [src]

**Where to use it:**

- claude.ai/design, the standalone app
- any chat, via Output → Design
- the Artifacts tab
- Claude Code, via `/design` and `/design-sync`
- iOS/Android apps, view only [src: get-started article]

**Usage limits.** "Claude Design counts toward the same usage limits as the rest of Claude … there's no separate Claude Design allowance." Source: get-started article [src]

**Claude Code `/design`.** It was a research preview in Week 34 (Aug 17–21, 2026):

> "The /design skill brings Claude Design's artboard workflow into the CLI and Claude Code Desktop, built on artifacts. Run it with a brief and Claude publishes a canvas of editable artboards for your UI."

Source: https://code.claude.com/docs/en/whats-new/2026-w34.md [src]

It "require[s] Claude Code v2.1.265 or later". Source: https://code.claude.com/docs/en/artifacts.md [src]

### Implication for Blendn

Pro or Max is enough. The repo owner can work either in claude.ai/design or from Claude Code inside the client repo. There is no separate quota, so a 36-screen redesign draws on the same limits as coding work. Plan the work so it is not all in one week.

---

## B2. Inputs, and how it builds a design system

### Accepted inputs

From the announcement:

> "Start from a text prompt, upload images and documents (DOCX, PPTX, XLSX), or point Claude at your codebase. You can also use the web capture tool to grab elements directly from your website" [src: announcement]

From the design-system setup article:

> "Ask Claude to build a design system from your connected apps, uploaded files, **Figma files**, decks, logos, and fonts. This works best for brand design systems with fonts, colors, and guidelines."

Source: https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design [src]

From the get-started article:

> "Bring in one or several design systems from a **GitHub repo**, design files, raw uploads, or your **local codebase** using the /design-sync command in Claude Code."

Source: get-started article [src]

The Claude Academy tutorial adds:

> "Claude Design allows you to both import from Github and attach via local directories via the Import button."

Source: https://academy.claude.com/tutorials/using-claude-design-for-prototypes-and-ux [src]

### From a codebase, Claude reads

> "Component structure … Styling and theming — Your color system, spacing scale, typography, and CSS approach … Framework patterns … File organization" [src: Academy]

### Size guidance

> "If your codebase is a monorepo or if you're working on a codebase with more than 100 people actively contributing, we recommend linking the specific package or directory … Chrome doesn't handle attaching huge file trees well … attaching folders within your repo, such that you do not include the .git folder, node_modules/ folder, etc." [src: Academy]

The help center adds:

> "Large codebases: Consider linking very large repositories from Claude Code to avoid lag or browser issues."

Source: get-started article [src]

**File limits are not documented for Claude Design itself.** General Claude limits:

- Chat uploads: 500 MB per file, 20 files per chat.
- PDFs: "Claude analyzes both text and visual elements … in PDFs of 100 pages or fewer. For PDFs from 101 to 1000 pages, Claude processes text only".
- Project files: 30 MB each.

Source: https://support.claude.com/en/articles/8241126-upload-files-to-claude [src]. **UNVERIFIED** that these limits apply inside Claude Design.

### What the generated design system contains

> "Color palette … Typography: Font families, sizes, and weights. Components: Buttons, cards, navigation elements … Layout patterns: Spacing, grid systems, and page structures."

> "When you're happy with the design system, turn on the 'Published' toggle. After publishing, projects created from the Claude Design home screen in your organization use your design system instead of the default."

Updates go through the "Remix" chat. Source: setup article [src]

Claude also "checks its own output against your design system, and makes corrections before you see them". Source: get-started article [src]

The setup article's tips: "Include real examples, not just specs. A finished landing page … tells Claude more about your brand's feel than a color palette alone." And: "Iterate. If the first extraction doesn't capture your brand well, try uploading additional or different assets." [src]

### `/design-sync` (Claude Code to Claude Design)

The setup article:

> "If your design system already exists as React components, run /design-sync in Claude Code. It reads your tokens and components directly, and works best for product design systems in code." [src]

A third-party walkthrough dated 2026-09-28 describes the mechanics: it needs a React component library entry file, a compiled CSS file with inlined tokens, and `extraFonts`, all set in `.design-sync/config.json`. It uploads "a single bundle with every component, plus the stylesheet, the fonts and a copy of React". The walkthrough adds: "The mirror is a snapshot and not a live link." Source: https://nitayneeman.com/blog/how-to-sync-a-design-system-with-claude-design/ (UNVERIFIED secondary)

### Fonts in Claude-generated pages

> "Claude can load a typeface from Google Fonts, the one external font source an artifact page can load from. Claude inlines any other typeface as a @font-face data URI"

Source: https://code.claude.com/docs/en/artifacts.md [src]

Satoshi is not on Google Fonts, so it must be uploaded. Geist Mono loads from Google Fonts directly.

### Implication for Blendn

- **Blendn is React Native, not a React web component library.** `/design-sync` is built for React-web bundles, and RN `View`/`Text` components will not render as-is. **UNVERIFIED:** whether the client's existing `react-native-web ^0.21.2` setup and `web` script would let it work. Don't rely on `/design-sync`.
- Build the design system from:
  - the brand manual PDF (keep it ≤ 100 pages so the visuals are read)
  - `lib/theme.ts`
  - `docs/DESIGN_SYSTEM.md`
  - real screenshots of the current app
  - the font files
  - the type table in A5
- Claude Design will re-express the tokens as HTML/CSS. That is fine, because the handoff goes back to Claude Code, which writes the RN code.

---

## B3. Outputs, handoff and motion

**Canvas and refinement.** Claude Design pairs a chat with a canvas. You refine through chat, inline comments, direct on-canvas edits, and "adjustment knobs" / "custom sliders (made by Claude)" for spacing, color and layout [src: announcement, get-started]. The `/design` skill produces "artboards on one canvas … You can export each artboard as PNG or PDF" [src: artifacts doc].

**Export list (verbatim, get-started article):**

> "Download as .zip · Export as PDF · Export as PPTX · Export to Google Slides (available only at claude.ai/design) · Export as standalone HTML · Send to … Adobe Experience Manager, Adobe for Creativity, Adobe Journey Optimizer, Base44, Canva, Gamma, HubSpot, Hyperframes, Lovable, Miro, Netlify, Replit, v0, Vercel, and Wix · Handoff to Claude Code (Send to local coding agent / Send to Claude Code Web)" [src]

There is no Figma export in that list.

**Handoff to Claude Code:**

> "By default, we bundle the project's design files, chat, and a README which tells the model to interpret the designs for download, and give you a prompt you can paste into local Claude Code … that includes the bundle's URL." [src: Academy]

The tutorial's handoff tip:

> "Flag edge cases. Before handing off, ask Claude to show how the design handles empty states, error states, loading states, and different data volumes." [src: Academy]

**Mobile frames.** Device frames and iOS/Android sizes are **not documented** by Anthropic.

- One early user asked for an "iOS-style, 9:19.5 (iPhone frame)" with a 9:41 status bar and home indicator. They got 5 navigable screens with bottom sheets and "0.96× scale" tap feedback. A handoff then produced an Expo project. Source: https://markusstoeger.com/en/masterai/claude-design-uebung-5-mobile-app (UNVERIFIED secondary)
- Another reviewer reports "No device frames or mobile-specific capabilities" as built-ins. Source: https://pietromontaldo.substack.com/p/claude-design-full-tutorial (secondary)

Treat frames as something you must specify in the prompt.

**Motion.** Prototypes are HTML/CSS/JS. The announcement lists "Frontier design: Anyone can build code-powered prototypes with voice, video, shaders, 3D and built-in AI" [src]. Reviewers report Tweaks sliders that include "animation timing" (https://consulting.sva.com/insights/claude-design-a-quick-start-guide, secondary).

- **No native MP4 export.** KDnuggets: "Cannot export finished output as video" (https://www.kdnuggets.com/a-beginners-guide-to-working-with-claude-design). Third-party renderers fill the gap (https://www.claudevideoexport.com/blog/how-to-make-claude-design-animations-export-ready, vendor).
- **The official path to video is "Send to Hyperframes".** HeyGen's HyperFrames renders HTML + GSAP timelines to MP4. Sources: https://hyperframes.heygen.com/guides/claude-design-send-to-hyperframes and https://github.com/heygen-com/hyperframes/blob/main/docs/guides/claude-design-hyperframes.md [src, partner docs]
- **No Lottie export** is documented anywhere. Treat it as absent (UNVERIFIED absence).

**Splash animation.** Expo's native splash is a static image with an optional fade. The docs say:

> "SplashScreen provides an out-of-the-box fade animation … fade … Supported platforms: iOS … If you prefer to use custom animation, see the with-splash-screen example"

Source: https://docs.expo.dev/versions/latest/sdk/splash-screen/ [src]

So a "launch animation" is an in-app animated view that takes over from the static native splash.

### Implication for Blendn

Claude Design **can** design the splash or launch animation as a CSS/JS prototype with exact timings and easing. That gives a spec, not a shippable asset. Two ways to ship it:

- **(a)** Have Claude Code re-implement it with `react-native-reanimated 4.5.1`, which is already a client dependency. Recommended: no new dependency.
- **(b)** Author a Lottie in another tool and add `lottie-react-native`, which is not installed. Skipped until a designer actually supplies an After Effects file.

The static native splash frame must match the animation's first frame exactly.

---

## B4. Prompting best practices

### Official guidance

Source: get-started article [src]

- **Prompt anatomy:** "A good prompt includes the goal …, the layout …, the content …, and the audience". It also says "Claude will also ask clarifying questions".
- **Tips (verbatim headings):** "Import a complete design system" · "Start simple, then layer in complexity" · "Be specific in your feedback ('Tighten the spacing between form fields to 8px')" · "Reference your design system … 'Use the Primary Button component'" · "Think about responsiveness early" · "Ask for variations … 2–3 options" · "Ask Claude for feedback … accessibility, contrast ratios, information hierarchy".
- **Which tool for which change:** "Use comments for targeted, component-level changes … Use chat for structural changes … Edit directly for quick visual and aesthetic changes."
- **Exploring alternatives:** "Save what we have and try a completely different approach," because "Claude Design doesn't have version history yet."
- **Rollout:** design system first, then broader access. "Turning on Claude Design without a design system in place means your team gets functional but generic output." Source: https://support.claude.com/en/articles/14604406-claude-design-admin-guide-for-team-and-enterprise-plans [src]

### Known weaknesses

Official list [src: get-started]:

- inline comments sometimes disappear (paste them into chat instead)
- large codebases lag
- "chat upstream error" (open a new chat tab)
- multi-person editing is "basic"
- "Design system import is only as good as its source. A messy codebase … will show up in the output."
- no version history

### Early-user write-ups (secondary, dated)

- **Jeff Su, 2026-07-21.** Build the design system with "Opus model set to Max effort". Keep standing instructions in a project `CLAUDE.md`; "stay in the same project and start a new chat so it still loads the project's CLAUDE.md". Use Tweaks "when a single decision touches every slide". Source: https://www.jeffsu.org/claude-design-tutorial/
- **Pietro Montaldo, 2026-07-01.** "A design system in Claude Design is nothing more than a skill." Settle the content first, then let Claude Design apply the system. Tweaks are "a small panel of sliders … with no re-render". PDF and HTML exports are clean; PPTX and Canva degrade. Source: https://pietromontaldo.substack.com/p/claude-design-full-tutorial
- **KDnuggets, 2026-07-30.** Handoff to Claude Code "works well; that direction is strong. The reverse … is noticeably weaker". Refinement shows "diminishing returns after initial rounds". Source: https://www.kdnuggets.com/a-beginners-guide-to-working-with-claude-design
- **Moda (a competitor), 2026-09-09.** Claude "tends toward generic, conservative designs" without strong guidance. Source: https://moda.app/blog/claude-design

### Implication for Blendn

Front-load specifics: tokens, the type table, component names, the screen inventory and the states. Give it real screenshots and reference apps. Lock decisions in the design system or the project `CLAUDE.md` rather than repeating them in chat. Keep one editor at a time, and save before every pivot.

---

## B5. How Blendn should feed it

### 0. Decide the font path first

This is the Part A question: Satoshi via a git-ignored private store, or an OFL fallback.

Upload only the 4 static OTFs actually used (Regular, Medium, Bold, Black) plus Geist Mono. Keep Satoshi artifacts **org-internal**: no "anyone with the link" sharing. See A1.

### 1. What to upload

**Do not attach the local checkout root.** `the local client checkout` contains git-ignored `upload-keystore.jks`, `upload_certificate.pem` and `.env` in its working tree [measured]. **UNVERIFIED** whether local attach honours `.gitignore`.

Prefer one of these:

- GitHub import of the public repo, which contains only committed files.
- Attaching only these folders from a fresh `origin/dev` worktree.

**Include:**

- `lib/theme.ts`, `lib/fonts.ts`
- `components/` (95 files)
- `app/` (51 files, the routes)
- `docs/DESIGN_SYSTEM.md`, `docs/api/DESIGN_HANDOFF.md`
- `app.json` (app name, splash colours)

**Exclude:**

- `android/`, `ios/` (includes `android/app/debug.keystore`)
- `node_modules/`, `.git/`, `package-lock.json`
- `__tests__/` (160 files), `.maestro/`, `scripts/`, `.eas/`, `.github/`
- `.agents/`, `.continue/`, `.qoder/`, `.windsurf/`, `skills/` (a third-party "refero-design" skill that would bias the look)
- `.idea/`, `artifacts/` (old debug screenshots), `ROADMAP.md`, `tasks/`, `SECURITY_RELIABILITY_BACKLOG.md`
- any `.env*`

**Upload as files:**

- Brand manual PDF, ≤ 100 pages. Split it if longer, so the visuals are analysed.
- Logo SVG/PNG.
- Font files.
- 8–12 current-app screenshots of the screens you like *and* the ones you don't, labelled.
- 3–6 reference-app screenshots, each with one sentence on what to take from it.

### 2. Order of prompts

1. **Design-system project** (claude.ai/design → organisation onboarding, or chat → Design). Inputs: everything above. Ask for:
   - tokens: colour (dark-only), spacing, radius, elevation
   - the A5 type scale **verbatim**
   - a component sheet named the way the code names things (`Button`, `Chip`, `EventCard`, `AvatarStack`, `Price`, `TabBar`, `Sheet`, `Input`, `Toast`, `EmptyState`)
   - one "kitchen-sink" screen

   Validate it with 2–3 test prompts, record decisions in the project `CLAUDE.md`, then **publish**.
2. **Direction pass, once.** On the single most important flow (event discovery → event detail), ask for 2–3 directions. Pick one. Fold the winning traits back into the design system with Remix.
3. **One project per flow**, about 6–8 projects of 4–6 screens each. Examples: onboarding/auth, discovery, event detail/RSVP/check-in, chat/DMs, profile/friends/crews, venues, settings/legal, Blendn+ paywall (IAP-only, per product rulings). Each project gets:
   - the published design system
   - a screen inventory: purpose, data shown, actions, and **states** (empty, loading, error, offline, AX text size)
   - an explicit frame. "iPhone frame 402×874 pt with 9:41 status bar and home indicator; one Android check at 412 dp wide." These frame sizes are UNVERIFIED; take the current values from Apple/Android device specs.
4. **Splash/launch motion** as its own small project. Ask for timings and easing as numbers. The first frame must equal the static splash.
5. **Hand off per flow** with "Send to local coding agent". Prefix the pasted prompt with:

   > React Native 0.86 / Expo SDK 57; use `lib/theme.ts` roles (`TYPE`, `SPACE`, `EMBER`), never raw sizes; no web-only CSS (no `font-feature-settings`, hover, `position: fixed`); prices through the `Price` component.

### 3. Keeping ~36 screens consistent

- Everything shared lives in the **published design system**, not in chat.
- Every prompt names components by their design-system names.
- Use **Tweaks** for any global decision, such as accent intensity or density, so it is flipped once everywhere.
- Keep a one-page "decisions log" in each project's `CLAUDE.md` (Jeff Su's pattern).
- Re-attach the same 3 "anchor" screens to every flow project as visual references.
- "Save what we have" before any pivot, and export the approved HTML ZIP of each flow, because there is no version history.
- One editor at a time; multi-person editing is unreliable.
- At the end, run a "review all screens against the design system for drift in type roles, spacing and colour" pass.
- **Alternative to the web UI:** run `/design <brief>` from Claude Code in a fresh client worktree (v2.1.265+). It reads the local design system (`CLAUDE.md` or a theme file) and publishes an artboard canvas, which avoids repo-upload lag. It is a research preview, so use it for single screens or variants, not as the system of record.

### Implication for Blendn

The brief should be split in two. Brief 1 builds the design system (fonts, tokens, type table, components). Brief 2 is the per-flow screen inventory. Brief 2 is pasted flow by flow, never as one 36-screen prompt.
