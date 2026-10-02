# Research: Apple Liquid Glass, and implementing it in Expo SDK 57 for Blendn

Prepared 2026-10-02 for the Blendn mobile redesign brief (Claude Design).
Scope: what Liquid Glass is and where Apple allows it; accessibility and how it has changed through iOS 27; what Expo SDK 57 can do today; how production React Native apps handle it; and concrete values for Blendn.

**How this was researched.** Apple HIG pages were read from their JSON source (`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`), along with Apple developer docs and WWDC25/WWDC26 session transcripts. The Expo docs were read as raw markdown for v57, along with the Expo package CHANGELOGs and source on the `sdk-57` branch, the expo/expo and react-native-screens GitHub issues, and npm dist-tags. Secondary sources are used only where Apple and Expo say nothing, and they are labelled as secondary.
**Legend.** Each claim carries its source link. **UNVERIFIED** means I could not confirm the claim in a primary source. *Inference* means my own reading of a primary source, not something the source says.

**The client as it stands** (blendn repo, `origin/dev` @ `54481d2`, 2026-10-01):

| Thing | Value |
|---|---|
| expo / RN | `expo ~57.0.25`, `react-native 0.86.3` |
| Navigation | `expo-router ~57.0.23`, `react-native-screens ~4.26.0`, tabs via `expo-router/js-tabs` with a custom `tabBar` (`app/(tabs)/_layout.tsx`) |
| Effects | `expo-blur ~57.0.3`. Not installed: `expo-glass-effect`, `@expo/ui` |
| Appearance | `userInterfaceStyle: "dark"`, scene life cycle adopted, release builds on Xcode 27 (team memory) |
| Bar today | Flat opaque `surfaceSunken #211F1F`, top corners 32, a 56pt flat-accent centre disc with four states, an avatar on the Me tab |
| Tokens | `SPACE` 2/4/8/12/16/24/32/48 · `GUTTER` 24 · `CONTROL` 56/48/32 · `EMBER_RADIUS` 8/16/24/32/pill · `EMBER.accent` **`#FF906D`** · `bg #0F0E0E` |

Two things in the repo bear directly on this brief:
- `EMBER.accent` is `#FF906D`, but the brief says orange `#F05423`, and the Android adaptive-icon background is `#F05524`. Decide which one is "the" accent before tint values are fixed.
- `tasks/lessons.md` → *Visual design*: "**No glows, blooms or glass stacks.** The user rejected the frosted-glass CTA with an orange bloom, and the pulsing halo on the room button, as 'very AI generated'." The new glass direction has to respect this. Section 5 does: glass only on neutral chrome, no blooms, no orange-tinted glass CTAs.

---

## TL;DR (the ten things that matter most)

1. **Liquid Glass belongs to the navigation and control layer only.** It goes on tab bars, toolbars, sheets, menus, popovers and floating controls, never on lists, cards or backgrounds. Apple also says **no glass on glass**, and **regular** is the default variant. **Clear** is only for controls over media, and it needs a ~35% dark dimming layer ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)).
2. **You can no longer opt out.** `UIDesignRequiresCompatibility` is ignored when building with the iOS 27 SDK ([Apple](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility), [WWDC26 State of the Union](https://developer.apple.com/videos/play/wwdc2026/102/)). Blendn builds on Xcode 27, so every *native* surface it uses already renders Liquid Glass on iOS 26/27: native-stack headers, formSheets, alerts, menus and switches. The custom JS bar is the odd one out.
3. **iOS 27 (WWDC26, June 8 2026) made glass more legible, not less glassy.** It adds a darkened edge, brighter specular highlights and stronger diffusion, plus a user slider from "ultra-clear" to "fully tinted" (Settings › Appearance › Liquid Glass). Apps pick this up without recompiling ([WWDC26 102](https://developer.apple.com/videos/play/wwdc2026/102/), [Apple Support](https://support.apple.com/guide/iphone/adjust-iphone-display-and-text-settings-iphd6804774e/ios)).
4. **Accessibility is automatic only on real glass.** Under Reduce Transparency, `UIGlassEffect` goes frostier. Under Increase Contrast it goes black/white with a border. Under Reduce Motion it loses its elasticity ([WWDC25 219](https://developer.apple.com/videos/play/wwdc2025/219/)). Your **fallbacks** (BlurView, scrims, Android) have to implement all of this themselves.
5. **`expo-glass-effect` 57.0.4 is the floor.** It fixes glass that silently never renders after a fade from low opacity ([CHANGELOG](https://github.com/expo/expo/blob/sdk-57/packages/expo-glass-effect/CHANGELOG.md), [PR #48994](https://github.com/expo/expo/pull/48994)). Below iOS 26, `GlassView` is an **empty transparent view**, not a blur ([docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/), [source](https://github.com/expo/expo/blob/sdk-57/packages/expo-glass-effect/ios/GlassView.swift)).
6. **Do not animate opacity on glass, or on any ancestor of glass.** That is the single biggest source of production bugs ([#41024](https://github.com/expo/expo/issues/41024), [#50097](https://github.com/expo/expo/issues/50097), [UIVisualEffectView "Set the correct alpha value"](https://developer.apple.com/documentation/uikit/uivisualeffectview)). Animate `glassEffectStyle` (`'none'` ↔ `'regular'`, `animate: true`) or transforms instead.
7. **NativeTabs cannot host the Blend'n disc.** Native tabs are icon + label + badge only, and `tabPress` is not preventable (*inference* from the published type). They also cannot be measured, and on SDK 57 they are still `unstable-native-tabs`. The stable version only arrives with SDK 58, which is in beta ([docs](https://docs.expo.dev/router/advanced/native-tabs/), [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)). Apple's own emphasised tab (iOS 27 `prominentTabIdentifier`) sits at the **trailing edge**, not the centre ([WWDC26 269](https://developer.apple.com/videos/play/wwdc2026/269/), [WWDC26 278](https://developer.apple.com/videos/play/wwdc2026/278/)). **Keep the custom JS bar and make it a `GlassView` capsule.**
8. **RN children of a `GlassView` do not flip light/dark with the glass.** Expo says it outright for tabs: "There is no callback for this" ([native tabs](https://docs.expo.dev/router/advanced/native-tabs/)). White glyphs on glass that has flipped light over a bright poster become illegible. Force `colorScheme="dark"` and test against the brightest posters.
9. **Dark native formSheets get a bright interactive "flare" under the finger.** react-native-screens never sets `sheetPresentationController.backgroundEffect`. The issue is open and reported on exactly Blendn's stack (Expo 57, RN 0.86.3, RNS 4.26) ([RNS #4605](https://github.com/software-mansion/react-native-screens/issues/4605)).
10. **Android is ~93% of Indian mobile** ([StatCounter, Aug 2026](https://gs.statcounter.com/os-market-share/mobile/india)). Glass is an iOS enhancement. The design has to look finished as solid or translucent surfaces with no blur at all.

---

## 1. What Liquid Glass is, and where Apple allows it

### 1.1 The material

- **A "digital meta-material."** "Liquid Glass is a new digital meta-material that dynamically bends and shapes light… behaves and moves organically in a manner that feels more like a lightweight liquid" ([Meet Liquid Glass, WWDC25 219](https://developer.apple.com/videos/play/wwdc2025/219/)).
- **Lensing and refraction.** "The primary way Liquid Glass visually defines itself is through something called Lensing… Whereas previous materials scattered light, this new set of materials dynamically bends, shapes, and concentrates light in real time." Objects "materialize in and out by gradually modulating the light bending and lensing" rather than fading (same source). This is why opacity fades look wrong and break the native view; see §3.2.
- **Specular highlights.** "Light sources… shine on the material producing highlights that respond to geometry… in some cases, the lighting responds to device motion" (219). iOS 27 made the highlights brighter (§2.3).
- **Adaptive shadow.** The shadow "increases the opacity of its shadow when it is over text… lowers the opacity… over a solid light background" (219).
- **Adaptive tint and dynamic range.** "The amount of tint and the dynamic range shift to always ensure buttons remain legible… it can also independently switch between light and dark" (219).
- **Size changes the material.**
  - Small elements (nav bars, tab bars) flip light↔dark with the content behind them. Larger ones (menus, sidebars) adapt "but they don't flip from light to dark" (219).
  - Glass that grows to a larger size, like a menu opening from a button, "casts deeper, richer shadows, has more pronounced lensing" (219).
  - From UIKit: "A larger size is more opaque. A smaller size is clearer, and switches between light and dark mode automatically" ([Build a UIKit app with the new design, WWDC25 284](https://developer.apple.com/videos/play/wwdc2025/284/)).
  - Callstack observed that above about **65pt of height** the glass stops adapting its text colour ([callstack/liquid-glass README](https://github.com/callstack/liquid-glass); secondary, empirical).
- **Interactive response.** "When you interact with Liquid Glass, the material illuminates from within… the glow spreads throughout the element and onto any Liquid Glass elements nearby" (219). In UIKit, `UIGlassEffect.isInteractive = true` makes a view "scale and bounce" like system buttons (284). In SwiftUI the equivalent is `.interactive()` ("scaling, bouncing, and shimmering", [WWDC25 323](https://developer.apple.com/videos/play/wwdc2025/323/)).
- **Tinting is "stained glass."** "Selecting a color generates a range of tones that are mapped to content brightness underneath the tinted element." Apple explicitly contrasts this with a solid fill, which "is completely opaque and breaks the visual character of Liquid Glass" (219).

### 1.2 Variants

The SwiftUI `Glass` struct has `.regular`, `.clear`, `.identity` (no effect), `.tint(_:)` and `.interactive(_:)` ([Glass](https://developer.apple.com/documentation/swiftui/glass)). The UIKit equivalent is `UIGlassEffect` ([docs](https://developer.apple.com/documentation/uikit/uiglasseffect)), both iOS 26.0+.

| | Regular | Clear |
|---|---|---|
| What it is | "blurs and adjusts the luminosity of background content to maintain legibility" ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)) | "highly translucent… ideal for prioritizing the visibility of the underlying content" (HIG) |
| Adaptivity | Full adaptive behaviour. "It works in any size, over any content and anything can be placed on top of it" (219) | "does not have adaptive behaviors. It is permanently more transparent" (219) |
| Use | The default; "Most system components use this variant", especially anything text-heavy such as alerts, sidebars and popovers (HIG) | Only when **all three** hold: over media-rich content, the content tolerates a dimming layer, and the content on top is "bold and bright" (219) |
| Dimming | Not needed | "If the underlying content is bright, consider adding a dark dimming layer of **35% opacity**" (HIG). Not needed over dark content or with AVKit controls (HIG) |
| Mixing | "They should never be mixed" (219) | |

### 1.3 Placement rules (HIG and WWDC)

- **Navigation and control layer only.** Liquid Glass "forms a distinct functional layer for controls and navigation elements… Don't use Liquid Glass in the content layer." The exception is transient controls (slider and toggle knobs) that "take on a Liquid Glass appearance… when a person activates it" ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)). Use **standard materials** (UIBlurEffect: ultraThin/thin/regular/thick) for structure *within* the content layer (HIG).
- **Use it sparingly.** "Limit these effects to the most important functional elements in your app" (HIG and [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).
- **No glass on glass.** "Always avoid glass on glass… When placing elements on top of Liquid Glass, avoid applying the material to both layers. Instead, use fills, transparency, and vibrancy for the top elements" (219).
- **Glass cannot sample other glass.** "Glass can not sample other glass, so having nearby glass elements in different containers will result in inconsistent behavior. Using a glass container allows these elements to share their sampling region" (323). `GlassEffectContainer` also performs better: "Creating too many Liquid Glass effect containers and applying too many effects to views outside of containers can degrade performance" ([Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)).
- **Container spacing controls merging.** "A spacing value on the container that's larger than the spacing of an interior HStack… causes Liquid Glass effects to blend together at rest" (same article).
- **Keep content and glass apart at rest.** "In steady states, such as when an app first launches, avoid intersections between content and Liquid Glass" (219). For full-screen backgrounds, "extend it underneath sidebars, toolbars, and tab bars" ([HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout)).

**Tab bars** ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), last updated June 8 2026):
- On iOS the bar "floats above content at the bottom of the screen. Its items rest on a Liquid Glass background."
- It is for navigation, "not to provide actions". Don't hide or disable tab buttons. Include labels, as single words. Prefer **filled** SF Symbols.
- Badges are for critical information only.
- "Avoid applying a similar color to tab labels and content layer backgrounds… prefer a monochromatic appearance."
- **Minimize on scroll.** Apps opt in with `tabBarMinimizeBehavior` (`.onScrollDown` / `.onScrollUp`). A tab tap or a scroll back to the top restores the bar (HIG, 284).
- **Bottom accessory.** For persistent features only, like Music's mini-player: "Avoid placing screen-specific actions here — a checkout button, for example, belongs with the content" ([Get to know the new design system, WWDC25 356](https://developer.apple.com/videos/play/wwdc2025/356/)). When the bar minimizes, the accessory animates inline ([UITabBarController.bottomAccessory](https://developer.apple.com/documentation/uikit/uitabbarcontroller/bottomaccessory), 284).
- **Search tab.** A dedicated search tab sits at the trailing end, separated from the other tabs (HIG; Adopting).
- **New in iOS 27: prominent tab.** `prominentTabIdentifier` gives a tab "enhanced visual emphasis"; it defaults to the search tab ([Apple docs](https://developer.apple.com/documentation/uikit/uitabbarcontroller/prominenttabidentifier), iOS 27.0+). "The prominent tab is always visible, even when the tab bar collapses during scrolling" ([WWDC26 278](https://developer.apple.com/videos/play/wwdc2026/278/)). In SwiftUI the new prominent role places it "on the bottom trailing edge of the screen" ([WWDC26 269](https://developer.apple.com/videos/play/wwdc2026/269/)).

**Toolbars and nav bars** ([HIG Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)):
- "Reduce the use of toolbar backgrounds and tinted controls… use a ScrollEdgeEffectStyle when necessary."
- Prefer borderless system symbols.
- One primary action, using the `.prominent` style, on the trailing side.
- At most about three groups; don't mix text and icon items in one group.
- Titles under 15 characters.
- Large titles collapse on scroll.
- Grouping (284):
  - Image buttons share one glass background.
  - Text buttons, Done/Close and prominent buttons each get their own.
  - A `fixedSpace` splits groups.
- iOS 27 nav bars can also minimize on scroll (`barMinimizationBehavior`, 278; I could not find this API page on developer.apple.com, so it is per the session only).

**Sheets:**
- "Sheets feature an increased corner radius, and half sheets are inset from the edge of the display… When a half sheet expands to full height, it transitions to a more opaque appearance" ([Adopting](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).
- "At smaller heights, the bottom edges pull in, nesting in the curved edges of the display… becoming opaque and anchoring to the edge of the screen. If you've used presentationBackground… consider removing that" (323).
- Use a dimming layer when a task *interrupts* the flow, and none when it runs *in parallel* (356).
- Include a grabber on resizable sheets, support swipe-to-dismiss, show one sheet at a time, and pair Cancel with Done ([HIG Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)).

**Buttons** ([HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)):
- Hit region at least **44×44pt**.
- Always provide a press state.
- At most **one or two prominent buttons per view**. Use style, not size, to mark the preferred choice.
- Use the API styles `.glass` / `.glassProminent` in SwiftUI, and `glass()`, `prominentGlass()`, `clearGlass()`, `prominentClearGlass()` in UIKit (Adopting).

**Menus, popovers and action sheets:**
- "Buttons fluidly morph into menus and popovers" (Adopting).
- "When showing a menu, the bubble simply pops open to reveal the content… right where you just tapped" (219).
- Action sheets now spring from their source element, not the screen bottom (356, Adopting).
- In UIKit, "Menus get this behavior automatically. Popovers also get this new animation when their source is a barButtonItem" (284).
- Popovers are avoided in compact width ([HIG Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers)).

**Concentricity and capsules** (356):
- "We use three shape types to build concentric layouts: **fixed** shapes have a constant corner radius. **Capsules** use a radius that's half the height of the container. And **concentric** shapes calculate their radius by subtracting padding from the parent's."
- "For phone layouts, use a capsule with extra margin to create space near the screen edge."
- "Use a concentric shape with a fallback radius. The concentric value adapts when nested, and the fallback kicks in when the component stands alone."
- The APIs are `ConcentricRectangle` / `.containerConcentric` in SwiftUI and `cornerConfiguration` / `.containerRelative` in UIKit ([ConcentricRectangle](https://developer.apple.com/documentation/swiftui/concentricrectangle), 284, 323).
- From HIG Toolbars: "If you need to create a custom component, ensure that its corner radius is also concentric with the bar's corners."

**Scroll edge effects:**
- "Scroll edge effects aren't decorative. They don't block or darken like overlays."
- Use them only where a scroll view sits behind floating UI, one per view.
- Prefer `automatic` ([HIG Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views), updated June 8 2026).
- Soft is the iOS default and hard is "mostly used on macOS"; don't stack them (356).
- **iOS 27 changed `.automatic`**: it "no longer switches between the existing soft and hard styles but provides its own visuals… If you have overridden the style… re-evaluate, especially when set to .soft" (278).
- For custom bars, register them with `UIScrollEdgeElementContainerInteraction` (UIKit) or `safeAreaBar` (SwiftUI) (Adopting, [UIScrollEdgeEffect](https://developer.apple.com/documentation/uikit/uiscrolledgeeffect)).

**Colour on glass** ([HIG Color › Liquid Glass color](https://developer.apple.com/design/human-interface-guidelines/color#Liquid-Glass-color)):
- "By default, Liquid Glass has no inherent color."
- "Apply color sparingly… To emphasize primary actions, apply color to the background rather than to symbols or text… Refrain from adding color to the background of multiple controls."
- "If your app features colorful backgrounds… prefer a monochromatic appearance for toolbars and tab bars."
- WWDC25 323: "The monochrome palette reduces visual noise."

### Implication for Blendn

- **The ambient orbs are content-layer background, and that is exactly what Apple wants behind glass.** They must sit *under* solid cards and *extend under* the bars.
- **Tab bar labels go monochrome (white).** The orbs are orange and violet, so an orange-on-glass selected label fights the content, which the HIG warns against. Reserve brand colour for one thing per screen: the Blend'n disc, or that screen's primary CTA.
- **Pills on photos inside feed cards are content-layer.** Making them `GlassView` breaks the HIG rule and costs performance (many glass views mounting and unmounting in a list). Give them a scrim pill instead (§5). Real glass over imagery is only for *controls* on a single hero image, as clear glass with a 35% dimming layer.
- **The centre disc sits *on* the glass bar, so it must not itself be glass.** Use the flat accent fill it already has. That is HIG-correct ("use fills… for the top elements") and also satisfies `tasks/lessons.md` (no glass stacks, no bloom).

---

## 2. Accessibility, the 2025 backlash, and iOS 27

### 2.1 What glass does under each setting (automatic only for real glass)

From [Meet Liquid Glass (219)](https://developer.apple.com/videos/play/wwdc2025/219/):
- **Reduce Transparency** "makes Liquid Glass frostier and obscures more of the content behind it."
- **Increase Contrast** "makes elements predominantly black or white and highlights them with a contrasting border."
- **Reduce Motion** "decreases the intensity of some effects and disables any elastic properties."
- "These are available automatically whenever you use the new material."

Apple's own testing advice: "people can choose a preferred look for Liquid Glass… or turn on accessibility settings that reduce transparency or motion… Ensure you test your app's custom elements, colors, and animations with different configurations of these settings" ([Adopting](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).

In React Native you can read:

| Setting | API |
|---|---|
| Reduce Transparency | `AccessibilityInfo.isReduceTransparencyEnabled()` and `reduceTransparencyChanged` (iOS) |
| Reduce Motion | `isReduceMotionEnabled()` and `reduceMotionChanged` |
| Increase Contrast | `isDarkerSystemColorsEnabled()` (iOS). This is a query only; the docs list no change event |
| Cross-fade | `prefersCrossFadeTransitions()` |

Sources: [RN AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo). `DynamicColorIOS` takes `highContrastDark` ([docs](https://reactnative.dev/docs/dynamiccolorios)).
Expo warns that `isLiquidGlassAvailable()` can be `true` even when the user has limited glass through accessibility settings: "use `AccessibilityInfo.isReduceTransparencyEnabled()`" ([glass-effect docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/)).
- UNVERIFIED: that `UIBlurEffect` (and so `expo-blur` on iOS) becomes an opaque fill under Reduce Transparency. This is widely reported but I found no Apple doc that states it. Handle it explicitly.
- UNVERIFIED: any public API to read the user's Clear/Tinted choice or the iOS 27 slider value. I found none, and secondary sources found none either.

### 2.2 The 2025 criticism and Apple's responses

- **Beta 1 (June 2025)** was criticised as hard to read in Notification Center and Control Center. Beta 2 increased opacity and blur there ([MacRumors guide](https://www.macrumors.com/guide/ios-26-liquid-glass/), [GSMArena](https://m.gsmarena.com/ios_26_beta_2_tones_down_the_liquid_glass_effect-amp-68379.php); secondary).
- **NN/g, "Liquid Glass Is Cracked" (Oct 2025)** ([nngroup.com](https://www.nngroup.com/articles/liquid-glass/)):
  - "Text on top of images is a bad idea because the contrast… is often too low."
  - Tab bars are "cramped, squeezed to make room for the ever present search button."
  - Animated buttons are "distraction with a side of nausea."
  - It cites the long-standing ≥1cm×1cm targets and ≥0.4cm spacing.
- **iOS 26.1 (Nov 2025).** "Liquid Glass setting gives you the option to choose between the default clear look or a new tinted look which increases opacity of the material in apps and notifications on the Lock Screen" ([Apple Support, About iOS 26 Updates](https://support.apple.com/en-us/123075)). It lived in Settings › Display & Brightness › Liquid Glass ([TidBITS](https://tidbits.com/2025/10/21/ios-26-1-to-add-optional-opacity-to-liquid-glass/)).
- **A later 26.x point release** added a Lock Screen time option "giving the Liquid Glass material more or less opacity" ([Apple Support 123075](https://support.apple.com/en-us/123075)). My parse put it under 26.2, but the page's version headings are ambiguous, so the exact version is UNVERIFIED.
- **iOS 26.4 (Apr 2026)** ([Apple Support 123075](https://support.apple.com/en-us/123075); the version comes from [9to5Mac](https://9to5mac.com/2026/04/10/ios-26-4-adds-setting-to-let-you-change-new-liquid-glass-effect/) and [Cult of Mac](https://www.cultofmac.com/how-to/reduce-bright-effects-ios-26-4-liquid-glass), because Apple's page layout makes its version heading ambiguous):
  - **Reduce Bright Effects** "minimizes bright flashes when tapping on elements like buttons."
  - "Reduce Motion setting more reliably reduces the animations of Liquid Glass."
- **Adoption.** As of June 7 2026, **79% of all iPhones** and **86% of iPhones from the last four years** run iOS 26 ([Apple, App Store usage](https://developer.apple.com/support/app-store/)). Roughly 1 in 5 iPhones were still pre-glass going into iOS 27.

### 2.3 iOS 27 / WWDC26 (June 8 2026)

- **Material refinements.** "To maintain exceptional readability, we tuned Liquid Glass so it more effectively diffuses complex content behind it. And to establish more depth and separation, we also introduced a **darkened edge** along with **brighter specular highlights**… a new slider in settings to adjust Liquid Glass anywhere from ultra clear to fully tinted… Apps already using Liquid Glass get these improvements automatically… without even needing to recompile" ([Platforms State of the Union, WWDC26 102](https://developer.apple.com/videos/play/wwdc2026/102/)). Also: "Liquid Glass seamlessly adapts to a variety of accessibility settings… such as reducing transparency or increasing contrast" (same).
- **Setting path.** "Settings… tap Appearance, then tap Liquid Glass. Drag the slider to the right to increase the tint… Note: If you turned on Reduced Transparency or Increased Contrast in Accessibility settings, you need to turn them off to change the look for Liquid Glass" ([Apple Support](https://support.apple.com/guide/iphone/adjust-iphone-display-and-text-settings-iphd6804774e/ios)). Release notes: "Liquid Glass refinements improve overall readability, and a new slider in Settings lets you personalize its appearance from ultra-clear to fully tinted" ([About iOS 27 Updates](https://support.apple.com/en-us/149076)).
- **No opting out.** "We'll be removing support for opting to use the old design. So once your app is recompiled with Xcode 27, it will automatically begin to use the new design" (102). Apple's docs: "The system ignores this key when you build for iOS 27 or later" ([UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)).
- **UIKit and SwiftUI changes** (278, 269):
  - Prominent tab (`prominentTabIdentifier`), placed at the trailing edge in SwiftUI.
  - iPhone sidebars (`sidebar.preferredPlacement = .sidebar`).
  - Nav-bar minimization (`barMinimizationBehavior`).
  - New `.automatic` scroll-edge visuals.
  - Glass "automatically responds to the new Liquid Glass slider to adjust its tint" (269).
- **Sidebars** run full-edge with refraction continuing beneath them ([MacRumors](https://www.macrumors.com/2026/06/08/apple-announces-liquid-glass-improvements/); secondary).
- **Tab bar search "re-integration"** in iOS 27 is UNVERIFIED (reported only by [TechTimes](https://www.techtimes.com/articles/317975/20260608/apple-liquid-glass-ios-27-wwdc-2026-brings-refinements-developers-must-adopt-today.htm)).
- **React Native consequences already filed:**
  - Building against the iOS 27 SDK makes `role="search"` lose its detached chrome in react-native-screens. **Open** ([RNS #4671](https://github.com/software-mansion/react-native-screens/issues/4671)).
  - A transparent-header scroll-edge report on iOS 27 was closed as not-a-bug once built with Xcode 27 ([RNS #4776](https://github.com/software-mansion/react-native-screens/issues/4776)). A commenter there notes that iOS 27's automatic style picked **hard** under the header.

### Implication for Blendn

- **Our custom glass must reproduce the system's accessibility behaviour on every fallback path.** iOS 26+ glass handles Reduce Transparency, Increase Contrast and Reduce Motion itself. Our iOS < 26 BlurView, Android and scrim surfaces do not.
- **Never put text on clear glass over a poster without the 35% dim.** NN/g's sharpest criticism is text over images, and a nightlife feed is made of images.
- **Test on dark surfaces with Reduce Bright Effects both off and on.** Interactive glass flashes bright on touch, which is the 26.4 setting's whole reason to exist. On a near-black UI that flash is at its most visible (see the formSheet flare in §3.6). Use `isInteractive` only on small standalone glass buttons, never on large dark surfaces.
- **Don't design against a fixed glass look.** The user can slide anywhere from ultra-clear to fully tinted. Every glyph on glass must pass contrast at the *clear* end. Design for clear and you get tinted for free.

---

## 3. What Expo SDK 57 can do

Versions as of 2026-10-02:
- `expo` latest is **57.0.26**; SDK 58 is in **beta** (`next` = 58.0.2, announced Sep 15 2026) (`npm view expo dist-tags`; [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)).
- `expo-glass-effect` latest/sdk-57 is **57.0.4** (published 2026-09-24).
- [SDK 57 changelog](https://expo.dev/changelog/sdk-57): a small release bringing RN 0.86. Building with the iOS 27 SDK needs the scene life cycle, which is opt-in on SDK 57 (`expo@57.0.23`, `ios.enableSceneSupport`) and the default on SDK 58.

### 3.1 `expo-glass-effect` (not installed yet)

Source: [docs (v57)](https://docs.expo.dev/versions/latest/sdk/glass-effect/) and [source](https://github.com/expo/expo/blob/sdk-57/packages/expo-glass-effect/ios/GlassView.swift). Platforms: iOS and tvOS. Included in Expo Go.

| API | Notes |
|---|---|
| `GlassView` | Wraps `UIVisualEffectView` + `UIGlassEffect`. Props: `glassEffectStyle` (`'regular'` default \| `'clear'` \| `'none'`, or `{ style, animate, animationDuration }`); `tintColor` (`ColorValue` since 57.0.3); `isInteractive` (default `false`); `colorScheme` (`'auto'` \| `'light'` \| `'dark'`), implemented as `overrideUserInterfaceStyle` on the effect view; plus all `ViewProps`. RN `borderRadius` and per-corner radii map onto native `cornerConfiguration`, and `borderCurve` onto `cornerCurve`, so **no `overflow: hidden` is needed** for the glass shape. Children mount into the effect view's `contentView`. |
| `GlassContainer` | Wraps `UIGlassContainerEffect`. `spacing` is "the distance at which glass elements start affecting each other". |
| `isLiquidGlassAvailable()` | Compile-time, OS and Info.plist check. Since **57.0.2** it reports `true` when built with the iOS 27 SDK ([PR #49850](https://github.com/expo/expo/pull/49850)). It does *not* reflect Reduce Transparency. |
| `isGlassEffectAPIAvailable()` | Runtime guard. Some iOS 26 betas crashed in the `UIGlassEffect` initialiser ([#40911](https://github.com/expo/expo/issues/40911)). |
| Below iOS 26, and on Android/web | "It will fallback to regular `View`." In the source the effect view simply has no effect, so the result is **transparent, not blurred**. You must supply the fallback yourself. |
| Native module | Needs a new binary (EAS or local build). It cannot ship over OTA. |

**Known issues and fixes** (all checked on GitHub):

| Issue | Status / workaround |
|---|---|
| `opacity: 0` on a `GlassView` **or any parent** stops the glass rendering, and UIKit "never installs it again" ([#41024](https://github.com/expo/expo/issues/41024)) | **57.0.4** waits until cumulative ancestor opacity is above **0.02** before installing the effect ([PR #48994](https://github.com/expo/expo/pull/48994)). Docs: use `glassEffectStyle={{style, animate:true}}`, or Reanimated that toggles `'none'` together with the wrapper's opacity. |
| Glass that fades *out* with its parent leaves every later `GlassView` under that host glassless ([#50097](https://github.com/expo/expo/issues/50097), closed with no repro, SDK 55) | Reporter's fix: set `glassEffectStyle="none"` *before* the fade-out starts. |
| Gradual visual degradation after about 20–30 mount/unmount cycles, across call sites; seen with `@gorhom/bottom-sheet` + `GlassContainer` on 57.0.3 ([#50466](https://github.com/expo/expo/issues/50466), closed with no repro) | Don't remount glass on every open. Keep long-lived glass mounted, or use native sheets. |
| `'clear'` over an `expo-linear-gradient` renders as a solid white box ([#42224](https://github.com/expo/expo/issues/42224), closed as stale) | Relevant to the orbs if they are LinearGradients: test, or render the orbs as an image or SVG. UNVERIFIED whether this is fixed. |
| A colour-scheme toggle didn't update the glass ([#43743](https://github.com/expo/expo/issues/43743)); `isInteractive` couldn't change after mount; glass broke after an appearance change while off-screen | Fixed in 55.0.8 ([CHANGELOG](https://github.com/expo/expo/blob/sdk-57/packages/expo-glass-effect/CHANGELOG.md)). Changing `isInteractive` still tears down and recreates the effect (source). |
| Flicker during screen transitions ([#41025](https://github.com/expo/expo/issues/41025)) and random artifacts with `expo-glass-effect` + `expo-blur` on iOS 26 ([#42501](https://github.com/expo/expo/issues/42501)) | Closed. Avoid stacking BlurView and GlassView in one surface. |
| Apple: alpha below 1 on a `UIVisualEffectView` "or any of its superviews causes many effects to look incorrect or not show up at all" ([UIVisualEffectView](https://developer.apple.com/documentation/uikit/uivisualeffectview)) | **Pressed-state opacity (`OPACITY.pressed = 0.85`) must never apply to a glass view or its ancestors.** Use `ScalePress`. |

### 3.2 Expo Router Native Tabs

Sources: [guide](https://docs.expo.dev/router/advanced/native-tabs/) and [API v57](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/). It is the real `UITabBarController` on iOS and Material bottom navigation on Android.

- **Import path.** On SDK 55–57 it is `expo-router/unstable-native-tabs`; from **SDK 58** it is `expo-router/native-tabs`. The SDK 58 beta: "Native tabs, toolbars, and the standard navigation integration are also stable" ([SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)).
- **Items.**
  - Each item is `NativeTabs.Trigger` with `.Icon` (`sf`, `md`, `src`, `xcasset`, `drawable`, `{default, selected}`, `renderingMode: 'template'|'original'`), `.Label` and `.Badge`.
  - The default and selected icons must share one rendering mode on iOS (Known limitation).
  - "Liquid glass on iOS automatically changes colors based on if the background color is light or dark. There is no callback for this, so you need to use a `PlatformColor` or `DynamicColorIOS`."
- **iOS 26 features** (needs Xcode 26+):
  - `minimizeBehavior` (`automatic|never|onScrollDown|onScrollUp`).
  - `role="search"` for the separate search tab; this regresses under the iOS 27 SDK, [RNS #4671](https://github.com/software-mansion/react-native-screens/issues/4671), open.
  - `NativeTabs.BottomAccessory` with `usePlacement()` → `'regular'|'inline'`. "Two instances… are rendered simultaneously… state is **not** shared." Its width is nondeterministic on regular width ([RNS #4728](https://github.com/software-mansion/react-native-screens/issues/4728), open).
- **iOS 26 ignores the bar background props.** "The `backgroundColor`, `blurEffect`, `shadowColor`, and `disableTransparentOnScrollEdge` props affect the iOS tab bar only on iOS 18 and earlier." To get a dark bar, make the content dark and wrap it in `ThemeProvider value={DarkTheme}`. The same fix covers the white flash on tab switch and dark-mode glass header-button flicker.
- **Limitations** (docs):
  - The bar height **cannot be measured**.
  - **FlatList** gets no scroll-to-top or minimize, and its scroll-edge detection can fail.
  - Android is limited to 5 tabs.
  - Native tabs cannot be nested in native tabs.
  - Tabs cannot be added or removed at runtime.
  - The same height problem is tracked at [RNS #3627](https://github.com/software-mansion/react-native-screens/issues/3627) (open).
- **Bugs:**
  - Tab-bar hide was never animated ([RNS #4627](https://github.com/software-mansion/react-native-screens/issues/4627); a fix PR exists).
  - Nested screens come back after fast tab switches on iOS 27 ([#4702](https://github.com/software-mansion/react-native-screens/issues/4702), fixed).
  - Header items flash a default-light glass frame on tab refocus in dark mode ([#4163](https://github.com/software-mansion/react-native-screens/issues/4163), fixed).
- **Can a custom centre button coexist with NativeTabs?** *Inference* from the docs:
  1. A trigger renders only an icon, a label and a badge. Arbitrary React (a 4-state disc, a status dot, an avatar ring) is impossible.
  2. `tabPress` listeners are typed `EventListenerCallback<…, 'tabPress', false>`, so the event is not preventable. A centre trigger would switch to a real tab screen instead of opening the Blend'n overlay. UNVERIFIED at runtime. `disabled` suppresses the native tap entirely.
  3. You could float an absolutely positioned disc over the native bar, but you can't measure the bar, it minimizes and moves, and it sits at the top on iPad. That makes it fragile.
  4. The community packages that put a FAB next to a native glass bar are iOS-26-only custom bars, not `UITabBarController`: [fab-native-tabs](https://github.com/ZakDev1/fab-native-tabs) builds on FabBar and needs the iOS 26 deployment target. Others rebuild the bar from headless tabs + `GlassView` ([expo-glass-tabs](https://github.com/davidmokos/expo-glass-tabs)).
  5. Apple's native emphasised-tab pattern for iOS 27 is the trailing **prominent tab**, and Expo/RNS don't expose it yet. A code search of RNS found no `prominentTabIdentifier`.
- **Android.**
  - Material bottom navigation with an active indicator (`indicatorColor`, `rippleColor`, `labelVisibilityMode`, `md` Material Symbols).
  - From SDK 58, `expo-symbols` is an optional peer dependency for `md` icons ([SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)).
  - No glass. The look is whatever Material renders.

### 3.3 `@expo/ui` SwiftUI (not installed yet)

Sources: [SwiftUI overview v57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/), [modifiers](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/modifiers/), [Button](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/button/), [CHANGELOG](https://github.com/expo/expo/blob/sdk-57/packages/expo-ui/CHANGELOG.md).

- SwiftUI views render inside `<Host>`, which wraps a `UIHostingController`. Available views include Button, Menu, ContextMenu, Popover, BottomSheet, Picker, Toggle, Slider and more.
- **Glass modifiers.**
  - `glassEffect({ glass: { variant: 'regular'|'clear'|'identity', interactive, tint }, shape: 'capsule'|'circle'|'roundedRectangle'|'ellipse'|'rectangle'|'containerRelativeShape', cornerRadius })`.
  - `glassEffectId(id, namespaceId)` for morphing.
  - The `GlassEffectContainer` component exists in the sdk-57 source (`packages/expo-ui/src/swift-ui/GlassEffectContainer`), but it has no v57 doc page (404).
  - `buttonStyle('glass' | 'glassProminent')` on iOS 26+, and `buttonBorderShape`.
  - The `glassEffect` modifier "requires Xcode 26+ and iOS 26+".
  - UNVERIFIED: what these render on iOS < 26 (presumably the identity or default style).
- **Bugs:**
  - A `glassProminent` button that triggers `router.push` causes push-transition jank, while "the transition is fluid only when using a React Native `Pressable` wrapping a `<GlassView />`" ([#45611](https://github.com/expo/expo/issues/45611), closed).
  - Menu/ContextMenu dismiss renders *behind* screen content, a z-index problem ([#44144](https://github.com/expo/expo/issues/44144), **open**).
  - glassEffect turned opaque after a Menu dismiss ([#43953](https://github.com/expo/expo/issues/43953)).
  - Glass was non-functional due to an opaque `UIHostingController` ([#45365](https://github.com/expo/expo/issues/45365)).
- A production post-mortem from the SDK 54→55 upgrade (Mar 2026) found glass that didn't paint on first frame, hangs when glass scrolled off-screen, and touch interception inside RN `Modal`s. The team ended up with three routes: `@expo/ui` Host for first-frame-sensitive surfaces, `expo-glass-effect` with `pointerEvents="none"` under Pressables, and a plain `BlurView` inside RN Modals ([greatworkeveryone.com](https://www.greatworkeveryone.com/writing/liquid-glass-expo-sdk-55-regression); secondary).

### 3.4 `expo-blur` 57 (installed)

Source: [docs v57](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/) and [CHANGELOG](https://github.com/expo/expo/blob/sdk-57/packages/expo-blur/CHANGELOG.md).

- **`tint`.** `light|dark|default|extraLight|regular|prominent`, plus the system materials `systemUltraThinMaterial…systemChromeMaterial`, each with `Light`/`Dark` variants (e.g. **`systemChromeMaterialDark`**, `systemThickMaterialDark`, `systemUltraThinMaterialDark`). "Every tint adds a translucent color layer on top of the blur."
- **`intensity`** is 1–100, default 50, and can be animated with Reanimated.
- **iOS caveats.**
  - `borderRadius` needs `overflow: 'hidden'`.
  - The blur doesn't update if the `BlurView` renders *before* dynamic content such as a FlatList. Render it after.
- **Android.**
  - The old prop **`experimentalBlurMethod` was renamed `blurMethod`**: `'none'` (a semi-transparent view, the default), `'dimezisBlurView'`, or `'dimezisBlurViewSdk31Plus'` (blur only on Android 12+/SDK 31 via `RenderNode`, `none` below that).
  - Real blur requires wrapping the content to be blurred in **`BlurTargetView`** and passing its ref as `blurTarget`. One target can serve several BlurViews.
  - `blurReductionFactor` defaults to 4.
  - Gestures under a `BlurTargetView` were being cancelled until a 57.x fix ([#47404](https://github.com/expo/expo/pull/47404)).
- **Team lesson** (`tasks/lessons.md`): Reanimated layout transitions on a view containing a BlurView stutter, because every frame relayouts and redraws the blur. **Animate transforms only.**

### 3.5 react-native-screens / Expo Router Stack (native header, sheets)

Sources: [Stack docs](https://docs.expo.dev/router/advanced/stack/), [Modals](https://docs.expo.dev/router/advanced/modals/), [Stack Toolbar](https://docs.expo.dev/router/advanced/stack-toolbar/).

- **Headers on iOS 26+ are Liquid Glass by default and "cannot be disabled per screen."** The `UIDesignRequiresCompatibility` escape "will be removed by Apple" in iOS 27, which is now the case. The only other escape is the JS stack.
- **`headerTransparent: true` + `headerBlurEffect`** (the system materials, including `systemChromeMaterialDark`) gives the pre-26 frosted header.
- **`scrollEdgeEffects`** (iOS 26+): `automatic|hard|soft|hidden` per edge. "Using both `headerBlurEffect` and `scrollEdgeEffects` (>= iOS 26) simultaneously may cause overlapping effects."
- The effect only applies to the scroll view on the first-descendant chain. Wrappers silently break it, and the fix is `ScrollViewMarker` from `react-native-screens/experimental` (RNS ≥ 4.26) ([RNS #4369](https://github.com/software-mansion/react-native-screens/issues/4369)).
- **Large titles** (`headerLargeTitleEnabled`) need a filling scroll view with `contentInsetAdjustmentBehavior="automatic"` as the first child.
- **`Stack.Toolbar`** (native glass toolbar items) is **alpha** on iOS from SDK 55.
- **`presentation: 'formSheet'`.**
  - Options: `sheetAllowedDetents` (fractions or `'fitToContents'`), `sheetInitialDetentIndex`, `sheetGrabberVisible`, `sheetCornerRadius`, `sheetLargestUndimmedDetentIndex`, `sheetExpandsWhenScrolledToEdge`.
  - Android allows at most 3 detents.
  - On iOS 26 a partial-height sheet is automatically glass, inset and floating. For glass to show, **`contentStyle: { backgroundColor: 'transparent' }`** is required ([Expo blog, Apple Maps sheets](https://expo.dev/blog/how-to-create-apple-maps-style-liquid-glass-sheets): `sheetAllowedDetents: [0.1, 0.5, 1]`, `sheetLargestUndimmedDetentIndex: 0`).
- **Dark-sheet flare** ([RNS #4605](https://github.com/software-mansion/react-native-screens/issues/4605), **open**, on Expo 57 / RN 0.86.3 / RNS 4.26.2):
  - Sheet glass is interactive, so tapping draws "a glowing blob following your finger… much more visible in dark mode."
  - The cause: UIKit's `sheetPresentationController.backgroundEffect` (iOS 26.1) is never set by RNS. The reporter's working patch sets `UIColorEffect(backgroundColor)` when the screen background is opaque.
  - I could not find `backgroundEffect` in Apple's online `UISheetPresentationController` topic list ([docs](https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller)); it is quoted from the SDK header in the issue. Partially verified.
- A formSheet with a native header sizes its ScrollView to the full sheet height, so the last rows can't be scrolled into view ([RNS #4769](https://github.com/software-mansion/react-native-screens/issues/4769), open).

### 3.6 What renders on iOS < 26 (Blendn's minimum is iOS 16.4 under SDK 56+, per the [glass-effect CHANGELOG 56.0.0](https://github.com/expo/expo/blob/sdk-57/packages/expo-glass-effect/CHANGELOG.md))

| Surface | iOS 26/27 | iOS 16.4–18 |
|---|---|---|
| `GlassView` / `GlassContainer` | Liquid Glass | **Transparent plain view.** You supply the fallback |
| `@expo/ui` `glassEffect`, `buttonStyle('glass')` | Liquid Glass | UNVERIFIED (presumably no effect or the default style) |
| NativeTabs | Floating glass bar | Classic `UITabBar`. `blurEffect`/`backgroundColor` apply; transparent at the scroll edge unless `disableTransparentOnScrollEdge` |
| Native-stack header | Glass items, scroll-edge effect | Classic bar. `headerBlurEffect` works with `headerTransparent` |
| formSheet | Inset glass at partial detents, opaque at full | Classic opaque sheet with `sheetCornerRadius` |
| `expo-blur` BlurView | Still a `UIBlurEffect` (standard material, content layer) | Same |

### Implication for Blendn

- **Install and pin `expo-glass-effect@~57.0.4`.** It is the first sdk-57 build with the low-opacity fix. Gate on `isGlassEffectAPIAvailable()`; `isLiquidGlassAvailable()` alone is not enough.
- **Build one `<Material>` wrapper and never call `GlassView`/`BlurView` directly from screens.** Fallbacks and accessibility then live in one place. Example: `role: 'bar' | 'control' | 'mediaControl' | 'sheet'`.
- **Native-stack screens are already glass.** Don't add `headerBlurEffect` on iOS 26+, because it doubles the effect. Wrap lists in `ScrollViewMarker` so `scrollEdgeEffects` actually applies. Wrap the root in `ThemeProvider value={DarkTheme}`.
- **Use native formSheets for the Room member card and event quick-view.** Opaque form sheets need the RNS `backgroundEffect` patch (patch-package from #4605) or they flare on our near-black.

---

## 4. How production RN/Expo apps do it in 2026, and the common mistakes

**What good implementations share** (evidence is mostly secondary):
- **Glass on the bar only; Android solid.** Callstack's React Universe conference app put glass on the iOS tab bar; "Android used a solid design to ensure consistency and platform optimization" ([Callstack case study](https://www.callstack.com/case-studies/react-universe-app-networking-evolved-with-liquid-glass)).
- **Native presentation for sheets.** Expo's own guidance for Maps-style glass sheets is a native `formSheet` with a transparent `contentStyle`, not a JS sheet ([Expo blog](https://expo.dev/blog/how-to-create-apple-maps-style-liquid-glass-sheets)). It warns that `@expo/ui` BottomSheet is "in beta" and not for production.
- **Custom bars built on `GlassView` with UI-thread motion.** [expo-glass-tabs](https://github.com/davidmokos/expo-glass-tabs) uses headless tabs + `expo-glass-effect`, native `cornerConfiguration` squircles, Reanimated worklets for minimize-on-scroll, transform-only animation, gesture-handler scrubbing with haptics, and a "solid fallback on older iOS and Android".
- **Explicit fallbacks.** Callstack's library exports `isLiquidGlassSupported` "to define a fallback appearance for unsupported devices" ([callstack/liquid-glass](https://github.com/callstack/liquid-glass)).

**Common mistakes** (each has been seen in the wild):
1. **Glass in the content layer**, on cards, list rows or every chip. This breaks the HIG ([Materials](https://developer.apple.com/design/human-interface-guidelines/materials)). It hurts performance ("limit the use of Liquid Glass effects onscreen", [Apple](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)). It also hits mount-cycle degradation in lists ([#50466](https://github.com/expo/expo/issues/50466)).
2. **Glass on glass.** Examples: a glass button inside a glass bar, a glass input in a glass composer, or nearby glass in separate containers that can't sample each other ([219](https://developer.apple.com/videos/play/wwdc2025/219/), [323](https://developer.apple.com/videos/play/wwdc2025/323/)).
3. **Opacity on glass or its ancestors.** Fade-ins, `Pressable` pressed-opacity, or entering/exiting animations that animate opacity. All of them make glass vanish ([#41024](https://github.com/expo/expo/issues/41024), [#50097](https://github.com/expo/expo/issues/50097), [UIVisualEffectView](https://developer.apple.com/documentation/uikit/uivisualeffectview)).
4. **Assuming RN content adapts like system glyphs.** It doesn't flip with the glass ([native tabs doc](https://docs.expo.dev/router/advanced/native-tabs/)), and text goes unreadable over bright imagery ([NN/g](https://www.nngroup.com/articles/liquid-glass/)).
5. **Clear glass without dimming, or clear glass behind small text** ([HIG](https://developer.apple.com/design/human-interface-guidelines/materials), [219](https://developer.apple.com/videos/play/wwdc2025/219/)).
6. **Tinting everything.** Brand-coloured tab labels over colourful content, or several tinted controls on one screen ([HIG Color](https://developer.apple.com/design/human-interface-guidelines/color#Liquid-Glass-color)).
7. **Custom backgrounds on system bars and sheets.** Examples: `headerBlurEffect` plus scroll-edge effects ([Stack docs](https://docs.expo.dev/router/advanced/stack/)), or `presentationBackground`/opaque `contentStyle` on partial sheets ([323](https://developer.apple.com/videos/play/wwdc2025/323/)).
8. **No fallback.** Shipping `GlassView` and getting a transparent box on iOS < 26 and on Android ([docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/)).
9. **Not testing the settings matrix:** Reduce Transparency, Increase Contrast, Reduce Motion, Reduce Bright Effects, and the Clear↔Tinted slider ([Adopting](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).
10. **Mismatched theme.** No `DarkTheme` on a dark app gives white flashes and flickering glass header buttons ([native tabs doc](https://docs.expo.dev/router/advanced/native-tabs/)).
11. **Crowding the bar.** NN/g's "cramped" tab bars, and targets under 44pt.
12. **Hand-rolled "glassmorphism"** (blur + gradient + glow + border stacks) presented as Liquid Glass. Apple: hierarchy "should be expressed through layout and grouping", not decoration ([356](https://developer.apple.com/videos/play/wwdc2025/356/)). Blendn's user has already rejected this look (`tasks/lessons.md`).

### Implication for Blendn

- **Budget the glass.** At most one `GlassContainer` for the bottom chrome and at most ~4 standalone glass controls per screen. Zero glass inside scroll content. (The budget is my recommendation; Apple gives no number.)
- **Every surface has a solid design first.** Glass is the iOS 26+ enhancement on top of it.
- **No opacity animation anywhere in the chrome.**

---

## 5. Recommendations for Blendn (concrete values)

### 5.1 Tab bar: keep the custom JS bar, rebuild its surface on `GlassView`

**Decision: keep `expo-router/js-tabs` with the custom `tabBar`. Do not adopt NativeTabs for this redesign.**

| | Custom JS bar + `GlassView` | NativeTabs |
|---|---|---|
| Centre disc (4 states, status dot, opens an overlay rather than a tab) | ✅ as today | ❌ icon/label/badge only; `tabPress` not preventable (*inference*) |
| Me-tab avatar | ✅ | ⚠️ an image icon at most, `renderingMode` caveats, remote URI UNVERIFIED |
| Real iOS 26/27 glass | ✅ via `UIGlassEffect` (same material) | ✅ plus the system behaviours |
| Minimize on scroll | Build it (Reanimated) | Free on ScrollView; ❌ FlatList |
| Measurable height (the Pulse hero card is sized against it) | ✅ | ❌ documented limitation |
| Android brand look | ✅ our surface | Material bottom nav |
| API stability on SDK 57 | Stable | `unstable-native-tabs`; stable only in SDK 58 (beta) |
| iOS 27 SDK regressions | n/a | `role="search"` chrome lost (#4671) |

**Revisit when both of these are true:** (a) Blendn is on SDK 58 with stable native tabs, and (b) the product agrees to move Blend'n out of the centre. The iOS-native homes for it are the trailing **prominent tab** (iOS 27, once RNS exposes it), or a **bottom accessory** that shows a live "At Toit · Enter the Room" status. The accessory fits Apple's "persistent features" rule ([356](https://developer.apple.com/videos/play/wwdc2025/356/)). Both conflict with the current `docs/NAVIGATION.md` ruling, so they are product decisions, not engineering ones.

**Bar spec.** These are my values. Apple's numbers are given where they exist; Apple's own bar dimensions are not published, and "21pt inset" is a measurement by [learnui.design](https://www.learnui.design/blog/ios-design-guidelines-templates.html) (UNVERIFIED).
- **Shape.**
  - One capsule, **64pt tall, radius 32**. That is `CONTROL.lg` 56 + 2×`SPACE.xs` 4.
  - Horizontal inset **16pt** (`SPACE.lg`); Apple's measured bar sits about 21pt in.
  - Bottom offset `max(insets.bottom − 8, 12)`, which gives 26pt on Face-ID iPhones and 12pt on home-button devices.
  - Apple: "For phone layouts, use a capsule with extra margin" near the screen edge ([356](https://developer.apple.com/videos/play/wwdc2025/356/)).
- **Material** (iOS 26+): `GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive={false}`.
  - No `tintColor` to start. If device tests show the bar flipping light over bright posters, add `tintColor="rgba(15,14,14,0.35)"` (bg `#0F0E0E` at 35%) and re-test. Whether `colorScheme` alone stops the flip is UNVERIFIED.
  - Wrap the bar and any floating CTA that sits directly above it in **one `GlassContainer spacing={8}`**. They then share a sampling region ([323](https://developer.apple.com/videos/play/wwdc2025/323/)). With the visual gap kept at ≥12pt they won't merge at rest, because the spacing (8) is less than the gap.
- **Disc.**
  - 56pt circle (radius 28 = 32 − 4, so concentric), **flat accent fill, not glass**. Glass on glass is out, and so is a bloom (`tasks/lessons.md`).
  - Keep the four states and the still status dot.
  - Press feedback: `ScalePress` (transform) + `Haptics.impactAsync(Light)`. Never opacity.
- **Selected tab.**
  - A **56pt-tall selection capsule** (radius 28, `rgba(255,255,255,0.10)` fill, not glass) behind the icon and label.
  - Icon and label `#FFFFFF`. Unselected: `rgba(255,255,255,0.64)`.
  - Labels monochrome, never accent ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).
  - Filled glyph when selected, outline when not; this matches the current Ionicons pairs.
- **Targets.** Every item at least 44×44pt ([HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)). Keep the existing `hitSlop`.
- **Minimize on scroll:** **not in v1.** In v2, on the Pulse only, collapse to [selected tab] + [disc] and keep the disc visible always. That mirrors Apple's rule that the prominent tab "is always visible, even when the tab bar collapses" ([278](https://developer.apple.com/videos/play/wwdc2026/278/)). Use transforms only. Under Reduce Motion, use a cross-fade with no minimize.

### 5.2 Surface map

| Surface | iOS 26/27 | iOS 16.4–25 | Reduce Transparency (any iOS) | Android 12+ | Android < 12 |
|---|---|---|---|---|---|
| **Tab bar** | `GlassView` regular, dark, untinted | `BlurView tint="systemChromeMaterialDark" intensity={100}` + 0.5pt hairline `rgba(255,255,255,0.10)` | Glass: system frosts it automatically. Fallback path: solid `#211F1F` (surfaceSunken) + hairline | `BlurView blurMethod="dimezisBlurViewSdk31Plus" tint="dark" intensity={40}` inside a `BlurTargetView` over the tab scenes, plus a `rgba(33,31,31,0.55)` scrim. **Ship solid first and enable blur only after a Galaxy A34 frame test** | Solid `rgba(33,31,31,0.96)` |
| **Floating circle buttons** (back, close, share, filter; 44pt) | `GlassView` regular, `isInteractive` (verify touch passthrough, below) | `BlurView systemThinMaterialDark` circle | Solid `#272525` (surface) | Solid `#272525` + hairline | same |
| **Controls over the event hero photo** | `GlassView` **clear** + a **35% black** top gradient on the photo ([HIG](https://developer.apple.com/design/human-interface-guidelines/materials)) | `BlurView systemUltraThinMaterialDark` + the same 35% gradient | Solid `#272525` | Scrim `rgba(15,14,14,0.6)` | same |
| **Info pills on photos in feed cards** (date, price, "12 going") | **Not glass.** Scrim capsule `rgba(15,14,14,0.60)` + hairline `rgba(255,255,255,0.14)` | same | Scrim at 0.85 | same | same |
| **Top of tab screens** (Pulse, Going, Banter, Me) | No glass slab. Floating glass circles only. Title in content. A soft edge, `LinearGradient` from `bg` at 0.85 → 0 over status bar + 44pt, emulating Apple's soft scroll edge | same gradient + BlurView circles | Gradient at 0.95 | gradient | gradient |
| **Native-stack detail screens** | `headerTransparent: true`, **no `headerBlurEffect`**, `scrollEdgeEffects.top: 'automatic'` via `ScrollViewMarker` | `headerBlurEffect: 'systemChromeMaterialDark'` | system | RNS default + `bg` | same |
| **Quick-view sheets** (event preview, Room member card) | Native `formSheet`, `contentStyle` transparent, `sheetAllowedDetents: [0.45, 1]`, `sheetGrabberVisible: true`, `sheetLargestUndimmedDetentIndex: 0` for parallel tasks / `'none'` for interruptions, **no `sheetCornerRadius`** | Opaque `#272525`, `sheetCornerRadius: 24` | system | `#272525`, radius 24, max 3 detents | same |
| **Task sheets** (report, edit profile, filters) | formSheet at full height (opaque); apply the RNS #4605 `backgroundEffect` patch so it doesn't flare | Opaque | n/a | Opaque | Opaque |
| **Primary CTA** ("Check in", "Enter the Room", "I'm going") | **Solid flat accent**, 56pt capsule, text in `BRAND_INK`. **Not tinted glass**: the user rejected the frosted-orange CTA, and solid guarantees contrast at every slider position | same | same | same | same |
| **Room chat composer** | `GlassView` regular capsule. The input inside is a **fill** `rgba(255,255,255,0.08)`, not glass. Send button: flat accent circle | BlurView `systemChromeMaterialDark` | Solid `#211F1F` | Solid + hairline | Solid |
| **Menus / context menus** | Native, for the morph-from-source (`@expo/ui` `ContextMenu`/`Menu` in a Host; watch [#44144](https://github.com/expo/expo/issues/44144)) or RN's native action sheet | native classic | system | native | native |
| **Toasts** | `GlassView` regular capsule, top, 48pt | BlurView | Solid | Solid | Solid |
| **Cards, lists, profile, Board posts** | **Solid** `#272525` / `#211F1F`, never glass | same | same | same | same |

**The ambient orbs** (content layer, behind everything):
- Two or three large radial gradients: orange (the accent decision is open, `#F05423` per the brief) at **0.30–0.40** alpha and violet `#8E4BAA` at **0.25–0.30**. Each 280–360pt across, fully feathered.
- Render them as **one static image or SVG** (react-native-svg is installed), not as stacked LinearGradients (see [#42224](https://github.com/expo/expo/issues/42224)), and not animated continuously.
- Put at least one orb in the bottom third, so the bar has colour to refract.
- Never place an orb directly behind the disc or a CTA, where it would read as the rejected bloom.
- Under Reduce Motion the orbs stay static. Under Increase Contrast, cut their alpha by half.

### 5.3 Fallback resolver (the one load-bearing piece of code)

```ts
// lib/material.ts. Every glass surface asks this; screens never import GlassView or BlurView.
type Tier = 'glass' | 'blur' | 'solid'
function materialTier(os: 'ios' | 'android', iosMajor: number, reduceTransparency: boolean, androidApi: number): Tier {
  if (os === 'ios') {
    if (iosMajor >= 26 && isGlassEffectAPIAvailable()) return 'glass' // system handles RT/IC/RM itself
    return reduceTransparency ? 'solid' : 'blur'                       // our fallback must honour RT
  }
  return androidApi >= 31 && ANDROID_BLUR_ENABLED ? 'blur' : 'solid'   // flag off until measured on a low-end device
}
```

Subscribe to `reduceTransparencyChanged` and `reduceMotionChanged`. Read `isDarkerSystemColorsEnabled()` once on launch and whenever the app returns to the foreground; it has no change event. When contrast is increased: hairlines go to `rgba(255,255,255,0.5)` at 1pt, unselected tab labels to 0.85 white, and scrims to +0.2 alpha.

### 5.4 Concentric radius system

Rule: **outer radius − padding = inner radius**, with a floor of 8 (the fallback radius when a shape stands alone, [356](https://developer.apple.com/videos/play/wwdc2025/356/)). Use `borderCurve: 'continuous'` on everything; expo `GlassView` maps it to `cornerCurve`.

| Layer | Size | Radius | Concentric with |
|---|---|---|---|
| Display | n/a | 47.33 (12–14), 55 (14 Pro–16), 62 (16 Pro–17 Pro, Air). These come from the private `_displayCornerRadius` ([ScreenCorners](https://github.com/kylebshr/ScreenCorners)); **don't read it at runtime**, it is private API | n/a |
| Tab bar | 64h capsule | 32 | Capsule + margin (Apple's phone rule) |
| Disc and selection capsule, inset 4 | 56 | 28 | Bar (32 − 4) |
| Primary CTA | 56h capsule | 28 | Capsule |
| Glass circle buttons | 44 | 22 | Capsule |
| Chips and scrim pills | 32h | 16 | Capsule |
| Content card at `GUTTER` 24 | n/a | **32** (`card`) | Display: 55 − 24 = 31, 62 − 24 = 38, so ≈ concentric |
| Media inside a card at 8 padding | n/a | **24** (`lg`) | Card (32 − 8) |
| Rows and chips inside a card at 16 padding | n/a | **16** (`md`) | Card (32 − 16) |
| Thumbnails at 8 inside a 16 row | n/a | **8** (`sm`) | Row (16 − 8) |
| Sheet (iOS 26+) | n/a | **System, don't override** | Display (system) |
| Sheet (fallback / Android) | n/a | 24 (`lg`) | n/a |
| Tiles inside a sheet at 16 padding | n/a | 8 on fallback (24 − 16). On iOS 26 the system sheet radius is unpublished (UNVERIFIED), so use 16 | n/a |

Every step falls on the existing `EMBER_RADIUS` tokens (8/16/24/32/pill) and `SPACE` grid. **No new tokens are needed.**

### 5.5 Motion and interaction rules for glass

- Glass appears and disappears through `glassEffectStyle={{ style: on ? 'regular' : 'none', animate: true, animationDuration: 0.25 }}`, and never through opacity ([docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/)). Before a parent fades or unmounts, set `'none'` first ([#50097](https://github.com/expo/expo/issues/50097)).
- Keep glass mounted for the app's lifetime where possible: the bar and the composer. Don't remount glass inside JS bottom-sheet libraries on every open ([#50466](https://github.com/expo/expo/issues/50466)).
- Use transforms only. No Reanimated layout transitions on views containing glass or blur (`tasks/lessons.md`).
- `isInteractive` only on standalone 44pt glass buttons, and only after a device check of how it interacts with RN `Pressable`. UNVERIFIED whether UIKit's interactive highlight fires when the RN touch handler owns the touch. The SDK 55 post-mortem had to put `pointerEvents="none"` on glass under Pressables ([greatworkeveryone](https://www.greatworkeveryone.com/writing/liquid-glass-expo-sdk-55-regression)). If they fight, use the glass as a non-interactive background and get the feedback from `ScalePress`.
- Under Reduce Motion: no minimize, no morphs, cross-fades only (Reanimated `useReducedMotion`), and a static disc.

### 5.6 Verification matrix (for the "8 · Driven" gate)

**Device and OS:**
- iOS 27 physical iPhone; iOS 26.x simulator; iOS 18 simulator (blur fallback). One device at a time (team rule).
- Android 14 Galaxy A34 (blur flag on vs off: frame time, scroll jank).

**Settings on iOS 27:**
- Liquid Glass slider at both ends.
- Reduce Transparency, Increase Contrast, Reduce Motion, Reduce Bright Effects.

**Content:**
- The brightest poster in staging under the bar, top controls and hero controls.
- An all-black screen, to check the sheet flare and dark legibility.

**Assertions:**
- Every glyph on glass is at least **4.5:1** for text and **3:1** for icons, sampled from screenshots against the worst-case backdrop.
- No glass disappears after: opening and closing a sheet 30 times, switching tabs 50 times, backgrounding and foregrounding, and toggling Reduce Transparency mid-session.

### 5.7 Open / UNVERIFIED items to resolve on device

1. Whether `colorScheme="dark"` on `GlassView` stops small glass flipping light over bright content.
2. How `isInteractive` behaves with an RN `Pressable` inside or around it.
3. What `@expo/ui` glass modifiers render below iOS 26.
4. Whether `UIBlurEffect` goes opaque by itself under Reduce Transparency. Handled explicitly anyway.
5. Any API to read the Clear/Tinted preference or the iOS 27 slider. None found.
6. The system sheet corner radius on iOS 26/27, which is unpublished.
7. Whether `'clear'` glass over gradients is still a white box on 57.0.4 (#42224).
8. Apple's exact floating tab-bar metrics; 21pt is a third-party measurement.
9. The accent hex (`#FF906D` in the theme vs `#F05423` in the brief).

---

## Sources

**Apple: HIG**
- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers)
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views)
- [Color › Liquid Glass color](https://developer.apple.com/design/human-interface-guidelines/color#Liquid-Glass-color)
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

**Apple: developer docs**
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
- [Glass](https://developer.apple.com/documentation/swiftui/glass)
- [GlassEffectContainer](https://developer.apple.com/documentation/swiftui/glasseffectcontainer)
- [ConcentricRectangle](https://developer.apple.com/documentation/swiftui/concentricrectangle)
- [UIGlassEffect](https://developer.apple.com/documentation/uikit/uiglasseffect)
- [UIVisualEffectView](https://developer.apple.com/documentation/uikit/uivisualeffectview)
- [UIScrollEdgeEffect](https://developer.apple.com/documentation/uikit/uiscrolledgeeffect)
- [UISheetPresentationController](https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller)
- [UITabBarController.bottomAccessory](https://developer.apple.com/documentation/uikit/uitabbarcontroller/bottomaccessory)
- [UITabBarController.prominentTabIdentifier](https://developer.apple.com/documentation/uikit/uitabbarcontroller/prominenttabidentifier)
- [UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)
- [App Store usage](https://developer.apple.com/support/app-store/)

**Apple: WWDC sessions**
- WWDC25 [219 Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- WWDC25 [356 Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
- WWDC25 [284 Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)
- WWDC25 [323 Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/)
- WWDC26 [102 Platforms State of the Union](https://developer.apple.com/videos/play/wwdc2026/102/)
- WWDC26 [269 What's new in SwiftUI](https://developer.apple.com/videos/play/wwdc2026/269/)
- WWDC26 [278 Modernize your UIKit app](https://developer.apple.com/videos/play/wwdc2026/278/)

**Apple: newsroom and support**
- [Newsroom, June 2026](https://www.apple.com/newsroom/2026/06/apple-aids-app-development-with-new-intelligence-frameworks-and-advanced-tools/)
- [About iOS 26 Updates](https://support.apple.com/en-us/123075)
- [About iOS 27 Updates](https://support.apple.com/en-us/149076)
- [Adjust display and text settings](https://support.apple.com/guide/iphone/adjust-iphone-display-and-text-settings-iphd6804774e/ios)

**Expo: docs**
- [GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/)
- [Native tabs guide](https://docs.expo.dev/router/advanced/native-tabs/)
- [Native tabs API v57](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/)
- [BlurView v57](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/)
- [Expo UI SwiftUI](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/)
- [Modifiers](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/modifiers/)
- [Button](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/button/)
- [Stack](https://docs.expo.dev/router/advanced/stack/)
- [Modals](https://docs.expo.dev/router/advanced/modals/)
- [Stack Toolbar](https://docs.expo.dev/router/advanced/stack-toolbar/)

**Expo: changelogs and blog**
- [SDK 57](https://expo.dev/changelog/sdk-57)
- [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)
- [expo-glass-effect CHANGELOG](https://github.com/expo/expo/blob/sdk-57/packages/expo-glass-effect/CHANGELOG.md)
- [GlassView.swift](https://github.com/expo/expo/blob/sdk-57/packages/expo-glass-effect/ios/GlassView.swift)
- [expo-blur CHANGELOG](https://github.com/expo/expo/blob/sdk-57/packages/expo-blur/CHANGELOG.md)
- [expo-ui CHANGELOG](https://github.com/expo/expo/blob/sdk-57/packages/expo-ui/CHANGELOG.md)
- [Apple Maps-style glass sheets](https://expo.dev/blog/how-to-create-apple-maps-style-liquid-glass-sheets)

**expo/expo issues and PRs**
- Issues: [#40911](https://github.com/expo/expo/issues/40911), [#41024](https://github.com/expo/expo/issues/41024), [#41025](https://github.com/expo/expo/issues/41025), [#42224](https://github.com/expo/expo/issues/42224), [#42501](https://github.com/expo/expo/issues/42501), [#43743](https://github.com/expo/expo/issues/43743), [#43953](https://github.com/expo/expo/issues/43953), [#44144](https://github.com/expo/expo/issues/44144), [#45365](https://github.com/expo/expo/issues/45365), [#45611](https://github.com/expo/expo/issues/45611), [#50097](https://github.com/expo/expo/issues/50097), [#50466](https://github.com/expo/expo/issues/50466)
- PRs: [#48994](https://github.com/expo/expo/pull/48994), [#49850](https://github.com/expo/expo/pull/49850), [#47404](https://github.com/expo/expo/pull/47404)

**react-native-screens issues**
- [#3627](https://github.com/software-mansion/react-native-screens/issues/3627), [#4163](https://github.com/software-mansion/react-native-screens/issues/4163), [#4369](https://github.com/software-mansion/react-native-screens/issues/4369), [#4605](https://github.com/software-mansion/react-native-screens/issues/4605), [#4627](https://github.com/software-mansion/react-native-screens/issues/4627), [#4671](https://github.com/software-mansion/react-native-screens/issues/4671), [#4702](https://github.com/software-mansion/react-native-screens/issues/4702), [#4728](https://github.com/software-mansion/react-native-screens/issues/4728), [#4769](https://github.com/software-mansion/react-native-screens/issues/4769), [#4776](https://github.com/software-mansion/react-native-screens/issues/4776)

**React Native**
- [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)
- [DynamicColorIOS](https://reactnative.dev/docs/dynamiccolorios)

**Secondary**
- [NN/g: Liquid Glass Is Cracked](https://www.nngroup.com/articles/liquid-glass/)
- [TidBITS on iOS 26.1](https://tidbits.com/2025/10/21/ios-26-1-to-add-optional-opacity-to-liquid-glass/)
- [9to5Mac on iOS 26.4](https://9to5mac.com/2026/04/10/ios-26-4-adds-setting-to-let-you-change-new-liquid-glass-effect/)
- [Cult of Mac](https://www.cultofmac.com/how-to/reduce-bright-effects-ios-26-4-liquid-glass)
- [MacRumors on iOS 27](https://www.macrumors.com/2026/06/08/apple-announces-liquid-glass-improvements/)
- [MacRumors guide](https://www.macrumors.com/guide/ios-26-liquid-glass/)
- [GSMArena](https://m.gsmarena.com/ios_26_beta_2_tones_down_the_liquid_glass_effect-amp-68379.php)
- [TechTimes](https://www.techtimes.com/articles/317975/20260608/apple-liquid-glass-ios-27-wwdc-2026-brings-refinements-developers-must-adopt-today.htm)
- [learnui.design](https://www.learnui.design/blog/ios-design-guidelines-templates.html)
- [ScreenCorners](https://github.com/kylebshr/ScreenCorners)
- [callstack/liquid-glass](https://github.com/callstack/liquid-glass)
- [Callstack React Universe case study](https://www.callstack.com/case-studies/react-universe-app-networking-evolved-with-liquid-glass)
- [expo-glass-tabs](https://github.com/davidmokos/expo-glass-tabs)
- [fab-native-tabs](https://github.com/ZakDev1/fab-native-tabs)
- [greatworkeveryone SDK 55 post-mortem](https://www.greatworkeveryone.com/writing/liquid-glass-expo-sdk-55-regression)
- [StatCounter India mobile OS](https://gs.statcounter.com/os-market-share/mobile/india)
