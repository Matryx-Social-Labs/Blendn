# Round 3 research: motion and micro-interactions (2026-10-09)

The sources behind [`ROUND3.md`](../ROUND3.md) part E, motion pack 2. Only what fits Blend'n's rules was kept; what was rejected is listed with the reason.

## Platform guidance

| Finding | Used in | Source |
|---|---|---|
| Liquid Glass materialises rather than fading, and loses its elastic response under Reduce Motion | #30 scroll-edge chrome | [WWDC25 219 · Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) |
| Sheets spring from the control that opened them; a dragged sheet's glass grows more opaque | #36 long-press menu | [WWDC25 356 · Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/) |
| The tab bar minimises on scroll with `.tabBarMinimizeBehavior(.onScrollDown)`; glass morphing needs `glassEffectID` inside a `GlassEffectContainer` (native SwiftUI, so `@expo/ui`) | #31, deferred to v2 | [Liquid Glass reference](https://tessl.io/registry/dpearson2699/swift-ios-skills/3.9.0/files/skills/swiftui-liquid-glass/references/liquid-glass.md), [overview](https://www.tothenew.com/blog/apples-liquid-glass-ui-whats-new-in-ios-26/) |
| Material 3 Expressive: spatial springs may overshoot, effects never do; expressive for hero moments, standard for routine ones; the pressed shape change and the morphing loader | #45 async primary, the Android press | [M3 blog](https://m3.material.io/blog/m3-expressive-motion-theming), [MotionScheme](https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme) |
| Android 13+ shows its own clipboard confirmation; apps shouldn't add a second one | #46 share and copy | [Copy and paste guide](https://developer.android.com/develop/ui/views/touch-and-input/copy-paste) |

## Apps

| App | What it does | Verdict |
|---|---|---|
| Airbnb (2025 redesign) | Icons animate once when tapped (the house's light, the bell's rattle), via its "Lava" format | **The principle kept**: one-shot, never idle, as SVG transforms (#51). No React Native player exists for Lava. [It's Nice That](https://www.itsnicethat.com/articles/airbnb-app-redesign-140525), [Noun Project](https://blog.thenounproject.com/icons-in-motion/) |
| Apple Invites | Confetti on every RSVP | **Rejected**: Blend'n spends a celebration once. [MacRumors](https://forums.macrumors.com/threads/apple-invites-app-updated-with-two-new-features.2485734/) |
| Partiful | "Boops" and bouncing bubbles | **Rejected**: they loop. [Pratt critique](https://ixd.prattsi.org/2025/02/design-critique-partiful/) |
| Luma | A theme shuffle shifts the page's hue | **Kept** as a one-shot cover-tint crossfade on the Scene. [Pratt critique](https://ixd.prattsi.org/2026/02/luma-design-critique/) |
| Telegram, Signal | Swipe-to-reply thresholds of 45–64 pt, one haptic, a rubber band; Telegram's reaction flies to its chip in 0.18 s | **Kept** (#35, #37). [Telegram source](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/ReactionSelectionNode/Sources/ReactionContextNode.swift), [Signal source](https://github.com/signalapp/Signal-Android/blob/main/app/src/main/java/org/thoughtcrime/securesms/conversation/ConversationItemSwipeCallback.java) |
| Arc Search | Puts its delight into one signature gesture | **Kept as a principle**: for Blend'n that gesture is the hold. [MacRumors](https://www.macrumors.com/2024/05/23/arc-search-call-feature) |
| Instagram | A 2019 test vibrated on every like and drew "annoying" complaints | **Why `H.like` stays Soft and fires once.** [9to5Mac](https://9to5mac.com/2019/12/04/haptic-overload/) |

Hinge, BeReal and Instagram's current motion have no primary documentation that could be found; nothing is claimed about them.
