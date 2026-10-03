# Research: Android for the Blendn redesign: Material 3 Expressive, translucency, haptics, platform conventions

Written 2026-10-02 for the Claude Design brief. This is the Android companion to `research-ios-glass.md`, and the two surface maps agree. The tokens used below (`#0F0E0E` bg, `#211F1F` surfaceSunken, `#272525` surface, the 8/16/24/32/pill radii) come from that file.

**How to read the citations**
- Every claim carries a link. `[Sn]` points into the source list at the bottom.
- **UNVERIFIED** means no primary source was found, or the claim is an inference. These are flagged inline.
- **Derived** means I computed the value from a sourced one, for example converting a spring to Reanimated parameters.
- **Recommendation** means design judgement, not a sourced fact.
- Some m3.material.io and developer.apple.com pages render with JavaScript, and the fetch tool got only their titles. Where a claim relies on a search-engine snippet of such a page, it says **(snippet)**. Where I could, I went to the source code behind the spec instead: androidx Compose tokens, MDC docs, and expo module source.

**What the client repo shows** (`the local client checkout`, `origin/dev` @ `54481d2`, 2026-10-01) [S100]:
- **Versions.** `expo ~57.0.25`, `react-native 0.86.3`, `react-native-reanimated 4.5.1`, `expo-blur ~57.0.3`, `expo-haptics ~57.0.3`, `react-native-screens ~4.26.0`, `expo-device ~57.0.2`. `expo-battery` and `@shopify/react-native-skia` are **not** installed.
- **Haptics.** Every haptic on Android goes through `impactAsync`, `notificationAsync` or `selectionAsync`. That includes `components/motion/ScalePress.tsx`, which fires `selectionAsync()` on press. There are **zero** calls to `performAndroidHapticsAsync`.
- **Sheets.** `components/motion/RisingSheet.tsx` and `components/ActionTray.tsx` are RN `<Modal>`s, and two router screens use `presentation: 'modal'`.
- **`app.json`.**
  - It has no `android.predictiveBackGestureEnabled`, so predictive back is **off**. Expo writes `android:enableOnBackInvokedCallback="false"` [S73].
  - `adaptiveIcon` has no `monochromeImage`.
  - The splash is the static `monogram-gradient.png` at 118 wide on `#0F0E0E`.
  - `userInterfaceStyle: "dark"`.

---

## TL;DR

1. **Take M3 Expressive's mechanics, not its look.** Four things are worth porting:
   - The spring tokens. They are real numbers (below), and they convert exactly to Reanimated.
   - Shape change on press: a round button squares off to an 8–16dp corner.
   - The emphasized type rule: same size, heavier weight, for selected and hero states.
   - A morphing loading indicator for waits under 5 s.
   Skip Material colour roles, dynamic colour, and the stock components. Google's own research says expressive design wins with **18–24-year-olds (87% preference)** [S1]. That is Blendn's crowd.
2. **On Android, "glass" means one shared real blur behind two chrome surfaces on capable devices, and a tinted surface everywhere else.**
   - Blur only the **tab bar** and the **scrolled top bar**, both fed by one `BlurTargetView` (expo-blur ≥55, Dimezis BlurView 3.1.0 on the RenderNode/RenderEffect path, API 31+) [S33][S38].
   - Never blur sheets. Blendn's sheets are RN `<Modal>`s, which live in a separate window that expo-blur cannot sample [S36]. Never blur small pills over photos either.
3. **Gate blur at runtime.** Read `WindowManager.isCrossWindowBlurEnabled()` (API 31+) [S29]. One boolean covers three cases:
   - the GPU or OEM doesn't support it,
   - **Battery Saver** is on,
   - the Android 16 QPR2 accessibility toggle **"Reduce blur effects"** is on. The toggle replaces the "allow window-level blurs" switch; that it flips this API is an inference, UNVERIFIED on device [S26].
   Add the static tiering from `expo-device` (API ≥31, RAM) and a server-side kill switch.
4. **The Android fallback must look finished, not degraded.** Use a near-opaque tinted surface, a 1px top hairline, a baked noise texture, and pre-rendered orbs. No live blur, and no full-screen translucent layers, because alpha is the main source of overdraw [S51].
5. **Blendn's Android haptics today are the "buzzy" kind Google says to drop.** `expo-haptics` implements `impactAsync`/`selectionAsync` on Android as **40–60 ms `Vibrator` waveforms** [S62]. On actuators without amplitude control, every non-zero amplitude plays at **100%** [S54]. Google: *"Given a choice between buzzy or no haptics for touch feedback, choose no haptics"* [S52].
   - Route all Android haptics through `performAndroidHapticsAsync` (`View.performHapticFeedback`). It respects the user's touch-feedback setting and needs no permission [S53].
   - That function silently did nothing in expo-haptics 57.0.0/57.0.1 and was fixed in **57.0.2** [S64][S65]. Blendn's `~57.0.3` resolves to a fixed version.
6. **Constants are API-gated.**
   - `CONFIRM`/`REJECT`/`GESTURE_START`/`GESTURE_END` need API 30.
   - `TOGGLE_ON/OFF`, `SEGMENT_TICK`, `SEGMENT_FREQUENT_TICK`, `DRAG_START`, `GESTURE_THRESHOLD_*` and `NO_HAPTICS` need **API 34** [S55].
   - expo-haptics **throws** when a constant is missing on an older device [S63]. A one-file wrapper with a fallback table is mandatory.
7. **Edge-to-edge is not optional.**
   - Play requires `targetSdk 36` for new apps and updates since **2026-08-31** (extension to 2026-11-01) [S68].
   - API 36 removes the opt-out [S66].
   - Expo SDK 55 removed `edgeToEdgeEnabled` [S70].
   - Rules: the gesture bar stays transparent with no background behind the handle [S79], and no touch targets sit in `mandatorySystemGestures` [S80].
8. **Keep predictive back off for this redesign, but design for it.**
   - React Native's BackHandler is broken on API 35 when opted in. RN issue #58407 is open on 0.87.1 [S76].
   - react-native-screens has no in-app predictive back [S77].
   - So: wire every sheet to `onRequestClose`, keep back on Going, Banter and Me returning to Pulse (React Navigation `backBehavior: 'firstRoute'` default [S101], Android's fixed-start-destination principle [S102]), and draw transitions that can later match the 90%-scale, 8dp-margin preview spec [S75].
9. **Dynamic colour needs no opt-out because it is opt-in** [S85], and RN never opts in. Do this instead:
   - Ship a deliberate **monochrome icon layer**. Android 16 QPR2 auto-generates a colour-filtered themed icon for apps that don't provide one, and apps can't opt out [S86][S87].
   - Keep the app theme dark, so "expanded dark theme" and Force Dark never touch it [S88][S89].
10. **The splash is constrained to a single opaque background colour and one icon.**
    - The icon fits in a **160dp circle** (with icon background) or a **192dp circle** (without).
    - An optional animated vector icon (AVD) should stay **≤1,000 ms** on phones with a start delay **≤166 ms**, and it only animates on Android 12+ [S90].
    - Expo's splash plugin documents static images only [S91].
    - Brand motion (orbs blooming) belongs in the first JS frame after hand-off, not in the system splash.

---

## 1. Material 3 Expressive

### 1.1 What it is, and the evidence behind it

- **The announcement.** Google announced M3 Expressive at The Android Show on 2025-05-13, ahead of I/O 2025 (May 20–21). It shipped with Android 16 and Wear OS 6, starting on Pixel [S22a].
- **The research.** It rests on **46 studies with 18,000+ participants** over three years [S1]. Headline results from Google's own write-up:
  - users spotted key UI elements **up to 4× faster**,
  - **87% preference among 18–24-year-olds**,
  - **+32%** "subculture perception", **+34%** perceived modernity, **+30%** perceived "rebelliousness",
  - age-related usability gaps largely closed for older users [S1].
- **Google's caution.** Expressive design is contextual: *"What works in a media player or email app might not be suitable for something like a banking interface"*. Keep established patterns, keep text labels, and keep function and accessibility first [S1].
- **The three pillars** are an expanded type system with emphasized styles, a physics-based motion system, and a shape library with morphing [S1].
- **Component count.** Material describes "14 new and updated components" (snippet of m3.material.io; exact count UNVERIFIED) [S20].

### 1.2 Typography: emphasized styles

Every baseline style now has an `…Emphasized` twin. There are **15** in Compose, from `displayLargeEmphasized` to `labelSmallEmphasized` [S13]. **Size and line height are identical to the baseline. Only the weight goes up, by one step**: Regular becomes Medium, and Medium becomes Bold [S13]. MDC describes them as for *"selection, actions, headlines, or other editorial treatments"* [S14].

| Role | Size / line (sp) | Baseline weight | Emphasized weight |
|---|---|---|---|
| Display L / M / S | 57/64 · 45/52 · 36/44 | Regular | Medium |
| Headline L / M / S | 32/40 · 28/36 · 24/32 | Regular | Medium |
| Title L | 22/28 | Regular | Medium |
| Title M / S | 16/24 · 14/20 | Medium | **Bold** |
| Body L / M / S | 16/24 · 14/20 · 12/16 | Regular | Medium |
| Label L / M / S | 14/20 · 12/16 · 11/16 | Medium | **Bold** |

All values come from `TypeScaleTokens.kt` [S13].

### 1.3 Shape: the corner scale, the 35-shape library, morphing

**Corner scale.** M3E added the "increased" steps and `extra-extra-large` [S10][S14b]:

| Token | dp |
|---|---|
| none | 0 |
| extra-small | 4 |
| small | 8 |
| medium | 12 |
| large | 16 |
| **large-increased** | **20** |
| extra-large | 28 |
| **extra-large-increased** | **32** |
| **extra-extra-large** | **48** |
| full | 50% / circle |

**Shape library.** `MaterialShapes` defines **35** named `RoundedPolygon`s [S9]:
- Circle, Square, Slanted, Arch, Fan, Arrow, SemiCircle, Oval, Pill, Triangle, Diamond, ClamShell, Pentagon, Gem,
- Sunny, VerySunny, Cookie4/6/7/9/12Sided, Ghostish, Clover4Leaf, Clover8Leaf,
- Burst, SoftBurst, Boom, SoftBoom, Flower, Puffy, PuffyDiamond, PixelCircle, PixelTriangle, Bun, Heart.

**Morphing.** This is `androidx.graphics:graphics-shapes`. `Morph(start, end)` interpolates between two `RoundedPolygon`s with `progress` 0–1. It is **not** for arbitrary paths; use AVDs for those [S11].

**Shape change on press is the everyday expression.**
- Expressive buttons carry `ButtonShapes(shape, pressedShape)` [S12].
- Pressed corners by size [S12]:
  - XS and S (32 and 40dp tall) press to **small, 8dp**.
  - M (56dp) presses to **medium, 12dp**.
  - L and XL (96 and 136dp) press to **large, 16dp**.
- At rest the shape is "round" (full) or "square" (medium) [S12].

### 1.4 Motion physics: the actual numbers

- **Two schemes.**
  - **Expressive** is *"Material's opinionated motion scheme"*, for *"most situations, particularly hero moments and key interactions"*.
  - **Standard** is for *"utilitarian products"* with minimal bounce (snippet) [S2].
  - In Compose they are `MotionScheme.expressive()` and `MotionScheme.standard()` [S6].
- **Two kinds of spring.**
  - **Spatial** springs are for position, size, rotation and corner radius, and may overshoot.
  - **Effects** springs are for colour and opacity, and must not overshoot (snippet) [S2].
  - Each comes in fast, default and slow (`fastSpatialSpec()` … `slowEffectsSpec()`) [S6].

Values come from the generated token files (`ExpressiveMotionTokens.kt` [S4], `StandardMotionTokens.kt` [S5]). Compose springs assume **mass = 1**, with damping coefficient `c = 2·√k·ζ` [S7]. The Reanimated column is **derived** on that basis, for `withSpring({ mass, stiffness, damping })` [S8].

| Scheme | Token | Damping ratio ζ | Stiffness k | Reanimated (derived) | Overshoot (derived) |
|---|---|---|---|---|---|
| Expressive | fast spatial | **0.6** | **800** | `{mass:1, stiffness:800, damping:33.9}` | ≈9.5% |
| Expressive | default spatial | **0.8** | **380** | `{mass:1, stiffness:380, damping:31.2}` | ≈1.5% |
| Expressive | slow spatial | **0.8** | **200** | `{mass:1, stiffness:200, damping:22.6}` | ≈1.5% |
| Expressive & Standard | fast effects | 1.0 | 3800 | `{mass:1, stiffness:3800, damping:123.3}` | 0 |
| Expressive & Standard | default effects | 1.0 | 1600 | `{mass:1, stiffness:1600, damping:80}` | 0 |
| Expressive & Standard | slow effects | 1.0 | 800 | `{mass:1, stiffness:800, damping:56.6}` | 0 |
| Standard | fast spatial | 0.9 | 1400 | `{mass:1, stiffness:1400, damping:67.3}` | ≈0.2% |
| Standard | default spatial | 0.9 | 700 | `{mass:1, stiffness:700, damping:47.6}` | ≈0.2% |
| Standard | slow spatial | 0.9 | 300 | `{mass:1, stiffness:300, damping:31.2}` | ≈0.2% |

**Gotcha.** Reanimated 4's `withSpring` defaults are `mass 4`, `damping 120` and `stiffness 900`. Physics-based options can't be mixed with `duration`/`dampingRatio`. **Always pass `mass: 1` explicitly** or the M3 numbers mean something else [S8]. `reduceMotion` defaults to `System` [S8].

**Material's Android predictive-back interpolators** are a separate spec: `(.1, .1, 0, 1)` for full-screen and `(0, 0, 0, 1)` for gesture progress [S75].

### 1.5 New and updated components (with the numbers that matter)

| Component | What changed | Numbers |
|---|---|---|
| **Button groups** | Connected buttons that change shape, motion and width on press [S20] | Small group: 40dp tall, 12dp gap [S16] |
| **FAB menu** | Replaces speed-dial; large, contrasting items [S20] | Items 56dp tall, full-round, 4dp apart; close button 56dp [S16] |
| **Toolbars** | **Docked** toolbar (replaces the bottom app bar) and **floating** toolbar [S20] | Floating: 64dp tall, full-round, **16dp from edges**, standard or vibrant colour [S16][S19]. Docked: 64dp [S16] |
| **Floating toolbar behaviour** | `HideViewOnScrollBehavior`, **auto-disabled while TalkBack is on** [S19] | n/a |
| **Loading indicator** | Morphs through a shape sequence. Replaces most indeterminate circular spinners **for waits under 5 s**; contained or uncontained [S17] | 38dp indicator in a 48dp container; 3:1 contrast for the contained variant [S17] |
| **Wavy progress** | Determinate and indeterminate linear/circular with a wave [S18] | Amplitude ramps between 10% and 90% progress; thick track 8dp; circular 40dp (52dp thick) [S18] |
| **Split button** | Main action plus a menu button that spins and changes shape [S20] | XS–XL sizes [S16] |
| **Navigation bar ("flexible"/short)** | Shorter. Horizontal items at ≥600dp. Label **no longer bold** when selected; active label = secondary colour [S15] | **80 → 64dp** tall; indicator 64 → **56×32dp**; top padding 12 → 6dp; bottom 16 → 6dp; 3–5 destinations on phones [S15][S16]. Compose `ShortNavigationBar`: 3–5 equal-weight items on small screens, 3–6 centred on medium [S16b] |
| **Top app bars** | Flexible medium and large with subtitles [S21] | Small 64dp; medium flexible 112dp (136 large variant); large flexible 120dp (152) [S16] |
| **Lists** | Expressive "segmented" list items [S21] | Item shape extra-small 4dp; focused/dragged items morph to large 16dp [S16] |
| Also updated | Common buttons (XS 32, S 40, M 56, L 96, XL 136dp), icon buttons, FAB / extended FAB, carousel, navigation rail [S20][S12] | n/a |

**Stable status (2026).** Compose Material3 **1.4.0** is current stable. **1.5.0-alpha** (alpha29 on 2026-09-23) has been promoting Expressive APIs out of experimental through 2026 [S21]:
- FAB and FAB Menu, buttons, menus, ToggleButtons (alpha19),
- SplitButton (alpha20),
- **ButtonGroup and FloatingToolbar** (alpha22),
- expressive TopAppBar and list items (alpha23).

### 1.6 Adoption: Android 16 and Pixel

- **Pixel.** Android 16 **QPR1** (Pixel Drop, **2025-09-03**) brought M3E to **Pixel 6 and newer** and the Pixel Tablet [S22].
- **Blur in system UI.** The shade, Quick Settings, app drawer, recents and keyguard now show a **blurred wallpaper** instead of an opaque background [S22].
- **Battery Saver kills that blur**, because it is GPU work [S25].
- **"Reduce blur effects".** Android 16 QPR2 added this toggle under *Settings › Accessibility › Color & motion*. With it on, panels become "a solid, more saturated color" [S27]. It replaces the old "allow window-level blurs" developer option [S26].
- **Google's apps** rolled M3E out through mid-to-late 2025:
  - Gmail: one rounded container and "gooey" pill swipe actions [S23].
  - Photos: a floating toolbar in albums [S24].
  - Messages: the thread in a rounded container, so the app bar becomes its own darker layer [S24].
  - Phone, Keep and YouTube as well [S24].

### 1.7 2026 updates

- **Compose Material3 1.5.0 alphas** are making Expressive stable (dates in 1.5) [S21]. July 2026 also brought a **`material3-ripple`** library with inset focus rings (alpha24) [S21].
- **Compose UI 1.13.0-alpha03 (2026-09-09)** [S32]:
  - `WindowInfo.isCrossWindowBlurEnabled`, to *"query and observe system-wide cross-window blur state"*. Google itself now treats that flag as the app-level blur gate.
  - A progressive `Modifier.blur { … }`.
- **Android 17 (API 37)** is out, with QPR betas running.
  - Its targeting change that matters here: the large-screen orientation/resizability **opt-out disappears** for apps targeting 37 [S67].
  - Claims that Android 17 brings "frosted glass system-wide" come from low-quality blogs only. **UNVERIFIED.**

### 1.8 What translates to a branded, non-Material app

| M3E idea | Port to Blendn? | How |
|---|---|---|
| Spring motion scheme (spatial vs effects) | **Yes, as the motion foundation on both platforms** | Use the Reanimated table in §1.4. Spatial springs for transforms, size and radius. Effects springs (never overshoot) for opacity and colour |
| Shape change on press | **Yes** | Primary CTA and chips: pill at rest, ~12dp corner when pressed (M3 medium), on the expressive fast-spatial spring. The centre disc stays a circle and gets scale, not a shape change |
| Shape library / morph | **Selectively** | The *loading indicator* is the right place. Morph between two or three brand shapes (the Blend'n monogram outline ↔ circle ↔ "cookie") for waits under 5 s, drawn with react-native-svg path interpolation. Don't put random cookie and flower shapes in the UI |
| Emphasized type | **Yes, as a rule, not as Material's font** | "Selected, live or hero = +1 weight step at the same size" (selected tab label, "Live now", match name) |
| Floating toolbar | **Yes, as a pattern** | Floating CTAs and the Room action row as a 64dp floating pill, 16dp from the edges, hidden on scroll *except* under TalkBack (copy the MDC rule) [S19] |
| Short nav bar 64dp, label not bold | **Yes** | 64dp tab bar body; selected = colour plus a pill indicator, not bold |
| FAB menu | **Maybe** | The Blend'n disc's secondary actions (check in / check out / share location) could fan out like a FAB menu, *if* product wants more than one action there |
| Button groups / split buttons | **Rarely** | Filter chips on Pulse could use the connected-group width squeeze on press. Split buttons have no real use case |
| Wavy progress | **One place** | The "check-in in progress" GPS acquisition. Wavy reads as "alive", which fits nightlife |
| Dynamic colour, tonal palettes, surface roles | **No** | Brand colours are fixed (§4.5) |
| Material components as-is | **No** | They read as Google apps. Borrow the metrics (64dp bars, 56×32 indicator, 32dp chips, 52×32 switch track) and keep brand surfaces |

### Implication for Blendn

- **Adopt the M3E spring tokens as Blendn's single motion vocabulary on both platforms.** It is the one part of M3E that is pure physics and carries no visual identity. It is also the cheapest win: one `motion.ts` with nine named springs (`mass: 1`).
- **Use expressive spatial springs** for the disc, sheets and the swipe deck. Use effects springs for every opacity and colour change.
- **Port the *ideas*:** pressed-shape change, emphasized-weight states, a morphing brand loader, the floating-pill toolbar. **Do not port Material's look.** Blendn is a nightlife brand, and M3E's tonal pastel surfaces would make it read like Google Messages.
- **The research supports going bold for this age band** [S1]. Google's own caution applies to the *Room*: chat, people and moderation need conventional, labelled controls.

---

## 2. Translucency and blur on Android

### 2.1 Platform primitives

**`RenderEffect.createBlurEffect(radiusX, radiusY, [input], TileMode)`, API 31** [S28]
- It blurs the contents of the RenderNode it is installed on, meaning **the view's own drawing, not what is behind it**.
- Backdrop blur in-app therefore means capturing the content behind into a RenderNode and blurring that. This is what Dimezis BlurView 3 does with its `BlurTarget` [S39].

**Cross-window blur, API 31.** `Window.setBackgroundBlurRadius()` blurs behind a window within its bounds. `LayoutParams.setBlurBehindRadius()` blurs the whole screen behind. The window must be translucent and floating [S30][S29].

**Runtime gate: `WindowManager.isCrossWindowBlurEnabled()` plus `addCrossWindowBlurEnabledListener()`** [S29].
- *"Cross-window blur might not be supported by some devices due to GPU limitations. It can also be disabled at runtime, e.g. during battery saving mode, when multimedia tunneling is used or when minimal post processing is requested… the app might want to change its theme to one that does not use blurs."*
- The listener fires immediately with the current state.

**AOSP guidance to OEMs** [S31]:
- *"Cross-window blurring is an expensive operation, so it's supported only on selected devices… Lower-end devices might not be able to handle the extra load, which can cause dropped frames."*
- *"Avoid blur radii higher than 150 px."*
- Starting points are **20 px for blur-behind** and **80 px for frosted glass**.
- Window blurs are disabled at runtime in **battery saving mode**, for some video content, under thermal or performance pressure, and by developer override.

**System UI.** Android 16 QPR1 blur turns off under Battery Saver [S25]. The QPR2 "Reduce blur effects" toggle reproduces "allow window-level blurs" [S26]. *Inference, UNVERIFIED on device:* that toggle therefore also flips `isCrossWindowBlurEnabled()` to `false`, which makes the API the single signal for "no GPU support", "Battery Saver" and "user asked for less blur".

**OEM caveat.** Samsung, Xiaomi and other OEMs ship their own system blur. Whether their builds set the AOSP capability flag that this API reports is **UNVERIFIED**. Treat `false` as "don't blur" and `true` as necessary but not sufficient.

**Overdraw.** *"Transparent objects require existing pixels to be drawn first, so that the right blending equation can occur."* Fades and drop shadows with transparency "significantly increase overdraw" [S51]. On fill-rate-limited budget GPUs, large translucent layers cost more than small blurs.

### 2.2 `expo-blur` on Android, SDK 55–57

**API** (SDK 57 docs) [S33]:
- `<BlurTargetView ref={t}>` wraps the content to be blurred. `<BlurView blurTarget={t} blurMethod=…>` sits **outside** it.
- `blurMethod` options:
  - `'none'` (default) gives a semi-transparent view.
  - `'dimezisBlurView'` blurs on all versions, falling back to RenderScript on API ≤30 at a big performance cost.
  - **`'dimezisBlurViewSdk31Plus'`** blurs on API 31+ and falls back to `'none'` below.
- `blurReductionFactor` (default **4**) divides the radius so Android looks like iOS [S33].
- **Several BlurViews can share one BlurTargetView, and that is more efficient** [S33][S34].

**History** [S35]:
- 55.0.0 (2026-01-21) renamed `experimentalBlurMethod` to `blurMethod`, added the RenderNode path, added `dimezisBlurViewSdk31Plus`, and made the blur **require** a `BlurTargetView`.
- 55.0.9 fixed a Fabric mount/detach crash.
- 55.0.11 fixed the initial blur ignoring `blurReductionFactor`.
- **57.0.1 (2026-07-15) fixed gesture handlers cancelling gestures for views under a `BlurTargetView`.** Blendn's `~57.0.3` includes it.
- `main` is already at 58.x.

**Inside 57.0.2** [S38]:
- It wraps **Dimezis BlurView 3.1.0**.
- It calls `setupWith(target).setFrameClearDrawable(decorView.background)`.
- If the method is `none` or the target is missing, it paints `tint.toBlurEffect(radius)` as a flat background. A radius of 0 disables blur, to dodge a platform `nativePtr` crash.
- Switching `blurMethod` to `'none'` at runtime disables the blur on the existing view. That makes a runtime downgrade a prop change.
- Whether changing `blurTarget` after mount re-targets the view is **UNVERIFIED**: configuration only runs while it is unconfigured, on attach.

**Limitations**
- **Modal.** A `BlurTargetView` cannot reach content outside a RN `<Modal>`, which is a separate native window. This is expo #44165 on 55.0.10, closed as "issue accepted", and no fix appears in the 57.x changelog [S36][S35].
- **List ordering.** If the BlurView renders *before* dynamic content such as a `FlatList`, the blur doesn't update. Render the BlurView after it [S34].
- **Corners.** `borderRadius` isn't applied to BlurView; use `overflow: 'hidden'` [S34].
- **What BlurView 3 can't blur.** SurfaceView content (video, `MapFragment`, GLSurfaceView), and TextureView below API 31. A `BlurTarget` cannot contain its own `BlurView` [S39].
- **Maps.** Blendn uses maps (Leaflet/WebView on the dashboard; on the client UNVERIFIED). Any SurfaceView map under the tab bar won't blur.

### 2.3 Alternatives

| Option | State | Verdict |
|---|---|---|
| `@react-native-community/blur` | Last published **2024-08-29** (4.4.1). Uses **Dimezis BlurView 2.0.4**, the pre-RenderNode-target generation. Android `blurAmount` clamps at 32 [S40] | **No.** Older engine and stale |
| `@shopify/react-native-skia` `BackdropBlur`/`BackdropFilter` | Filters what has already been drawn *in the same Skia canvas* inside a clip [S41] | **Only for Skia-drawn scenes.** It can't blur native RN views. Not installed, and it adds a large dependency |
| Haze (Compose, Chris Banes) | Real blur on API 31+ (best on 33+). **API ≤30 falls back to a scrim by default** [S42] | Not usable from RN, but its *policy* is the industry reference: no blur below 12 |
| expo-blur 57 (installed) | RenderNode path, shared target [S33] | **Use this** |

### 2.4 What reputable apps do

- **Google system UI.** Blur on the shade and launcher. Off in Battery Saver [S25]. A user accessibility toggle turns it into a solid, more saturated colour [S27].
- **Telegram for Android** (open source, `SharedConfig.java`/`LiteMode.java`, 2026-01) [S44][S45]:
  - It classifies devices **LOW / AVERAGE / HIGH**.
  - LOW means any of: a known low-end SoC hash, ≤2 cores, `memoryClass` ≤100, ≤4 cores at ≤1250 MHz, or **total RAM < 2 GB**.
  - AVERAGE means <8 cores, `memoryClass` ≤160, or max freq ≤2055 MHz.
  - **Chat blur is allowed only for AVERAGE+ on API 31+, and only HIGH below 31.** It sits under a user-facing "Power saving" (LiteMode) switch that also has a `FLAG_LIQUID_GLASS`.
  - **All effects drop to the power-saver preset when battery ≤ a threshold** (default 10%, server-tunable).
- **Haze defaults** (above): API ≤30 gets a scrim [S42].

### 2.5 The Indian device landscape

StatCounter, India, mobile, **July 2026** (pageviews, not installs) [S46]:

| Android version | Share |
|---|---|
| 15 | 23.7% |
| 16 | 23.4% |
| 13 | 14.0% |
| 14 | 12.3% |
| 12 | 9.4% |
| 11 | 8.8% |

That puts **API 31+ at ≈83%**. Android 11 and below, ~17%, can never get the RenderNode blur.

API level is not performance, though. Many Android 13–15 phones in India are budget SoCs. That is why the gate needs a capability signal as well as `platformApiLevel` (recommendation).

### 2.6 Recommendation: what "glass" becomes on Android

**Surface map (Android).** It matches the iOS map in `research-ios-glass.md` §5.2.

| Surface | Tier A, "glass" | Tier B, "tint" (default) | Notes |
|---|---|---|---|
| **Tab bar** | expo-blur `dimezisBlurViewSdk31Plus`, `tint="dark"`, start at `intensity` 40 with reduction 4 (the iOS doc's starting value; calibrate on device). Add an overlay `rgba(33,31,31,0.55)` | Solid `rgba(33,31,31,0.94)` + hairline | One `BlurTargetView` wraps the tab scenes. The bar is a **sibling outside** it (below) |
| **Top bar** (only once content scrolls under it) | Same shared target; blur fades in with the scroll offset on an **effects** spring | `#0F0E0E` at 0.92, plus a gradient protection band | At rest the top is transparent over the orbs, with a status-bar gradient [S79] |
| **Sheets / action trays** (RN `Modal`) | **Never blur** (separate window [S36]) | `#272525` surface, top corners 24, scrim `rgba(0,0,0,0.5)` | This is also what M3 does (opaque sheets with a scrim) |
| **Dialogs** | Never blur | `#272525`, radius 28 (M3 dialog = extra-large 28dp [S16]) | n/a |
| **Floating CTAs** | **Solid accent**, not blur | Same | Small surfaces gain nothing visible from blur and pay the capture cost |
| **Pills over photos** | Scrim capsule `rgba(15,14,14,0.60)` + hairline `rgba(255,255,255,0.14)` | Same | Same as iOS. Readable on any poster |
| **Room composer** | Blur only if it shares the screen's target; otherwise tint | `#211F1F` + hairline | Keyboard and IME insets animate it, so keep it light |
| **Toast / snackbar** | Never blur | `#272525` capsule | n/a |
| **Cards, lists** | Solid | Solid | n/a |

**Tab-bar architecture (proposed; verify on device).** Wrap the `(tabs)` navigator in a `BlurTargetView`. Render the custom tab bar **as a sibling outside the target**:
- either `tabBar={() => null}` with the bar placed in the layout,
- or the bar portalled to the layout root,
because *"a BlurTarget cannot contain the BlurView targeting it"* [S39]. Pushed stack screens cover the whole thing, so they don't need targets.

**The tier gate** (recommendation; thresholds are judgement, to calibrate with Sentry performance data):

```ts
// lib/material.android.ts — every chrome surface asks this; nothing else imports BlurView.
const tierA =
  Device.platformApiLevel! >= 31 &&                 // RenderNode path [S33]
  (Device.totalMemory ?? 0) >= 4 * 1024 ** 3 &&    // ponytail: RAM proxy; Telegram's LOW cut is <2 GB [S44]. Add a SoC denylist if Sentry shows jank on 4–6 GB devices
  crossWindowBlurEnabled &&                        // native: WindowManager.isCrossWindowBlurEnabled() + listener [S29]
  !reduceMotionBlurOverride &&                     // optional user setting in Me › Accessibility
  remoteFlags.androidBlur                          // server kill switch
```

**Native bit.** The only native code needed is a ~20-line Expo module exposing `isCrossWindowBlurEnabled()` and its listener (API 31+). It covers **Battery Saver, OEM or GPU unsupported, and (inferred) "Reduce blur effects"** with one signal [S29][S26]. No `expo-battery` is needed.

**Runtime behaviour.** When the flag drops, flip `blurMethod` to `'none'` and swap in the Tier-B surface via a 150 ms **effects** cross-fade on the overlay, never on the BlurView's own opacity.

**Tier-B recipe (recommendation).** This is what "finished" looks like without blur:
- Surface `rgba(33,31,31,0.92–0.96)`, so the orbs bleed through faintly. That is 4–8% alpha of colour leakage, enough to feel material.
- **Top hairline** 1 physical px, `rgba(255,255,255,0.10)`.
- **Inner top highlight**: a 0 → 6% white gradient over the first 12dp.
- **Static noise**: a pre-baked 128px tile at 3% opacity, as an image and not a shader. Static images cost a texture sample, not a blur.
- No Android `elevation` shadow on translucent surfaces. Draw a soft shadow PNG under the bar instead. *Elevation shadows showing through translucent views is a common artefact. UNVERIFIED for RN 0.86 Fabric.*

**Orbs.**
- Render them as **one pre-blurred WebP/PNG** (or a single static SVG), sized to the screen and drawn once.
- **Do not** animate them on Tier B or under reduce-motion (`AccessibilityInfo.isReduceMotionEnabled()` reads "Remove animations" and transition-scale-off on Android [S98]).
- No full-screen animated translucent layers, because of overdraw [S51].

**Test matrix (recommendation).** Run all three gates on each device:

| Device | Expected tier |
|---|---|
| Android 11 budget phone | B |
| Galaxy A34 / Helio-class Android 14–15, 6 GB | A, if frame-clean |
| Pixel 7+ | A |

For each, flip Battery Saver and confirm the downgrade happens live. Measure with `adb shell dumpsys gfxinfo <pkg> framestats` while flinging Pulse.

### Implication for Blendn

- **Tier B is the product. Tier A is a garnish.**
  - Design every chrome surface as tinted-and-hairlined first, and make that beautiful.
  - Add real blur only to the **tab bar and scrolled top bar**, from **one shared `BlurTargetView`**, on API 31+ devices that pass the gate.
- **Ship with the server flag off.** Turn it on per device class once Sentry frame data from the Galaxy A34 tier is clean. This matches the iOS doc's "ship solid first".
- **Never chase blur into sheets.** They are `Modal`s and expo-blur can't see behind them [S36], and Material doesn't blur sheets anyway.
- **Respect `isCrossWindowBlurEnabled()`.** It is the honest way to obey Battery Saver and the new Android accessibility toggle without inventing a setting.

---

## 3. Android haptics

### 3.1 Principles (Android Developers) [S52]

- **"Less is more."** Prefer **clear** haptics: crisp, discrete, mechanical-feeling.
- **Rich** haptics need wide-band actuators and fewer devices have them.
- **Buzzy** haptics are the pager legacy. *"Given a choice between buzzy or no haptics for touch feedback, choose no haptics."*
- Use `HapticFeedbackConstants` for the actions they cover. For anything custom, use predefined `VibrationEffect`s and `Composition` primitives.
- **Correlate strength with importance and frequency.** Very frequent events (scroll, text handles) get very subtle feedback. Important events (submit, refresh) get stronger feedback.
- **Be consistent** within the app and with the system.
- **Co-design with the visuals.** Out-of-sync haptics feel like a broken actuator.
- **Never use legacy one-shots** (`createOneShot`, `vibrate(long)`, `vibrate(long[], int)`). They ring on cheap actuators.
- **Keyclick input of 10–20 ms.** Actuators ring for a further **20–50 ms**.

**The recommended path is `View.performHapticFeedback()`** [S53]:
- No `VIBRATE` permission.
- **Respects the user's touch-feedback setting** (`HAPTIC_FEEDBACK_ENABLED`).
- Can be disabled per view.

`FLAG_IGNORE_GLOBAL_SETTING` was deprecated in API 33. Only privileged apps can override the user [S55].

### 3.2 `HapticFeedbackConstants`: levels and meaning [S55]

| Constant | API | Meaning (abridged from the reference) |
|---|---|---|
| `LONG_PRESS` | 3 | A long press resulting in an action |
| `VIRTUAL_KEY` | 5 | Press of an on-screen key |
| `KEYBOARD_TAP` | 8 | Soft keyboard key press |
| `CLOCK_TICK` | 21 | Hour or minute tick of a clock |
| `CONTEXT_CLICK` | 23 | Context click on an object |
| `KEYBOARD_PRESS` / `KEYBOARD_RELEASE` | 27 | Keyboard key down / up |
| `VIRTUAL_KEY_RELEASE` | 27 | Virtual key released |
| `TEXT_HANDLE_MOVE` | 27 | Selection or insertion handle moved |
| `CONFIRM` | **30** | *"Confirmation or successful completion of a user interaction"* |
| `REJECT` | **30** | *"Rejection or failure of a user interaction"* |
| `GESTURE_START` / `GESTURE_END` | **30** | Gesture started / finished |
| `TOGGLE_ON` / `TOGGLE_OFF` | **34** | Switch toggled on / off |
| `SEGMENT_TICK` | **34** | Moving between discrete choices (list items, slider stops) |
| `SEGMENT_FREQUENT_TICK` | **34** | Many choices (minutes, percentages); *"expected to be very soft"* |
| `DRAG_START` | **34** | Drag-and-drop target "picked up" |
| `GESTURE_THRESHOLD_ACTIVATE` / `_DEACTIVATE` | **34** | A swipe/drag (pull-to-refresh style) crosses or un-crosses its commit threshold |
| `NO_HAPTICS` | **34** | Explicitly none |
| `FLAG_IGNORE_GLOBAL_SETTING` | 3, deprecated 33 | Privileged apps only since 33 |

### 3.3 `VibrationEffect`: predefined effects, primitives, composition

**Predefined effects (API 29)** [S56]:
- `EFFECT_CLICK` (the baseline),
- `EFFECT_DOUBLE_CLICK`,
- `EFFECT_HEAVY_CLICK`,
- `EFFECT_TICK` (weaker).

They are meant to be *"identical, regardless of the app they come from"*.

**Composition primitives** [S57]:

| Primitive | API | Feel |
|---|---|---|
| `PRIMITIVE_CLICK` | 30 | Sharp, crisp click |
| `PRIMITIVE_TICK` | 30 | Very short, light; for repeated dynamic feedback |
| `PRIMITIVE_QUICK_RISE` | 30 | Quick upward movement against gravity |
| `PRIMITIVE_SLOW_RISE` | 30 | Slow upward movement |
| `PRIMITIVE_QUICK_FALL` | 30 | Quick downward movement with gravity |
| `PRIMITIVE_LOW_TICK` | 31 | Very short, low-frequency, light |
| `PRIMITIVE_THUD` | 31 | Downward movement with gravity, plus impact and reverberation |
| `PRIMITIVE_SPIN` | 31 | Spinning momentum |

**Composition rules** [S54]:
- **No automatic fallback.** If one primitive is unsupported, the *whole* composition fails. Check `areAllPrimitivesSupported()`.
- Android 16's `VibrationEffect.Builder` *does* fall back automatically.
- Gaps: 5–10 ms is imperceptible, **50+ ms** is discernible, and **100+ ms** makes primitives feel separate.
- For perceptibly different intensities, scale by a ratio of ≥1.4 (0.5 / 0.7 / 1.0). Scale 0 is the minimum perceivable level, not off.
- Android 16 adds envelopes: `BasicEnvelopeBuilder` (intensity and sharpness, which must end at 0) and `WaveformEnvelopeBuilder` (Hz, with no fallback).
- **On devices without amplitude control, any non-zero amplitude plays at 100%.** Check `hasAmplitudeControl()` and supply an on/off pattern.
- Start and end waveforms at zero amplitude.

The AOSP haptics framework uses a default resonant frequency of 150 Hz [S58].

### 3.4 `expo-haptics` 57 on Android, from the source

**`impactAsync`, `notificationAsync` and `selectionAsync` are all `Vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))`** [S61][S62]. The module declares `VIBRATE` in its manifest [S61].

| Call | Timings (ms) | Amplitudes (/255) |
|---|---|---|
| `impactAsync(Light)` / `Soft` | 0, **50** | 0, 30 |
| `impactAsync(Medium)` / `Rigid` | 0, **43** | 0, 50 |
| `impactAsync(Heavy)` | 0, **60** | 0, 70 |
| `selectionAsync()` | 0, **50** | 0, 30 |
| `notificationAsync(Success)` | 0, 40, 100, 40 | 0, 50, 0, 60 |
| `notificationAsync(Warning)` | 0, 40, 120, 60 | 0, 40, 0, 60 |
| `notificationAsync(Error)` | 0, 60, 100, 40, 80, 50 | 0, 50, 0, 40, 0, 50 |

**Why these are a problem**
- The pulses are **2.5–3× Google's 10–20 ms keyclick guidance** [S52]. They are raw waveforms of exactly the kind the principles page warns about.
- On no-amplitude-control actuators they play at **full strength** [S54].
- Whether they honour the system "touch feedback" switch is **UNVERIFIED**. They don't go through `performHapticFeedback`, so probably not.

**`performAndroidHapticsAsync(AndroidHaptics.X)` is `View.performHapticFeedback(constant)` on the activity's content view** [S61][S60]. The `AndroidHaptics` enum mirrors the constants, from `Confirm` to `Virtual_Key_Release` [S60][S63].
- **Bug history.** In **57.0.0 and 57.0.1** the call ran off the main thread and was a **silent no-op**. Fixed by `runOnQueue(Queues.MAIN)` in **57.0.2** (published 2026-08-26) and 58.0.0 [S64][S65].
- **Old devices.** Constants are resolved by reflection. If the constant doesn't exist on the device's API level, it throws `HapticsNotSupportedException` ("A haptics engine is not available on this device"). The exceptions are `CLOCK_TICK`, `CONTEXT_CLICK`, `KEYBOARD_TAP`, `LONG_PRESS` and `VIRTUAL_KEY`, which are hard-coded [S63]. So `Toggle_On` **rejects** on Android ≤13, and `Confirm` rejects on Android ≤10.
- **What the expo docs say.** *"Android's `Vibrator` API is not recommended for implementing haptics feedback"*. Use `performAndroidHapticsAsync`, which is closer to iOS behaviour and doesn't need `VIBRATE` [S60].

**Missing pieces.** expo-haptics does not expose `VibrationEffect` primitives or predefined effects. A rich "match" composition (e.g. `QUICK_RISE` → `CLICK`) would need a small native module. *Skip it until a design asks for it. `CONFIRM` covers the moment.*

### 3.5 Poor actuators and how to degrade

- **Cheap phones** have ERM or narrow-band LRA actuators without amplitude control or primitives [S54][S58]. Waveforms turn into full-strength buzzes there, and compositions fail outright.
- **`performHapticFeedback` constants degrade gracefully.** OEMs map each constant to their tuned effect, so the platform owns the fallback [S52].
- **Ladder** (recommendation):
  1. A constant via `performAndroidHapticsAsync`.
  2. If the constant isn't available at this API level, a **semantically close older constant** (table below).
  3. If nothing fits, **nothing**.
  4. **Never** fall back to `impactAsync` on Android.

### 3.6 Blendn mapping (recommendation)

| Event | Android (min API) | Android fallback (<min) | iOS (unchanged) |
|---|---|---|---|
| Generic button / card press (`ScalePress`) | **none** | none | `selectionAsync()` only where already intentional |
| Tab switch | **none** (Material nav bars don't vibrate) | none | none / selection |
| Blend'n disc: hold starts | `GESTURE_START` (30) | `VIRTUAL_KEY` (5) | impact light |
| Hold-to-confirm crosses commit | `GESTURE_THRESHOLD_ACTIVATE` (34) | `CLOCK_TICK` (21) | impact medium |
| Check-in succeeded / RSVP saved / match | `CONFIRM` (30) | `LONG_PRESS` (3), sparingly | notification success |
| Check-in rejected (out of range), send failed | `REJECT` (30) | none | notification error |
| Toggle (notification prefs, privacy) | `TOGGLE_ON` / `TOGGLE_OFF` (34) | `CONTEXT_CLICK` (23) | selection |
| Swipe deck crosses like/pass threshold | `GESTURE_THRESHOLD_ACTIVATE`; back under: `_DEACTIVATE` (34) | `CLOCK_TICK` (21) | impact light |
| Rating stars, filter scrubber, interest picker step | `SEGMENT_TICK` (34) | `CLOCK_TICK` (21) | selection |
| Fine slider (distance, age range) | `SEGMENT_FREQUENT_TICK` (34) | none | selection, throttled |
| Long-press message / reaction tray | `LONG_PRESS` (3) | n/a | impact medium |
| Photo reorder pickup | `DRAG_START` (34) | `LONG_PRESS` (3) | impact medium |
| Pull-to-refresh armed | `GESTURE_THRESHOLD_ACTIVATE` (34) | none | impact light |
| Swipe-to-reply armed | `GESTURE_THRESHOLD_ACTIVATE` (34) | `CLOCK_TICK` (21) | impact light |
| Message sent / incoming message | **none** (frequent) | none | none |

Implementation is **one file**, `lib/haptics.ts`. It holds `haptic(kind)`, a per-kind `{ androidConstant, minApi, fallback, ios }` table, and a check of `Device.platformApiLevel`. The promise rejection is swallowed with a `logger.debug`, never silently. Screens never import `expo-haptics` directly.

### Implication for Blendn

- **Remove press haptics on Android entirely.** `ScalePress` currently buzzes 50 ms on every tap.
- **Move the remaining ~20 call sites** onto the semantic table above via `performAndroidHapticsAsync`.
- **This is the single cheapest "feels native on Android" fix in the whole redesign.** It also makes budget phones *quieter*, which is what Google's research and principles both point to.
- **Keep the iOS calls as they are.** The wrapper only changes the Android branch.

---

## 4. Android conventions the design must honour

### 4.1 Edge-to-edge and the system bars

**Mandatory**
- Play requires **`targetSdk 36`** for new apps and updates from **2026-08-31**, with a Play Console extension to 2026-11-01 [S68].
- At API 36, `windowOptOutEdgeToEdgeEnforcement` is *"deprecated and disabled"* [S66].
- RN 0.81+ defaults to target 36 [S69]. Expo 55 removed `edgeToEdgeEnabled` and deprecated most `expo-navigation-bar` methods and the `androidStatusBar` keys [S70].
- In SDK 57, `expo-navigation-bar` `setStyle`/`setHidden` work, including inside RN `<Modal>` windows [S71][S82]. The config plugin keeps `enforceContrast` [S82].

**Default bars** (target 35+) [S78]:
- The status bar and the **gesture** navigation bar are transparent.
- **Three-button** navigation gets a translucent scrim (`isNavigationBarContrastEnforced = true`).

**Design rules** [S79][S78]:
- Keep the gesture bar **transparent, with no background behind the handle**.
- Draw content behind the status bar with **gradient protection** where it scrolls under.
- With three buttons: use the transparent bar when a bottom navigation is flush with it, and the translucent bar when content scrolls under the buttons.

**Insets** [S78]:
- `systemBars` for tappable chrome.
- `displayCutout` alongside it.
- `ime` for the composer.
- `systemGestures` for edge swipes and carousels.
- `mandatorySystemGestures` for the bottom home and quick-switch zone, which **can't** be excluded [S80].
- `setSystemGestureExclusionRects` honours at most **200dp** of vertical extent per edge [S81].

### 4.2 Predictive back

**Timeline**
- Android 13–14: behind a developer option.
- Android 15+: system animations (back-to-home, cross-task, cross-activity) on by default for opted-in apps [S74].
- **Android 16, target 36:** enabled by default. `onBackPressed` is no longer called and `KEYCODE_BACK` no longer dispatched, *unless* you opt out with `android:enableOnBackInvokedCallback="false"` [S66].

**Where Blendn stands**
- RN 0.81 turned it on by default for target 36 [S69].
- **Expo writes `false` unless `android.predictiveBackGestureEnabled: true`** [S73][S72]. Blendn is currently opted out.

**Why not opt in now**
- RN #58407: BackHandler gets **no events on API 35** with predictive back on. Open on RN 0.87.1 [S76].
- react-native-screens has **no in-app predictive-back animation**. The maintainer said it is "months away" and needs a next major [S77].

**Design spec for when it lands** [S75]:
- **Full screen:** exit scales 100 → **90%**; enter scales 110 → 100%; fade-through at **35%** progress; interpolator `(.1, .1, 0, 1)`.
- **Shared element:** X shift `(width/20) − 8` dp, **8dp** edge margin, minimum scale **90%** (never below 50%), decelerate `(0, 0, 0, 1)`.
- **On cancel**, snap back.
- Material sheets and search have their own predictive-back animations [S75].

### 4.3 Press feedback: ripple vs press-scale

**Material's model is a *state layer***: pressed **10%**, focus 10%, hover 8%, dragged 16% of the content colour [S83]. The ripple shows it. **M3E adds the pressed-shape change** [S12].

**RN gives the native ripple for free** through `Pressable android_ripple={{ color, borderless, radius, foreground }}`. `foreground: true` matters on image cards [S84].

**Recommendation**
- **Ripple, not scale**, on Android for list rows, cards, chips, icon buttons and tab items: white at ~10% on dark surfaces (`foreground` on photo cards; `borderless` for icon buttons).
- Keep **press-scale (0.96–0.97, expressive fast-spatial spring)** for discrete hero objects on both platforms: the centre disc, primary CTA, swipe cards. Pair it with the pressed-shape change on pill CTAs.
- iOS keeps highlight-plus-scale with no ripple.

### 4.4 Gesture navigation in layout

- **Floating tab bar.** Bottom margin = `insets.bottom` (gesture or three-button bar) + 8–12dp. **Nothing tappable inside the bottom mandatory gesture inset** [S80].
- **Horizontal carousels** (Pulse rails, the swipe deck): keep swipe-start zones out of `systemGestures` left and right, or exclude only small strips (≤200dp tall) [S81].
- **The Room's photo swipe deck** must not start at the screen edge.

### 4.5 Dynamic colour (Material You): stay out of it, and own the icon

- **Dynamic colour is opt-in** (`DynamicColors.applyToActivitiesIfAvailable`, Android 12+). The docs offer "keep brand colors static" or "harmonize" for brand apps [S85]. RN apps never call it, so **Blendn needs no opt-out code**.
- *Watch:* any Material component Blendn adopts natively (expo-ui Compose, NativeTabs' Material bar) might pick up dynamic colour. **UNVERIFIED.** Check before adopting.
- **Themed icons.**
  - Since Android 13, users can theme icons from the app's `<monochrome>` layer [S87].
  - **Since Android 16 QPR2, the system auto-generates a themed icon for apps that don't supply one, and apps can't opt out** [S86][S87].
  - Blendn's `adaptiveIcon` has no `monochromeImage` [S100]. Add a deliberate single-colour monogram via `android.adaptiveIcon.monochromeImage` [S72]: 108dp canvas, logo inside the **66dp** safe zone [S87].
- **Expanded dark theme / Force Dark** (Android 16 QPR2) inverts light apps. Force Dark is **not applied to dark themes** [S88][S89]. Blendn is `userInterfaceStyle: "dark"`, so it should be immune. *Verify the generated `styles.xml` theme parent is a dark (non-light) theme.* (UNVERIFIED for Expo's generated theme.)

### 4.6 The Android 12+ splash screen (for the planned animation)

**Constraints** [S90]:
- **One opaque background colour** (no gradient, no image) plus a centred icon.
- **Icon with an icon background:** 240×240dp canvas, content inside a **160dp circle**.
- **Icon without an icon background:** 288×288dp, content inside a **192dp circle**.
- **Animated icon (AVD):** a 432dp canvas with 288dp visible (4× the adaptive icon sizes).
  - Duration **≤1,000 ms** recommended on phones; start delay **≤166 ms**.
  - Android 12 needs `windowSplashScreenAnimationDuration`; 13+ infers it.
  - Use a looping AVD if startup exceeds 1 s.
- Optional branding image 200×80dp, which the guidelines discourage.
- Android 13+ can set `windowSplashScreenBehavior="icon_preferred"`.
- **No animation before Android 12** (the compat library is static) [S90].
- Shown on cold and warm starts only. A custom exit animation via `setOnExitAnimationListener` is possible natively [S90].

**Expo** [S91]:
- The `expo-splash-screen` plugin takes a static `image`/`imageWidth`/`backgroundColor` (+`dark`).
- `setOptions({ fade })` is **iOS-only**.
- **AVD icons aren't documented.** They would need a custom config plugin writing `windowSplashScreenAnimatedIcon`. Whether a maintained community plugin exists is **UNVERIFIED**.

**Implication for the splash design.**
- The system splash = the monogram (fitted to the 160/192dp circle; the gradient monogram is fine as an *icon*) on `#0F0E0E`.
- **The orbs cannot be in the system splash** (single opaque colour).
- Design the brand animation as a **hand-off in the first JS frame**: the same monogram at the same position, orbs blooming in on slow-spatial springs. That behaves identically on Android 11, 12+ and iOS.
- If an AVD is wanted later, keep it ≤1 s and vector-only, and make it end on the frame the JS hand-off starts from.

### 4.7 Smaller conventions

- **Top bars.**
  - Android titles are **start-aligned** by default. Centre alignment is a valid option, but Material advises the platform default, and always start-aligned when actions are present [S94][S95].
  - Back is the **arrow** icon on Android and the **chevron** on iOS (convention; M3 [S94]).
  - Material sizes: 64dp small, 112/120dp flexible [S16].
- **Back on tabs.** From Going, Banter or Me, back goes to **Pulse**, then exits. That is the fixed start destination [S102], and React Navigation's default `backBehavior: 'firstRoute'` [S101].
- **Toasts vs snackbars.**
  - From Android 12, toasts are limited to **2 lines plus the app icon**. Android recommends a **snackbar** for in-app messages [S92].
  - M3 snackbars: one action, auto-dismiss in **4–10 s**, nudged above FABs and nav, never covering frequent targets (snippet) [S93].
  - M3 metrics: 48dp single-line, 68dp two-line, 4dp corner [S16].
- **Tabs on Android.** NativeTabs is capped at **5 tabs** on Android by the platform Material component [S99]. Blendn's 4 tabs plus the disc would fit, but the disc can't live in it (see the iOS doc).
- **Large screens.** At target 36, orientation and resizability locks are **ignored on ≥600dp** [S66]. At target 37 the opt-out goes away [S67]. Tablets and foldables get the phone layout stretched unless the layout adapts.

### Implication for Blendn

- **Treat edge-to-edge as layout, not polish.**
  - Every screen pads with `systemBars ∪ displayCutout`.
  - The floating bar clears `mandatorySystemGestures`.
  - The top uses gradient protection over posters.
- **Keep predictive back off this cycle**, with a ticket to re-test when RN #58407 and the RN-screens predictive back land.
- **Ship the ripple on Android lists and cards.** It is the most visible "this is a real Android app" signal and it costs nothing.
- **Add the monochrome icon now.** Otherwise Android 16 QPR2 users already see an auto-filtered Blendn icon.
- **The splash animation is a JS hand-off, not an AVD.**

---

## 5. Cross-platform component column (Android vs iOS)

Shared tokens come from `research-ios-glass.md`: radii 8/16/24/32/pill, bg `#0F0E0E`, surface `#272525`, sunken `#211F1F`, and the spring table in §1.4.
- **iOS column:** HIG [S96][S97]. For the full detail see `research-ios-glass.md` §5; the iOS cells here are a summary of it.
- **Android numbers:** M3/M3E tokens [S16] unless stated.

| Component | Shared (both) | **Android: look** | **Android: behaviour** | iOS (summary) |
|---|---|---|---|---|
| **Tab bar** | Floating capsule; 4 destinations + centre Blend'n disc; labels always visible; selected = colour + pill indicator, **not bold** (M3E [S15]) | **64dp** capsule (M3E nav height [S16]), 16dp side margins. Tier A: shared-target blur + 0.55 overlay; Tier B: `rgba(33,31,31,0.94)` + hairline. Indicator pill **56×32dp** behind the icon (M3 [S16]), white 10%. Disc 56dp solid accent. No `elevation` on translucent; baked shadow | **Ripple** bounded to the indicator; no haptic on switch; disc = press-scale + `GESTURE_START`/`CONFIRM`; back from a non-Pulse tab → Pulse [S101][S102]; sits above `insets.bottom` + 8–12dp; hide-on-scroll only if TalkBack is off (MDC rule [S19]) | `GlassView` regular capsule on 26+, BlurView fallback; minimize-on-scroll later; selection capsule; `impactAsync` on disc [S96] |
| **Top bar** | Transparent at rest over orbs/posters; title in content on tab roots | Start-aligned title; **arrow** back icon; 64dp (M3 small) [S16][S94]; status-bar **gradient protection** [S79]; once scrolled: Tier A blur / Tier B `#0F0E0E` 0.92 + bottom hairline | Elevation change on scroll = surface change on an effects spring, not a shadow; back arrow `borderless` ripple, 48dp target | Centred title, chevron + text back, `headerTransparent` + scroll-edge effect |
| **Sheet** | Rounded top 24, grabber, scrim | **Opaque** `#272525` (never blur on Android: Modal window [S36]); drag handle **32×4dp** (M3 [S16]); scrim black 0.5 | Slides up on expressive **default-spatial** (380/0.8); system back = dismiss (`onRequestClose` mandatory); swipe-down dismiss; keyboard via `ime` insets; content respects the bottom `systemBars` inset | Native `formSheet` with detents and grabber, Liquid Glass at partial height (see iOS doc) [S97] |
| **Primary button** | **Solid accent pill**, 56dp, brand ink text | 56dp (M3 M button [S12]); **presses to a 12dp corner** (M3E pressed shape [S12]) on fast-spatial (800/0.6) | **Ripple** (foreground, white 12%) *plus* subtle scale 0.97; success `CONFIRM`, failure `REJECT`; disabled = 38% content, no ripple | Same pill; scale + highlight, no shape change; notification haptics |
| **Chip** | 32dp, pill or 16 radius, outline when unselected, filled when selected | 32dp tall (M3 chip [S16]); selected = `#F05423` 16% fill + accent outline + **emphasized label** weight; leading check only if multi-select | Ripple; `SEGMENT_TICK` (34+) / `CLOCK_TICK` fallback on selection; filter groups may use the M3E button-group width squeeze | Same visual; selection haptic; no ripple |
| **Toggle** | Brand-coloured track | **Material switch geometry**: 52×32 track, thumb **16 → 24dp** (28 pressed), track outline 2dp off [S16]; on = accent track, white thumb | Thumb travels on fast-spatial; `TOGGLE_ON`/`TOGGLE_OFF` (34+) / `CONTEXT_CLICK` fallback; 48dp touch row | `UISwitch` proportions (native look); selection haptic |
| **Card** | **Solid** `#272525`, radius 32 (24 media inside); never glass | Same; no Android elevation (flat, a hairline on dark) | **Foreground ripple** over imagery; long-press = `LONG_PRESS` + action tray; press-scale only on swipe-deck cards | Same visual; highlight/scale; context menu |
| **Dialog** | Use rarely; destructive confirmations only | **Opaque** `#272525`, radius **28** (M3 [S16]), scrim 0.5; **buttons right-aligned, text-style, confirm on the right** (Material convention, UNVERIFIED against a fetched M3 page) | Back/outside-tap = cancel (unless destructive-in-progress); `REJECT` on destructive confirm is *not* needed | `Alert`: centred, stacked or side-by-side buttons, bold default |
| **Toast / snackbar** | In-app feedback strip, 1 action max | **Snackbar** (not `ToastAndroid`, which is limited to 2 lines + icon [S92]): `#272525` capsule, 48/68dp [S16], above the tab bar | Auto-dismiss **4–10 s** (snippet [S93]); swipe to dismiss; announce via `accessibilityLiveRegion="polite"`; no haptic except on error | Top or bottom capsule; glass on 26+ per iOS doc |
| **List row** | 56–72dp, avatar/leading, trailing meta | Full-bleed rows on `#0F0E0E`, or M3E **segmented** container (16 radius group, 4dp item corners [S16]) for settings | **Ripple** (bounded), `LONG_PRESS` for actions; swipe actions keep clear of `systemGestures` edges | Inset-grouped on settings; highlight; swipe actions (trailing) |

**Global behavioural deltas (Android)**
1. Back is a system gesture everywhere. Every overlay closes on back.
2. Ripple is the default press feedback, and scale is reserved for heroes.
3. Haptics come from `performHapticFeedback` constants only.
4. Edge-to-edge inset rules hold on every screen.
5. Blur is gated, chrome-only and shared.
6. No `ToastAndroid`.

---

## Sources

[S1]: https://design.google/library/expressive-material-design-google-research
[S2]: https://m3.material.io/styles/motion/overview/how-it-works
[S3]: https://m3.material.io/blog/m3-expressive-motion-theming
[S4]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt
[S5]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StandardMotionTokens.kt
[S6]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/MotionScheme.kt
[S7]: https://github.com/androidx/androidx/blob/androidx-main/compose/animation/animation-core/src/commonMain/kotlin/androidx/compose/animation/core/SpringSimulation.kt
[S8]: https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/
[S9]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/MaterialShapes.kt
[S10]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ShapeTokens.kt
[S11]: https://developer.android.com/develop/ui/compose/graphics/draw/shapes
[S12]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt
[S13]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt
[S14]: https://github.com/material-components/material-components-android/blob/master/docs/theming/Typography.md
[S14b]: https://github.com/material-components/material-components-android/blob/master/docs/theming/Shape.md
[S15]: https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md
[S16]: https://github.com/androidx/androidx/tree/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens
[S16b]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ShortNavigationBar.kt
[S17]: https://github.com/material-components/material-components-android/blob/master/docs/components/LoadingIndicator.md
[S18]: https://github.com/material-components/material-components-android/blob/master/docs/components/ProgressIndicator.md
[S19]: https://github.com/material-components/material-components-android/blob/master/docs/components/FloatingToolbar.md
[S20]: https://supercharge.design/blog/material-3-expressive
[S21]: https://developer.android.com/jetpack/androidx/releases/compose-material3
[S22]: https://9to5google.com/2025/09/03/android-16-qpr1-pixel/
[S22a]: https://9to5google.com/2025/05/13/android-16-material-3-expressive-redesign/
[S23]: https://9to5google.com/2025/08/26/gmail-material-3-expressive-redesign/
[S24]: https://9to5google.com/2025/06/02/google-messages-material-3-expressive-chat/
[S25]: https://www.androidauthority.com/android-16-beta-background-blur-battery-saver-3562789/
[S26]: https://www.androidauthority.com/android-reduce-blur-effects-setting-3601579/
[S27]: https://www.androidauthority.com/google-pixel-how-turn-off-background-blur-android-16-qpr2-3621871/
[S28]: https://developer.android.com/reference/android/graphics/RenderEffect
[S29]: https://developer.android.com/reference/android/view/WindowManager#isCrossWindowBlurEnabled()
[S30]: https://developer.android.com/reference/android/view/Window#setBackgroundBlurRadius(int)
[S31]: https://source.android.com/docs/core/display/window-blurs
[S32]: https://developer.android.com/jetpack/androidx/releases/compose-ui
[S33]: https://docs.expo.dev/versions/latest/sdk/blur-view/
[S34]: https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/blur-view.mdx
[S35]: https://github.com/expo/expo/blob/main/packages/expo-blur/CHANGELOG.md
[S36]: https://github.com/expo/expo/issues/44165
[S37]: https://github.com/expo/expo/discussions/37905
[S38]: https://github.com/expo/expo/blob/sdk-57/packages/expo-blur/android/src/main/java/expo/modules/blur/ExpoBlurView.kt
[S39]: https://github.com/Dimezis/BlurView
[S40]: https://github.com/Kureev/react-native-blur
[S41]: https://wcandillon.github.io/react-native-skia/docs/backdrops-filters
[S42]: https://chrisbanes.github.io/haze/latest/blur/platforms/
[S43]: https://chrisbanes.github.io/haze/latest/performance/
[S44]: https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/messenger/SharedConfig.java
[S45]: https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/messenger/LiteMode.java
[S46]: https://gs.statcounter.com/android-version-market-share/mobile/india
[S47]: https://developer.android.com/reference/android/os/Build.VERSION#MEDIA_PERFORMANCE_CLASS
[S48]: https://developer.android.com/reference/android/app/ActivityManager#isLowRamDevice()
[S49]: https://docs.expo.dev/versions/latest/sdk/device/
[S50]: https://docs.expo.dev/versions/latest/sdk/battery/
[S51]: https://developer.android.com/topic/performance/rendering/overdraw
[S52]: https://developer.android.com/develop/ui/views/haptics/haptics-principles
[S53]: https://developer.android.com/develop/ui/views/haptics/haptic-feedback
[S54]: https://developer.android.com/develop/ui/views/haptics/custom-haptic-effects
[S55]: https://developer.android.com/reference/android/view/HapticFeedbackConstants
[S56]: https://developer.android.com/reference/android/os/VibrationEffect
[S57]: https://developer.android.com/reference/android/os/VibrationEffect.Composition
[S58]: https://source.android.com/docs/core/interaction/haptics/haptics-ux-foundation
[S59]: https://developer.android.com/reference/android/view/View#performHapticFeedback(int)
[S60]: https://docs.expo.dev/versions/latest/sdk/haptics/
[S61]: https://github.com/expo/expo/blob/sdk-57/packages/expo-haptics/android/src/main/java/expo/modules/haptics/HapticsModule.kt
[S62]: https://github.com/expo/expo/tree/sdk-57/packages/expo-haptics/android/src/main/java/expo/modules/haptics/arguments
[S63]: https://github.com/expo/expo/blob/sdk-57/packages/expo-haptics/android/src/main/java/expo/modules/haptics/HapticsRecord.kt
[S64]: https://github.com/expo/expo/blob/main/packages/expo-haptics/CHANGELOG.md
[S65]: https://registry.npmjs.org/expo-haptics
[S66]: https://developer.android.com/about/versions/16/behavior-changes-16
[S67]: https://developer.android.com/about/versions/17/behavior-changes-17
[S68]: https://developer.android.com/google/play/requirements/target-sdk
[S69]: https://reactnative.dev/blog/2025/08/12/react-native-0.81
[S70]: https://expo.dev/changelog/sdk-55
[S71]: https://expo.dev/changelog/sdk-57
[S72]: https://docs.expo.dev/versions/latest/config/app/
[S73]: https://github.com/expo/expo/blob/sdk-57/packages/@expo/config-plugins/src/android/PredictiveBackGesture.ts
[S74]: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture
[S75]: https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back
[S76]: https://github.com/react/react-native/issues/58407
[S77]: https://github.com/software-mansion/react-native-screens/discussions/2540
[S78]: https://developer.android.com/develop/ui/views/layout/edge-to-edge
[S79]: https://developer.android.com/design/ui/mobile/guides/foundations/system-bars
[S80]: https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav
[S81]: https://developer.android.com/reference/android/view/View#setSystemGestureExclusionRects(java.util.List%3Candroid.graphics.Rect%3E)
[S82]: https://docs.expo.dev/versions/latest/sdk/navigation-bar/
[S83]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt
[S84]: https://reactnative.dev/docs/pressable
[S85]: https://developer.android.com/develop/ui/views/theming/dynamic-colors
[S86]: https://9to5google.com/2025/09/16/android-16-auto-themed-icons-apps-cant-opt-out/
[S87]: https://developer.android.com/develop/ui/views/launch/icon_design_adaptive
[S88]: https://www.androidpolice.com/android-16-qpr2-beta-1-forced-dark-mode/
[S89]: https://developer.android.com/develop/ui/views/theming/darktheme
[S90]: https://developer.android.com/develop/ui/views/launch/splash-screen
[S91]: https://docs.expo.dev/versions/latest/sdk/splash-screen/
[S92]: https://developer.android.com/guide/topics/ui/notifiers/toasts
[S93]: https://m3.material.io/components/snackbar/guidelines
[S94]: https://m3.material.io/components/app-bars/guidelines
[S95]: https://developer.android.com/develop/ui/compose/components/app-bars
[S96]: https://developer.apple.com/design/human-interface-guidelines/tab-bars
[S97]: https://developer.apple.com/design/human-interface-guidelines/sheets
[S98]: https://reactnative.dev/docs/accessibilityinfo
[S99]: https://docs.expo.dev/router/advanced/native-tabs/
[S100]: file://the local client checkout (origin/dev @ 54481d2: package.json, app.json, components/motion/ScalePress.tsx, components/motion/RisingSheet.tsx, components/ActionTray.tsx, lib/useInteractionFeedback.ts)
[S101]: https://reactnavigation.org/docs/bottom-tab-navigator/
[S102]: https://developer.android.com/guide/navigation/principles

_The `[Sn]` markers in the text are reference links that resolve to the definitions above._
