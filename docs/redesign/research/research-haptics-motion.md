# Blendn redesign: haptic vocabulary and motion system (research)

Researched 2026-10-02 for the Claude Design brief. Stack in scope: Expo SDK 57, RN 0.86, expo-router 57, Reanimated 4.5.1 + react-native-worklets 0.10, gesture-handler 2.32, expo-haptics 57, react-native-svg 15.

**Labels used in this file**
- **UNVERIFIED**: no primary source was found. Treat as an observation or an assumption.
- **PROPOSAL**: a recommendation for Blendn. These are not facts about a platform.
- **COMPUTED**: derived by arithmetic or by emulating library source code, not measured on a device. Verify on hardware.

Current-state facts about the Blendn client come from the sibling audits in this folder (`audit-core-loop.md` §6, `audit-social.md` §0.4), which cite file:line in the client repo.

---

## 0. Summary

1. **On Android, expo-haptics' `impactAsync`, `notificationAsync` and `selectionAsync` are raw `Vibrator.createWaveform` buzzes.**
   - "Light" is 50 ms at amplitude 30 ([source](https://github.com/expo/expo/blob/main/packages/expo-haptics/android/src/main/java/expo/modules/haptics/arguments/HapticsImpactType.kt)).
   - Android's guidance "strongly discourages" `createWaveform` for UI feedback and says a key click should last 10–20 ms ([haptic-feedback](https://developer.android.com/develop/ui/views/haptics/haptic-feedback), [principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles)).
   - On Android, every UI haptic should go through `performAndroidHapticsAsync(AndroidHaptics.*)`, which is `View.performHapticFeedback`. The waveform calls should be kept as a fallback for important outcomes only.
2. **`performAndroidHapticsAsync` rejects if a constant is newer than the device.**
   - Expo resolves the constant by reflection. If the field is missing it throws, except for 5 legacy constants ([HapticsRecord.kt](https://github.com/expo/expo/blob/main/packages/expo-haptics/android/src/main/java/expo/modules/haptics/HapticsRecord.kt)).
   - `TOGGLE_*`, `SEGMENT_*` and `DRAG_START` need API 34. `CONFIRM`, `REJECT` and `GESTURE_*` need API 30. Expo SDK 57 supports Android 7 (API 24) and up ([Expo versions](https://docs.expo.dev/versions/latest/)).
   - A wrapper with a fallback ladder is mandatory.
   - `GESTURE_THRESHOLD_ACTIVATE`/`DEACTIVATE` are the exact constants for pull-to-refresh and swipe thresholds, and **they are not exposed by expo-haptics 57**.
3. **On iOS, expo-haptics creates a new generator for every call and calls `prepare()` immediately before firing.**
   - Apple says this "does not improve latency" ([prepare()](https://developer.apple.com/documentation/uikit/uifeedbackgenerator/prepare())).
   - There is no intensity parameter either ([HapticsModule.swift](https://github.com/expo/expo/blob/main/packages/expo-haptics/ios/HapticsModule.swift)).
   - That is acceptable for taps. For gesture thresholds it means an extra UI→JS→native hop.
4. **The library to add if needed is `react-native-pulsar` (Software Mansion, MIT).**
   - Version 1.7.0 shipped 2026-08-11, and the repo was pushed 2026-09-30.
   - It uses Core Haptics on iOS and `VibrationEffect.Composition` on Android.
   - Its presets are callable inside Reanimated worklets.
   - It requires the New Architecture and react-native-worklets, both of which Blendn already has ([docs](https://docs.swmansion.com/pulsar/sdk/react-native/)).
   - `expo-ahap` was last published in 2023 and is abandoned. Do not use it.
5. **The current Blendn springs are bouncier than their names suggest.**
   - `gentle {damping 18, stiffness 220, mass 0.9}` is equivalent to Apple bounce **0.36** (7.3 % overshoot).
   - `snappy {16, 280, 0.75}` is bounce **0.45** (12.5 % overshoot). That is above Apple's "be cautious above ~0.4" ([WWDC23 Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/)).
   - The room-face layout transition `LinearTransition.springify().damping(18).stiffness(220)` inherits Reanimated's default **mass 4**. That gives about 37 % overshoot and a settle time of about 2.9 s (COMPUTED).
6. **Apple's rule for bounce:**
   - Taps get 100 % damping, meaning no bounce.
   - Gestures that carry momentum get about 80 % damping, a bounce of 0.2 ([WWDC18 Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/)).
   - M3 Expressive says the same thing a different way: spatial springs may overshoot, effects springs (colour, opacity) must not ([M3 motion blog](https://m3.material.io/blog/m3-expressive-motion-theming)).
7. **Reanimated 4 changed spring semantics.**
   - The default is now `{mass 4, stiffness 900, damping 120}`, which is critically damped and has a perceptual duration of about 0.42 s.
   - The `duration` option is now *perceptual*: the actual animation lasts 1.5× ([withSpring](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/)).
   - Duration-form springs re-solve stiffness from the start velocity on every run ([springUtils.ts](https://github.com/software-mansion/react-native-reanimated/blob/main/packages/react-native-reanimated/src/animation/spring/springUtils.ts)).
   - **Use the physics form as the canonical token** (PROPOSAL).
8. **Shared-element transitions in Reanimated 4 are experimental, behind a flag, and "not recommended for production".**
   - The Expo Router **zoom transition** (`Link.AppleZoom`) is the realistic card→detail continuity tool. It is iOS 18+ and alpha, and it has known issues: glitches with headers, and about 1 s of latency on rapid reopen ([docs](https://docs.expo.dev/router/advanced/zoom-transition/), [expo#42797](https://github.com/expo/expo/issues/42797), open 2026-09-30).
9. **Reduce Motion in Reanimated means "snap to end", not "crossfade".**
   - Apple asks for replacements: fades instead of x/y/z moves, tighter springs, no blur animations ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
   - Blendn must therefore write explicit reduce-motion variants. Its existing components mostly do this already.
10. **Ambient motion costs battery in two ways.**
    - Translucency over changing content multiplies redraw cost ([Apple Energy Guide](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/AvoidExtraneousGraphicsAndAnimations.html)).
    - Any running animation boosts Android's refresh rate ([Android ARR](https://developer.android.com/develop/ui/views/animations/adaptive-refresh-rate)).
    - Glass over drifting orbs is the expensive case. Drift slowly, animate transforms only, and pause aggressively.

---

## 1. Haptics: platforms, libraries, practice

### 1.1 Apple's vocabulary

**HIG "Playing haptics"** ([source](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)). The rules, near-verbatim:

- **"Use system-provided haptic patterns according to their documented meanings."** If a meaning doesn't fit, "use a generic pattern or create your own."
- **Use haptics consistently.** "Build a clear, causal relationship between each haptic and the action that causes it… If a haptic doesn't reinforce a cause-and-effect relationship, it can be confusing and seem gratuitous."
- **Complement other feedback.** "Match the intensity and sharpness of a haptic with the intensity and sharpness of the animation it accompanies."
- **Avoid overusing haptics.** "The best haptic experience is one that people may not be conscious of, but miss when it's turned off."
- **Prefer short haptics for discrete events.** Long-running haptics "dilute the meaning".
- **Make haptics optional.** "Let people turn off or mute haptics."
- **Mind the camera, gyroscope and microphone.** Haptics can disrupt them.
- **Standard controls play haptics for free.** "Toggles, sliders and pickers… play Apple-designed system haptics by default."
- **The three generator families on iOS:**
  - **Notification** (success, warning, error): "the outcome of a task or action".
  - **Impact** (light, medium, heavy, rigid, soft): "a tap when a view snaps into place or a thud when two heavy objects collide".
  - **Selection**: "while the values of a UI element are changing".
- **Custom haptics** are built from transient events (taps) and continuous events, each with **intensity** and **sharpness**. The HIG says the Messages "lasers" effect uses continuous haptics. That is a documented precedent for haptics on screen effects.

**UIKit specifics**

- `UIImpactFeedbackGenerator.impactOccurred(intensity:)` takes a CGFloat from 0.0 to 1.0 ([doc](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator/impactoccurred(intensity:))). There are also location-aware variants `impactOccurred(at:)` ([doc](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator)).
- `UIFeedbackGenerator.prepare()` ([doc](https://developer.apple.com/documentation/uikit/uifeedbackgenerator/prepare())):
  - It puts the Taptic Engine in a low-latency state "for a short period (typically seconds)".
  - "Calling prepare() and then immediately triggering feedback… does not improve latency."
  - The engine idles again after a trigger, a timeout, or deallocation, "to conserve power".
  - Repeated `prepare()` calls without triggering may eventually be ignored.
  - There is also a `UICanvasFeedbackGenerator` (snapping to guides) ([doc](https://developer.apple.com/documentation/uikit/uifeedbackgenerator)).

**SwiftUI `.sensoryFeedback`** ([SensoryFeedback](https://developer.apple.com/documentation/swiftui/sensoryfeedback)):

- `start`, `stop` (an activity started or stopped)
- `alignment`, `decrease`, `increase`, `levelChange`, `selection`, `pathComplete`
- `success`, `warning`, `error`
- `impact`, `impact(weight: .light|.medium|.heavy, intensity:)`, `impact(flexibility: .rigid|.soft|.solid, intensity:)` ([Weight](https://developer.apple.com/documentation/swiftui/sensoryfeedback/weight), [Flexibility](https://developer.apple.com/documentation/swiftui/sensoryfeedback/flexibility))

Of these, **`increase`, `decrease`, `levelChange`, `alignment`, `start`, `stop`, `pathComplete` and `solid` have no expo-haptics equivalent.** Reaching them needs a native module. `@expo/ui`'s SwiftUI modifier list in SDK 57 has no `sensoryFeedback` modifier ([modifiers](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/modifiers/)).

**Core Haptics / AHAP**

- `CHHapticEngine` plays `CHHapticPattern`s of transient and continuous events. It supports dynamic parameter curves and AHAP JSON files ([Core Haptics](https://developer.apple.com/documentation/corehaptics)).
- Apple's setup advice ([Preparing your app to play haptics](https://developer.apple.com/documentation/corehaptics/preparing-your-app-to-play-haptics)):
  - Check `CHHapticEngine.capabilitiesForHardware().supportsHaptics`.
  - Create the engine early and keep a reference.
  - Implement `resetHandler`, which must restart the engine and recreate players.
  - `isMutedForHaptics` exists ([CHHapticEngine](https://developer.apple.com/documentation/corehaptics/chhapticengine)).
- **UNVERIFIED:** whether Core Haptics playback honours Settings → Sounds & Haptics → System Haptics the way `UIFeedbackGenerator` does. No primary source was found. If Blendn adopts Core Haptics, the in-app haptics toggle becomes the only reliable off switch.

**Apple's audio-haptic design principles** ([WWDC21 "Practice audio haptic design"](https://developer.apple.com/videos/play/wwdc2021/10278/)):

- **Causality.** "For feedback to be useful, it must be obvious what caused it."
- **Harmony.** "It should feel the way it looks… A small ball should feel small."
- **Utility.** "Don't add feedback just because you can… Reserve haptics and audio for significant moments."
- The demo pairs a 500 ms visual with a continuous haptic. Three transients against a continuous sound were judged "no harmony".

**When iOS will not play haptics.** expo-haptics documents these cases for the Taptic Engine: Low Power Mode, the user has disabled it in Settings, camera recording is active, dictation is active ([expo-haptics](https://docs.expo.dev/versions/latest/sdk/haptics/)).

### 1.2 Android's vocabulary

**Guidance** ([haptic-feedback](https://developer.android.com/develop/ui/views/haptics/haptic-feedback), [haptics-principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles)):

- **Prefer `View.performHapticFeedback(HapticFeedbackConstants.X)`.**
  - It is "action-oriented, has the widest support, and doesn't require the VIBRATE permission."
  - The platform supplies fallbacks.
  - It "honors the system setting `HAPTIC_FEEDBACK_ENABLED`".
  - "All haptic feedback methods respect the user's touch feedback settings by default."
- **"We strongly discourage using older Vibrator methods employing `createOneShot` or `createWaveform`…** These modes are often too loud for regular haptic feedback; use them only as a fallback if you need to highlight an extremely important action."
- **Timing:** "A good keyclick haptic feedback signal should last between 10 to 20 milliseconds. However, the actuator may continue to ring for another 20 to 50 milliseconds."
- **Clear, rich and buzzy haptics:** "Given the choice of buzzy haptics or no haptics for touch feedback, choose no haptics."
- **"Correlate event importance and frequency with strength."** Very frequent events should be very subtle. Refresh and submit should be stronger than a toggle. Effects can ramp up as the interaction approaches a target, "gradually increasing the amplitude of a sequence of ticks".
- **"Less is more."** Overuse "may lead the user to quickly turn off all haptics."

**HapticFeedbackConstants with API levels** ([reference](https://developer.android.com/reference/android/view/HapticFeedbackConstants)). The last column is what `expo-haptics` 57 does with each ([HapticsRecord.kt](https://github.com/expo/expo/blob/main/packages/expo-haptics/android/src/main/java/expo/modules/haptics/HapticsRecord.kt), [types](https://github.com/expo/expo/blob/main/packages/expo-haptics/src/Haptics.types.ts)):

| Constant | API | Meaning (Android doc) | expo `AndroidHaptics` |
|---|---|---|---|
| LONG_PRESS | 3 | "long press… resulting in an action being performed" | `Long_Press` · safe on all APIs |
| VIRTUAL_KEY | 5 | "pressed on a virtual on-screen key" | `Virtual_Key` · safe |
| KEYBOARD_TAP | 8 | soft keyboard key pressed | `Keyboard_Tap` · safe |
| CLOCK_TICK | 21 | hour/minute tick of a clock | `Clock_Tick` · safe |
| CONTEXT_CLICK | 23 | context click on an object | `Context_Click` · safe |
| KEYBOARD_PRESS / KEYBOARD_RELEASE / VIRTUAL_KEY_RELEASE / TEXT_HANDLE_MOVE | 27 | key press/release, text handle | exposed · **throws on API 24–26** |
| CONFIRM / REJECT | 30 | "confirmation or successful completion" / "rejection or failure" | `Confirm` / `Reject` · throws < 30 |
| GESTURE_START / GESTURE_END | 30 | gesture started / finished | exposed · throws < 30 |
| TOGGLE_ON / TOGGLE_OFF | 34 | switch toggled on / off | exposed · throws < 34 |
| SEGMENT_TICK | 34 | "switching between a series of potential choices, e.g. items in a list or discrete points on a slider" | exposed · throws < 34 |
| SEGMENT_FREQUENT_TICK | 34 | many choices; "expected to be very soft… If the device can't make a suitably soft vibration, then it may not make any" | exposed · throws < 34 |
| DRAG_START | 34 | drag target "picked up" | exposed · throws < 34 |
| GESTURE_THRESHOLD_ACTIVATE / _DEACTIVATE | 34 | swipe/drag "such as pull-to-refresh", passed / re-crossed the threshold | **not exposed** |
| NO_HAPTICS | 34 | explicit no-op | exposed |

**"Throws".** Expo reads the field by reflection. When the field is missing, it falls back only for CLOCK_TICK, CONTEXT_CLICK, KEYBOARD_TAP, LONG_PRESS and VIRTUAL_KEY. For anything else it throws `HapticsNotSupportedException`, and the JS promise rejects.

**Adding `GESTURE_THRESHOLD_*`** is a two-line patch: add an enum case to `HapticType` with that `name()`. Reflection does the rest. This is a candidate for `patch-package` and an upstream PR (PROPOSAL).

**What expo-haptics' non-Android-specific calls do on Android** (source: [HapticsModule.kt](https://github.com/expo/expo/blob/main/packages/expo-haptics/android/src/main/java/expo/modules/haptics/HapticsModule.kt), [ImpactType](https://github.com/expo/expo/blob/main/packages/expo-haptics/android/src/main/java/expo/modules/haptics/arguments/HapticsImpactType.kt), [NotificationType](https://github.com/expo/expo/blob/main/packages/expo-haptics/android/src/main/java/expo/modules/haptics/arguments/HapticsNotificationType.kt), [SelectionType](https://github.com/expo/expo/blob/main/packages/expo-haptics/android/src/main/java/expo/modules/haptics/arguments/HapticsSelectionType.kt)). Every one of them is `vibrator.vibrate(VibrationEffect.createWaveform(...))`:

| Call | On time (ms) | Amplitude (/255) |
|---|---|---|
| `impactAsync(Light)` or `(Soft)` | 50 | 30 |
| `impactAsync(Medium)` or `(Rigid)` | 43 | 50 |
| `impactAsync(Heavy)` | 60 | 70 |
| `selectionAsync()` | 50 | 30 |
| `notificationAsync(Success)` | 40, gap 100, 40 | 50 / 60 |
| `notificationAsync(Warning)` | 40, gap 120, 60 | 40 / 60 |
| `notificationAsync(Error)` | 60, 100, 40, 80, 50 | 50 / 40 / 50 |

These are 2.5–3× the recommended click length. Soft and Light are identical on Android, as are Rigid and Medium.

**UNVERIFIED:** whether these attribute-less `Vibrator` calls are silenced by the "Touch feedback" toggle. `performHapticFeedback` definitely is.

**Precedent.** Bluesky (React Native) hit exactly this problem. Its haptics hook says "Users said the medium impact was too strong on Android". It forces `Light` on Android and ships a patch to `expo-haptics@57.0.3` that re-times the vibration ([haptics.ts](https://github.com/bluesky-social/social-app/blob/main/src/lib/haptics.ts), [patch note](https://github.com/bluesky-social/social-app/blob/main/patches/expo-haptics%4057.0.3.patch.md)).

### 1.3 What is reachable from Expo (checked 2026-10-02)

| Library | Version / last activity | iOS engine | Android engine | Notes |
|---|---|---|---|---|
| **expo-haptics** | 57.0.3 (npm, 2026-10-01) | `UI*FeedbackGenerator`, new instance per call, no intensity ([src](https://github.com/expo/expo/blob/main/packages/expo-haptics/ios/HapticsModule.swift)) | `Vibrator.createWaveform`, plus `performAndroidHapticsAsync` → `View.performHapticFeedback` on the main queue | Already installed. Covers 90 % of the map below. |
| **react-native-pulsar** (Software Mansion) | 1.7.0 (npm 2026-08-11), repo pushed 2026-09-30, MIT, 458★ | Core Haptics | Composition primitives (API 30+), envelopes and frequency profiles (API 36+), fallbacks | 150+ presets (e.g. `heartbeat()`, `bloom()`, `chime()`); `usePatternComposer` (discrete + continuous amplitude/frequency curves); `useRealtimeComposer` for gesture-driven haptics; **worklet-compatible**; `Settings.enableHaptics()`, `getHapticsSupportLevel()`; requires New Architecture + react-native-worklets; Expo config plugin ([docs](https://docs.swmansion.com/pulsar/sdk/react-native/), [repo](https://github.com/software-mansion/pulsar)). Synchronised audio is unreleased in 1.7.0. Android system presets also map to newer constants (`SCROLL_TICK`, `DRAG_CROSSING`, …). Whether its worklets peer range covers 0.10 is UNVERIFIED (peer is `*`). |
| **react-native-haptic-feedback** | 3.0.0 (2026-03-29), 983★ | Rewritten on `CHHapticEngine` | `performHapticFeedback` first, then Composition (API 31+), then waveform | Adds AHAP playback, a pattern notation (`"oO.O"`), `useHaptics`, `TouchableHaptic`, `getSystemHapticStatus()` on Android. Says v3 removes a "25-second rate-limiting" issue: issue #98 reports that firing `impactLight` every 100 ms on iOS stops after about 25 s ([CHANGELOG](https://github.com/mkuczera/react-native-haptic-feedback/blob/main/CHANGELOG.md), [#98](https://github.com/mkuczera/react-native-haptic-feedback/issues/98)). No worklet support documented. |
| expo-ahap (Evan Bacon) | 0.0.1, last push 2023-10, no licence | Core Haptics, AHAP | none | **Abandoned. Avoid** ([repo](https://github.com/EvanBacon/expo-ahap)). |
| @candlefinance/haptics | 0.3.3, last push 2024-11 | AHAP | — | Stale ([repo](https://github.com/candlefinance/haptics)). |
| expo-better-haptics | 1.0.2 (2025-06), 6★ | custom patterns | — | Too small to depend on ([repo](https://github.com/carter-0/expo-better-haptics)). |

**Latency path with expo-haptics during a gesture.** A threshold is detected in a Reanimated or RNGH worklet on the UI thread. `scheduleOnRN` hops to the JS thread ([scheduleOnRN](https://docs.swmansion.com/react-native-worklets/docs/threading/scheduleOnRN)). The async native call then hops to the main actor. The generator is created and prepared, then fires.

That is up to three hops. Under JS load the haptic can land frames after the visual threshold. **UNVERIFIED by measurement.** Verify with a 240 fps camera on a mid-range Android.

Pulsar presets run directly in the worklet. That *should* remove the JS hop (an inference from its "worklet-compatible" claim, not measured).

### 1.4 Practice: when to fire, when not to

| Rule | Source |
|---|---|
| **One cause, one haptic.** It fires for the user's own action or for an event aimed at them, never for ambient updates (presence, counts, arrivals). | HIG causality; WWDC21 causality |
| **Never unsolicited state changes.** A button becoming available is a visual change only. | HIG "clear, causal relationship" |
| **Outcome haptics only on truth.** `success` fires when the server confirms, not when the gesture completes. | HIG notification = "outcome of a task" |
| **Sync to the frame the visual lands.** Fire from the animation reaction (Reanimated `useAnimatedReaction`) or on press-in, not on a timer. Telegram fires its reaction "soft" impact in the completion of a 0.18 s flight ([ReactionContextNode.swift](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/ReactionSelectionNode/Sources/ReactionContextNode.swift)). | HIG "complement other feedback"; Android "co-design… out of sync… feels broken" |
| **Prepare early, fire once per gesture.** Telegram creates and prepares its generator at the gesture's `.began`, fires once at the threshold, and guards with a `played` flag ([ChatMessageStickerItemNode.swift](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/TelegramUI/Components/Chat/ChatMessageStickerItemNode/Sources/ChatMessageStickerItemNode.swift)). | Apple `prepare()` doc |
| **Frequency limits.** Frequent events get the weakest cue or none. Space ticks so they don't smear: Android actuators ring for 20–50 ms after a 10–20 ms click. **PROPOSAL:** at least 60 ms between ticks on the same channel, and coalesce duplicates within 50 ms. Continuous firing (every 100 ms) got silenced after about 25 s on iOS (RNHF #98, anecdotal). | Android principles; RNHF #98 |
| **Respect the system and give an in-app off switch.** iOS generators obey the system; Android `performHapticFeedback` obeys "Touch feedback". Add an app-level toggle as well: Bluesky has `useHapticsDisabled`. | HIG "make haptics optional"; [Bluesky](https://github.com/bluesky-social/social-app/blob/main/src/lib/haptics.ts) |
| **Reduce Motion does not mean "reduce haptics".** Haptics are the HIG's suggested *alternative* channel when motion is reduced. | [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion) |
| **Don't double up on system controls.** RN `Switch` on iOS is `UISwitch`, and system pickers and sliders already play haptics. | HIG |
| **Battery.** The Taptic Engine idles "to conserve power", and Low Power Mode already disables haptics on iOS. The real battery and annoyance risk is volume: Instagram's 2019 test of "vibrate when you give a like" drew "Annoying and kills battery" ([9to5Mac](https://9to5mac.com/2019/12/04/haptic-overload/)). | Apple `prepare()`; Expo docs |
| **Avoid haptics during camera or mic capture** (voice notes, if ever added). | HIG |

### 1.5 How other apps do it (documented only)

**Telegram iOS** (open source):

- **Swipe-to-reply.** The threshold is 45 pt, or 60 pt depending on message direction. One `impact(.heavy)` fires when progress reaches 1.0, using a generator prepared at `.began`. Translation rubber-bands beyond the threshold to a maximum of 180 pt ([source](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/TelegramUI/Components/Chat/ChatMessageStickerItemNode/Sources/ChatMessageStickerItemNode.swift)).
- **Reaction picker.** A selection tick (`UISelectionFeedbackGenerator`) fires on every highlighted-reaction change while scrubbing, and on expand and collapse. Then `impact(.soft)` fires when the chosen reaction lands at the end of a 0.18 s parabolic flight with 25 pt elevation ([source](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/ReactionSelectionNode/Sources/ReactionContextNode.swift)).
- **Animated ❤️ emoji "heartbeat".** `impact(.medium)` at t = 0, 1, 2 s, and `impact(.light)` at +0.2 s after each. That is a lub-dub built only from impact generators ([HeartbeatHaptic.swift](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/TelegramUI/Components/Chat/MessageHaptics/Sources/HeartbeatHaptic.swift)).
- **Wrapper.** It keeps one generator per style alive and uses `impactOccurred(intensity: 0.3/0.4)` for "veryLight" and "click" variants. It also has a Core Haptics `ContinuousHaptic` that ramps intensity 0.1→1.0 at sharpness 0.3 ([HapticFeedback.swift](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/Display/Source/HapticFeedback.swift)).

**Signal Android** (open source):

- **Swipe-to-reply** triggers at **64 dp** (max 96 dp) with a **10 ms** vibration, once ([ConversationItemSwipeCallback.java](https://github.com/signalapp/Signal-Android/blob/main/app/src/main/java/org/thoughtcrime/securesms/conversation/ConversationItemSwipeCallback.java), [ConversationSwipeAnimationHelper.java](https://github.com/signalapp/Signal-Android/blob/main/app/src/main/java/org/thoughtcrime/securesms/conversation/ConversationSwipeAnimationHelper.java)).
- **Reaction scrubber.** `KEYBOARD_TAP` fires on each index change ([ChatReactionOverlayController.kt](https://github.com/signalapp/Signal-Android/blob/main/app/src/main/java/org/thoughtcrime/securesms/conversation/v2/ChatReactionOverlayController.kt)).
- **Gift reveal.** `CONFIRM` on API 30+, otherwise `KEYBOARD_TAP` ([ConversationItem.java](https://github.com/signalapp/Signal-Android/blob/main/app/src/main/java/org/thoughtcrime/securesms/conversation/ConversationItem.java)). This is the fallback-ladder pattern.

**Bluesky** (React Native + expo-haptics):

| Interaction | Haptic | Source |
|---|---|---|
| Like, repost and reply buttons | Light on press | [PostControlButton.tsx](https://github.com/bluesky-social/social-app/blob/main/src/components/PostControls/PostControlButton.tsx) |
| Long-press | Heavy | same file |
| Toggles and segmented controls | Light | [Toggle](https://github.com/bluesky-social/social-app/blob/main/src/components/forms/Toggle/index.tsx), [SegmentedControl](https://github.com/bluesky-social/social-app/blob/main/src/components/forms/SegmentedControl.tsx) |
| DM send | Medium (default) | [MessageComposer.tsx](https://github.com/bluesky-social/social-app/blob/main/src/screens/Messages/components/MessageComposer.tsx) |
| Context-menu item hover | Light | [ContextMenu](https://github.com/bluesky-social/social-app/blob/main/src/components/ContextMenu/index.tsx) |
| Plain tab press | **none**; only tab long-press | [BottomBar.tsx](https://github.com/bluesky-social/social-app/blob/main/src/view/shell/bottom-bar/BottomBar.tsx) |

**Instagram.** Tested "vibrate when you give a like" (Dec 2019, via Jane Manchun Wong), with reader backlash ([9to5Mac](https://9to5mac.com/2019/12/04/haptic-overload/)). Current behaviour: UNVERIFIED.

**Apple Messages.** Screen effects like "lasers" use continuous haptics (HIG). Tapback and swipe-to-reply haptics are **UNVERIFIED**, with no documentation found.

**Hinge, Tinder, Threads, Apple Invites.** No primary or reverse-engineered documentation was found for their haptics. **UNVERIFIED.** Searches returned only design-blog generalities ([e.g.](https://builtin.com/articles/tinder-swipe-design)). Do not cite them in the brief as sources.

### 1.6 Current Blendn haptic defects (from the sibling audits)

1. **An incoming wave fires two haptics,** Light and Medium (`useRoom.ts:777` + `BlendnScreen.tsx:312`).
2. **Hold-to-check-in fires Success twice.** It fires `Success` at hold 100 % *and again* on server success. On refusal the user gets Success followed by Error, which is a mixed signal (`HoldToConfirm.tsx:76-79`, `useCheckInFlow.ts:198`).
3. **These actions have no haptic:** double-tap like, the Like button (generic press tick only), message send, reaction pick, and lock/reveal.
4. **Tabs have no haptic, but the disc does.** That is fine, keep it.
5. **Android:** every existing call (`impactAsync`/`selectionAsync`/`notificationAsync`) is the long waveform buzz described in §1.2.

### Implication for Blendn (§1)

- **Keep expo-haptics as the only dependency for v1.**
- Put every call behind one `lib/haptics.ts` with semantic cue names (§2.2). On Android, route everything through `performAndroidHapticsAsync` with a per-API fallback ladder, and catch the rejections.
- Patch expo-haptics to expose `GESTURE_THRESHOLD_ACTIVATE`/`DEACTIVATE`.
- Add an in-app Haptics toggle.
- Consider **react-native-pulsar** only for two signature moments, the match and the hold-to-confirm ramp, and only after the v1 map ships. It is the one maintained, worklet-native, cross-platform Core Haptics/Composition option, and it comes from the same vendor as Reanimated and RNGH.

---

## 2. Recommended haptic map

### 2.1 Global rules (PROPOSAL, derived from §1.4)

- **R1: One event, one haptic.** Coalesce duplicates within 50 ms. At most one outcome haptic per user action.
- **R2: Nothing unsolicited.** Exception: a social signal aimed at *you* while you are in the Room (a wave). Presence, counts, arrivals, auto-advance and server pushes get nothing.
- **R3: Outcome after truth.** `success`/`error` fire on server response. Gesture completions get a "commit" impact.
- **R4: Fire on the frame.** Press cues fire on press-in. Gesture cues fire at the threshold frame, once per gesture, re-armed only after crossing back. Landing cues fire on the landing frame.
- **R5: Android uses `performAndroidHapticsAsync` with a fallback.** Use waveform calls (`notificationAsync`) only as the fallback for the three *important* outcomes: check-in success, check-in refused, and send failed.
- **R6: The in-app toggle** checks before every call. Reduce Motion does not disable haptics.
- **R7: Minimum interval.** At least 60 ms between ticks on the same channel.

### 2.2 The map

The Android column gives the preferred constant · its API level → the fallback (in brackets: "none" means play nothing). Every Android call is `Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.X)` unless it says otherwise.

| # | Interaction | iOS (expo-haptics) | Android | Fire when | Rationale / precedent |
|---|---|---|---|---|---|
| 1 | **Primary CTA** (the single gradient primary per screen) | `impactAsync(Light)` | `Virtual_Key` · 5 | press-in | Earliest causal moment (WWDC18: "Everything needs to respond instantly"). VIRTUAL_KEY is Android's key-press constant (doc example). Bluesky: Light on post controls. Async outcomes add their own cue (rows 14/19). Only the one primary gets it (R1, frequency). |
| 2 | **Secondary / tertiary button** | none | none | — | HIG "avoid overusing"; Android "less is more". Press-state visual only. Today `ScalePress` ticks on most buttons, so make `haptic` opt-in. |
| 3 | **Tab switch** (Pulse, Going, Banter, Me) | none | none | — | High frequency, navigation is not an outcome; Bluesky does the same; matches Blendn today. Scroll-to-top on re-tap: none. |
| 4 | **Centre Blend'n disc tap** | `impactAsync(Medium)` | `Virtual_Key` · 5 | press-in | The signature control opens a full-screen stage. Medium is the "medium-sized object" in HIG terms and is heavier than any tab. Replaces today's `selectionAsync`. |
| 5 | **Centre disc state change** (check-in becomes available, goes live) | **none** | **none** | — | Unsolicited (R2). The state must read in a still frame: gradient vs outline mark, plus the dot. If the app is backgrounded, the push notification's system haptic covers it. |
| 6 | **Toggle on / off** (custom toggle) | `impactAsync(Light)` both ways; **none** if it is RN `<Switch>` (UISwitch plays its own) | `Toggle_On` / `Toggle_Off` · 34 → `Clock_Tick` | on value change | HIG: system switches play haptics, so don't double up. TOGGLE_* is the exact Android semantic. Bluesky: Light. |
| 7 | **Segmented control / chip select** | `selectionAsync()` | `Segment_Tick` · 34 → `Clock_Tick` | value changes (not re-tap) | HIG Selection = "values are changing"; SEGMENT_TICK = "switching between potential choices". |
| 8 | **Pull-to-refresh threshold** | Native `RefreshControl`: none; **check on device for a system haptic before adding one** (UNVERIFIED). Custom: `impactAsync(Light)` once at arm | `GESTURE_THRESHOLD_ACTIVATE` · 34 (needs the expo patch) → `Segment_Tick` · 34 → `Clock_Tick`. Disarm: `GESTURE_THRESHOLD_DEACTIVATE` (patched) → none | arm; disarm on Android only | The Android constant names pull-to-refresh explicitly. Refresh is "more important than a toggle" (Android principles). |
| 9 | **Swipe-to-reply threshold** | `impactAsync(Medium)` once (today: Light at 56 pt) | `GESTURE_THRESHOLD_ACTIVATE` (patched) → `Segment_Tick` → `Clock_Tick` | threshold frame, once per gesture; prepare at gesture start | Telegram: **Heavy** at 45/60 pt. Signal: 10 ms at 64 dp. Light is easy to miss mid-drag; Medium matches the bubble "snapping" into reply. |
| 10 | **Swipe card past like (or pass) threshold** | `selectionAsync()` at arm; nothing on release. If committed by flick without crossing, fire once at commit | `GESTURE_THRESHOLD_ACTIVATE` (patched) → `Segment_Tick` → `Clock_Tick` | arm (once; re-arm after disarm) | Decks are high-frequency, so use the subtlest cue (Android principles) and exactly one per card (R1). Today: Light on every committed throw. |
| 11 | **Long-press preview / context menu opens** | `impactAsync(Medium)` (keep today's) | `Long_Press` · 3 | at recognition (the menu appears) | LONG_PRESS is the exact Android semantic. Bluesky: Heavy. |
| 12 | **Like / heart** (double-tap or button) | `impactAsync(Soft)` | `Toggle_On` · 34 → `Virtual_Key` | at recognition. None on unlike, or when already liked | HIG harmony: HeartPop is elastic and round, which is "soft, flexible objects". A like is a toggle. Instagram's like-vibration test shows people notice frequency, so this stays light. |
| 13 | **MATCH moment** | **Signature "lub-dub":** `impactAsync(Medium)` on the landing frame (their face's bump), then `impactAsync(Soft)` +180 ms. **Replaces** today's `notificationAsync(Success)`. Pulsar upgrade: `Presets.heartbeat()` or a custom pattern (continuous swell 0→0.5, sharpness 0.2, 0–240 ms; transient 1.0 @ 260 ms; transient 0.5 @ 440 ms) | `Confirm` · 30 on landing → `notificationAsync(Success)` (an important moment, so the waveform fallback is justified). Pulsar upgrade: Composition `QUICK_RISE` then `CLICK` (UNVERIFIED feel) | landing frame; fires even under Reduce Motion | HIG: "if the documented meaning doesn't fit… create your own". A match is not a completed task. Telegram builds a heartbeat from Medium then Light 200 ms apart. One unique cue makes the brand's peak moment learnable (causality). |
| 14 | **Check-in success** | `notificationAsync(Success)`, **once, on server OK** | `Confirm` · 30 → `notificationAsync(Success)` | server confirmation | Fixes the double Success. HIG Success = task completed. |
| 15 | **Hold-to-confirm** (900 ms) | **Ramp:** 25 % `Soft`, 50 % `Light`, 75 % `Medium` (all `impactAsync`), 100 % `impactAsync(Rigid)` = *committed*, not success. Release early: none. Then row 14 or 19 on the server response | 25/50/75 %: `Segment_Tick` · 34 → `Clock_Tick`; 100 %: `Long_Press` · 3 | quarter frames via `useAnimatedReaction` (as today), going up only | Android: "gradually increasing the amplitude of a sequence of ticks" toward the target. LONG_PRESS = "long press resulting in an action". Rigid = the fill hitting the pill's end. Ticks are about 225 ms apart, above the R7 floor. |
| 16 | **Message sent** | `impactAsync(Light)` | `Virtual_Key` · 5 | send commit (tap-up when the message is queued locally) | Bluesky: Medium on DM send. Light keeps chat (high frequency) calm. The landing animation gets no second cue (R1). |
| 17 | **Message received while chat is open** | none | none | — | Unsolicited, high frequency in group rooms, visible on screen. Android's "notify of events needing attention" doesn't apply to something already in view. |
| 18 | **Reaction pick** | scrub: `selectionAsync()` per highlight change; commit: `impactAsync(Soft)` when the reaction lands on the bubble | scrub: `Segment_Tick` · 34 → `Keyboard_Tap`; commit: `Toggle_On` · 34 → `Virtual_Key` | per change; landing frame | Telegram: selection per highlight plus soft on landing (0.18 s flight). Signal: KEYBOARD_TAP per scrub step. |
| 19 | **Error / validation** | `notificationAsync(Error)` on submit failure or server refusal only; none for inline as-you-type validation | `Reject` · 30 → `notificationAsync(Error)` (blocking failures only) else none | failure response | HIG Error. Inline validation is too frequent. Pair with the error shake (§4.3). |
| 20 | **Destructive confirm** (unmatch, leave room, delete) | none when the sheet opens; `impactAsync(Rigid)` on the destructive tap | `Confirm` · 30 → `Virtual_Key` | destructive button press | PROPOSAL: Warning is reserved for "produced a warning", which this isn't. A crisp, final collision. CONFIRM = "successful completion of a user interaction". |
| 21 | **Picker / slider detents** | Native picker: none extra (system plays). Custom scrubber: `selectionAsync()` per detent; for dense ranges, only at labelled stops | `Segment_Tick` · 34 → `Clock_Tick`; dense: `Segment_Frequent_Tick` · 34 → none | each detent crossing | HIG Selection; Android FREQUENT_TICK "very soft… may not vibrate". Blendn's "Nights out" week scrub already ticks per night. |
| 22 | **Carousel snap** (Pulse featured) | none | none | — | Passive browsing; auto-advance would be unsolicited. If a carousel *is* a selector (a date strip that filters), use row 7. |
| 23 | **Sheet detent snap** (after a user drag) | `impactAsync(Light)` when it settles at a *different* detent; none on programmatic present/dismiss; none on native `formSheet` (system-owned; whether UIKit plays one is UNVERIFIED) | `Segment_Tick` · 34 → none | settle frame | HIG Impact: "a tap when a view snaps into place". Detents are discrete choices. |
| 24 | **Rolling number tick** (headcount, Me stats) | none | none | — | Passive data change (R2). User-scrubbed numbers follow row 21. |
| 25 | **Confetti** | none of its own; it rides on row 14's Success | none | — | One event, one haptic. A Core Haptics "crackle" (Messages effects style) would need Pulsar, not expo-haptics; a burst of impacts would be buzzy. |
| 26 | **Incoming wave, or a like aimed at you, in the Room** | `impactAsync(Light)`, **once** (today: Light + Medium) | `Clock_Tick` · 21 | on arrival, while in the Room | A social signal aimed at you is the R2 exception. Fixes the double haptic. |
| 27 | **Toast / skeleton / list enter / tab badge** | none | none | — | Feedback belongs to the action that caused it, not to its messenger. |

### 2.3 Module sketch (PROPOSAL)

```ts
// lib/haptics.ts: the only file that imports expo-haptics
import * as H from 'expo-haptics';
import { Platform } from 'react-native';
const A = H.AndroidHaptics, I = H.ImpactFeedbackStyle;
type Ladder = readonly H.AndroidHaptics[];           // preferred → fallback
const cue = {
  press:   { ios: () => H.impactAsync(I.Light),  and: [A.Virtual_Key] },
  disc:    { ios: () => H.impactAsync(I.Medium), and: [A.Virtual_Key] },
  select:  { ios: () => H.selectionAsync(),      and: [A.Segment_Tick, A.Clock_Tick] },
  arm:     { ios: () => H.selectionAsync(),      and: [/* GESTURE_THRESHOLD_ACTIVATE once patched */ A.Segment_Tick, A.Clock_Tick] },
  like:    { ios: () => H.impactAsync(I.Soft),   and: [A.Toggle_On, A.Virtual_Key] },
  commit:  { ios: () => H.impactAsync(I.Rigid),  and: [A.Long_Press] },
  success: { ios: () => H.notificationAsync(H.NotificationFeedbackType.Success), and: [A.Confirm], important: true },
  // …one entry per row of §2.2
} as const;
// play(name): returns early if the in-app toggle is off or the same cue fired < 60 ms ago;
// on Android tries each ladder entry and catches the rejection; if every entry fails
// and the cue is `important`, falls back to notificationAsync.
```

### Implication for Blendn (§2)

- **27 rows reduce to about 12 distinct cues.**
- **Two need new behaviour:** the match "lub-dub" and the hold ramp with the outcome moved to the server response.
- **Five fix live defects:** the double wave, the double Success, Success followed by Error, no like haptic, and no send haptic.
- Today's `ScalePress` default (a selection tick on every press-in) should flip to opt-in, so that only the primary CTA and the disc tick on press.

---

## 3. Motion: platform research

### 3.1 Apple springs: duration and bounce

**WWDC23 "Animate with springs"** ([video](https://developer.apple.com/videos/play/wwdc2023/10158/)):

- **Springs are "the only type of animation that maintains continuity"** of position *and* velocity, both from rest and when picking up a gesture's velocity.
- **Retargeting** a running spring preserves its velocity, so interruptions feel natural.
- **Two parameters: duration and bounce.**
  - Bounce > 0 is "bouncy", 0 is "smooth" (critically damped), and < 0 is "flattened".
  - Duration is *perceptual*, which is different from the settling duration.
  - "You shouldn't wait for the settling duration for user-facing changes."
- **Tuning:**
  - Pick the duration first, then the bounce.
  - "A small bounce, like around 15 %… brisk"; 30 % gives "noticeable bounciness".
  - **"Be cautious about using values higher than around 0.4."**
  - "When you're not sure, use a spring with bounce 0."
  - Add bounce "when you want an animation to feel more physical, like… at the end of a gesture."
  - Keep springs consistent with the app's character.
- **Different properties may finish at different times,** and iOS app launch layers several springs with offset starts.

**SwiftUI presets** ([Spring](https://developer.apple.com/documentation/swiftui/spring)):

- `.smooth`, `.snappy` and `.bouncy` default to **duration 0.5 s** with base bounce **0**, **0.15** and **0.3** ([smooth](https://developer.apple.com/documentation/swiftui/animation/smooth(duration:extrabounce:)), [snappy](https://developer.apple.com/documentation/swiftui/animation/snappy(duration:extrabounce:)), [bouncy](https://developer.apple.com/documentation/swiftui/animation/bouncy(duration:extrabounce:))).
- `interactiveSpring` defaults to **0.15 s**, bounce 0, `blendDuration` 0.25 ([doc](https://developer.apple.com/documentation/swiftui/animation/interactivespring(duration:extrabounce:blendduration:))).
- **Conversion,** confirmed against Apple's own example where `Spring(duration: 0.5, bounce: 0.3)` gives mass 1.0, stiffness 157.9, damping 17.6:
  - `stiffness = (2π / duration)² · mass`
  - `damping = 4π · (1 − bounce) · mass / duration` (for bounce ≥ 0)
  - therefore **dampingRatio = 1 − bounce**

**WWDC18 "Designing Fluid Interfaces"** ([video](https://developer.apple.com/videos/play/wwdc2018/803/)):

- "People are really, really sensitive to latency… Everything needs to respond instantly."
- **Interface rules:**
  - Allow "constant redirection and interruption".
  - Hint in the direction of the gesture.
  - Keep touch interactions lightweight but amplify their output.
  - Use rubber-banding at edges.
  - Mind "what's in the frames", not just the frame rate.
- **Damping guidance:**
  - "Start with 100 % damping, or no overshoot."
  - "If the gesture that's driving the motion itself has momentum, then you should reward that momentum with a little bit of overshoot."
  - Example: Music's Now Playing uses **100 % damping when tapped open** and **80 % damping when swiped to dismiss**.
- **Projection:**
  - Use the release velocity "mixed in [with] the deceleration rate" to project where a flung object *would* go, then snap to the nearest target.
  - The formula in Apple's sample code, `v/1000 · r/(1−r)`, is **UNVERIFIED** because it is not in the transcript.
  - The default decay rate is 0.998 in both Reanimated `withDecay` ([doc](https://docs.swmansion.com/react-native-reanimated/docs/animations/withDecay)) and UIKit's "normal" rate.
- **Cohesion:** "treat behaviors as a family of behaviors… If you have a playful app… embrace that character."

### 3.2 iOS 18 / 26 motion

**iOS 18 zoom navigation transition** ([WWDC24 "Enhance your UI animations and transitions"](https://developer.apple.com/videos/play/wwdc2024/10145/)):

- It is "continuously interactive, allowing you to grab and drag it around, from the beginning or during the transition."
- "The system never cancels an interrupted push… the push is always converted into a pop."
- Use it "where you have a large cell to zoom from".
- In UIKit and SwiftUI, gesture-driven springs "retarget" during a drag (`interactiveSpring`), and a final spring inherits the velocity.

**Liquid Glass motion** ([WWDC25 "Meet Liquid Glass"](https://developer.apple.com/videos/play/wwdc2025/219/)):

- Glass "responds to interaction by instantly flexing and energizing with light". It "illuminates from within" under the finger, and the glow spreads to nearby glass elements.
- It has "gel-like flexibility… moves in tandem with your interaction". The "resting state stay[s] visually quiet, while it comes to life on touch."
- "Instead of fading, Liquid Glass objects materialize in and out by gradually modulating the light bending and lensing."
- Glass "dynamically morphs between the controls in each context… a singular floating plane".
- When glass grows (a menu from a toolbar button), it "simulate[s] a thicker, more substantial material".
- Glass belongs on the navigation layer only. Never put glass on glass.
- **"Reduced Motion decreases the intensity of some effects and disables any elastic properties for the material."**

**WWDC25 "Get to know the new design system"** ([video](https://developer.apple.com/videos/play/wwdc2025/356/)):

- Action sheets now spring "from the action itself".
- When a sheet is dragged upward, glass "subtly recedes, becoming more opaque and gently growing in size".
- Modality is signalled with a dimming layer.

**What Expo exposes:**
- `expo-glass-effect` provides `GlassView` (iOS 26+; falls back to `View`), `GlassContainer` (merging) and `isInteractive` ([doc](https://docs.expo.dev/versions/latest/sdk/glass-effect/)).
- **Motion gotcha:** setting `opacity: 0` on a GlassView *or any parent* stops the glass rendering. Fade glass with `glassEffectStyle: { animate: true, animationDuration }`, not with opacity.
- `@expo/ui` SwiftUI exposes `glassEffect`, `glassEffectId` (morph identity inside a `GlassEffectContainer`), `matchedGeometryEffect`, and `contentTransition('numericText')` (iOS 16+) ([modifiers](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/modifiers/)). That last one is a native rolling-number option.

### 3.3 Material 3 Expressive motion physics

- **Two kinds of spec** ([M3 blog, "Adding Motion Physics with Jetpack Compose"](https://m3.material.io/blog/m3-expressive-motion-theming); [MotionScheme](https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme)):
  - **Spatial** springs animate "position, orientation, size, and shape", and *may* overshoot.
  - **Effects** springs animate "color and opacity, where there shouldn't be any overshoot."
- **Three speeds:** default, fast and slow. "Most motion should use the default speed, but smaller elements may benefit from the fast speed and larger elements from the slow."
- **Two schemes:** **Expressive** is "for prominent UI elements and hero interactions". **Standard** is "for utilitarian UI elements and recurring interactions… a linear motion feel" ([MotionScheme.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/MotionScheme.kt)).

**Token values** from Compose source ([ExpressiveMotionTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt), [StandardMotionTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StandardMotionTokens.kt)). Compose springs use mass 1. The Apple-equivalent columns and settle times are COMPUTED.

| Token | dampingRatio | stiffness | ≈ Apple duration / bounce | Overshoot | Settle (0.1 %) |
|---|---|---|---|---|---|
| Expressive spatial **fast** | 0.6 | 800 | 0.22 s / 0.40 | 9.5 % | 477 ms |
| Expressive spatial **default** | 0.8 | 380 | 0.32 s / 0.20 | 1.5 % | 483 ms |
| Expressive spatial **slow** | 0.8 | 200 | 0.44 s / 0.20 | 1.5 % | 651 ms |
| Effects fast / default / slow (both schemes) | 1.0 | 3800 / 1600 / 800 | 0.10 / 0.16 / 0.22 s / 0 | 0 | 186 / 271 / 368 ms |
| Standard spatial fast / default / slow | 0.9 | 1400 / 700 / 300 | 0.17 / 0.24 / 0.36 s / 0.10 | 0.2 % | 260 / 349 / 475 ms |

**Duration and easing tokens** ([MotionTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionTokens.kt)):

- Durations are short1–4 = 50/100/150/200 ms, medium1–4 = 250–400 ms, and long1–4 = 450–600 ms.
- Easings: standard and emphasized `(0.2, 0, 0, 1)`, emphasized-decelerate `(0.05, 0.7, 0.1, 1)`, emphasized-accelerate `(0.3, 0, 0.8, 0.15)`, standard-accelerate `(0.3, 0, 1, 1)`, legacy `(0.4, 0, 0.2, 1)`.
- The pressed state layer is 10 % opacity ([StateTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt)).

**Cross-check.** The overshoot figures COMPUTED here (1.5 % at ζ 0.8 and 9.5 % at ζ 0.6) match the figures quoted around the M3 spec. Apple and M3 agree on where things land: a 0.2 bounce for gesture- and hero-level spatial motion, and no overshoot for effects.

### 3.4 Reanimated 4.x in this stack

**Compatibility.** Reanimated 4.5.x supports RN 0.83–0.86 with worklets 0.10/0.11, so Blendn's set is valid. The latest is 4.7.1 (RN 0.86–0.88, worklets 0.13) ([compatibility.json](https://github.com/software-mansion/react-native-reanimated/blob/main/packages/react-native-reanimated/compatibility.json)). It requires the New Architecture ([migration](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/)).

**`withSpring`** ([doc](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/)):

- Physics form `{mass 4, stiffness 900, damping 120}` is the default, critically damped. The duration form is `{duration 550, dampingRatio 1}`.
- **"Duration… perceptual… Actual duration is 1.5 times."**
- `velocity`, `overshootClamping` and `energyThreshold` (6e-9) replace the 3.x rest thresholds. `clamp` reduces the damping ratio if a bound would be exceeded.
- Exported presets ([springConfigs.ts](https://github.com/software-mansion/react-native-reanimated/blob/main/packages/react-native-reanimated/src/animation/spring/springConfigs.ts)):
  - `GentleSpringConfig {120, 4, 900}` (= the default)
  - `WigglySpringConfig {damping 90}` (ζ 0.75)
  - `SnappySpringConfig {110, overshootClamping: true}`
  - `Reanimated3DefaultSpringConfig {10, 1, 100}`, each with a `…WithDuration` twin
- **Duration-form springs re-solve stiffness on every start from `x0` and `v0`** (`calculateNewStiffnessToMatchDuration`, [springUtils.ts](https://github.com/software-mansion/react-native-reanimated/blob/main/packages/react-native-reanimated/src/animation/spring/springUtils.ts)). After a gesture, the same token therefore feels different at different release velocities. **Use the physics form for anything a gesture hands off to** (COMPUTED from source; PROPOSAL).

**CSS animations and transitions** ([animations](https://docs.swmansion.com/react-native-reanimated/docs/css-animations/overview), [transitions](https://docs.swmansion.com/react-native-reanimated/docs/css-transitions/overview)):

- They are declarative, run "off the JavaScript thread", and are "the recommended starting point".
  - **Transitions:** for state-driven changes.
  - **Keyframe animations:** for self-running loops such as spinners, pulses and the typing indicator.
  - **Shared values with `useAnimatedStyle`:** for gesture-driven, scroll-driven or orchestrated motion.
- Timing functions are cubic-bezier, `linear()` and `steps()`. CSS transitions have no spring.
- **Pseudo selectors** (`:active`, `:focus`, `:hover`) transition press states "without ever putting that state in React", entirely off the JS thread ([doc](https://docs.swmansion.com/react-native-reanimated/docs/css-transitions/pseudo-selectors)). They shipped in **4.5.0**. **4.6.0** fixed re-registration after remount and Android re-attach, and made pseudo selectors win over renders ([4.5.0](https://github.com/software-mansion/react-native-reanimated/releases/tag/4.5.0), [4.6.0](https://github.com/software-mansion/react-native-reanimated/releases/tag/4.6.0)). **Upgrade to 4.6.x (worklets 0.12) before relying on `:active` for press feedback.**

**Layout animations** ([transitions](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/layout-transitions), [entering/exiting](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations), [lists](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/list-layout-animations), [custom](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/custom-animations)):

- `LinearTransition` defaults to 300 ms, `inOut(quad)`. `.springify()` uses the spring defaults (**mass 4**, stiffness 900, damping 120).
- Entering and exiting presets default to 300 ms. Bounce presets default to 600 ms.
- `itemLayoutAnimation` works only on a **single-column** `Animated.FlatList`.
- Custom `entering` worklets receive `targetGlobalOriginX/Y`, `targetWidth` and `targetHeight`. That is what a composer→bubble hand-off needs.

**Shared-element transitions** ([doc](https://docs.swmansion.com/react-native-reanimated/docs/shared-element-transitions/overview)):

- "Experimental… behind a feature flag, not recommended for production use yet."
- Native stack only, so tabs are not supported. They are blocked by native modals on iOS. No custom animation function. The default is 500 ms `withTiming`.

**Reduce Motion** ([doc](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility)):

- The default is `ReduceMotion.System`. `withSpring` and `withTiming` then *jump to the end value*, entering and layout animations "instantaneously reach their endpoints", and **exiting animations and shared transitions are omitted**.
- `useReducedMotion()` reads the setting **at app start only**. For live changes, RN's `reduceMotionChanged` event fires on both platforms. On Android, reduce motion maps to "Transition Animation Scale = off" ([AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)).
- `prefersCrossFadeTransitions()` exists on iOS.

**Performance guide** ([doc](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance)):

- Animate "no more than **100** components for low-end Android devices and no more than **500** for iOS."
- Prefer `transform`/`opacity` over layout properties.
- Enable `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` and `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` for many simultaneous animations. This affects touch on animated transforms, so use RNGH `Pressable`.
- Use `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` (Reanimated 4.2+, RN 0.80+) for FPS drops while scrolling.
- Memoise gestures. Don't read `.value` on JS.
- For counters, animate a `TextInput` or use SwiftUI `.numericText`.
- 120 fps needs `CADisableMinimumFrameDurationOnPhone`. Expo has enabled this key by default since its config-plugins change ([CHANGELOG](https://github.com/expo/expo/blob/main/packages/@expo/config-plugins/CHANGELOG.md), [bare template Info.plist](https://github.com/expo/expo/blob/main/templates/expo-template-bare-minimum/ios/HelloWorld/Info.plist)). **Verify it is in Blendn's generated Info.plist.**

### 3.5 expo-router transitions

**Zoom** ([doc](https://docs.expo.dev/router/advanced/zoom-transition/)):

- `Link.AppleZoom` wraps the source, and `Link.AppleZoomTarget` marks the alignment on the destination.
- Status: alpha, **iOS 18+ only**. It degrades to a normal push on older iOS and on Android.
- Limitations:
  - Avoid it on screens with headers.
  - Router Stack only.
  - A single child.
  - Combining it with `Link.Preview` needs a `fullScreenModal` target.
  - `usePreventZoomTransitionDismissal` exists to control dismissal.
  - About 1 s of latency on rapid open/close/open, an upstream react-native-screens issue ([expo#42797](https://github.com/expo/expo/issues/42797), open).
- Blendn's minimum is iOS 16.4 ([Expo versions](https://docs.expo.dev/versions/latest/)), so a fallback is mandatory.

**Form sheets** ([modals](https://docs.expo.dev/router/advanced/modals/)):

- Set `presentation: 'formSheet'` with `sheetAllowedDetents` (fractions or `'fitToContents'`), `sheetInitialDetentIndex`, `sheetGrabberVisible` (iOS), `sheetCornerRadius` and `sheetLargestUndimmedDetentIndex`.
- Android: **at most 3 detents**, and no native header inside the sheet.

**Native tabs** ([doc](https://docs.expo.dev/router/advanced/native-tabs/)):

- Liquid Glass tab bar, `minimizeBehavior="onScrollDown"`, iOS 26 search role, and a bottom accessory. Still `unstable-native-tabs` in SDK 55–57.
- At most 5 tabs on Android. Tab bar height can't be measured. Limited FlatList support (no minimize-on-scroll). Every tab mounts eagerly.
- A custom centre *disc* isn't one of the customisation points, so the docs point to custom tabs "if your app requires a fully custom design". This is an inference about the disc specifically. Blendn's centre disc keeps the JS tab bar.

### 3.6 Principles for an "alive" UI, with sources

| Principle | Concrete rule | Source |
|---|---|---|
| **Press response** | The visual press state starts in the same frame as touch-down: UI-thread `:active` or RNGH, never JS state. Whole response under 100 ms (Nielsen's "feels instantaneous" limit). Today's `ScalePress` is a 120 ms CSS transition, which is fine because the *start* is immediate. | [NN/g 0.1 s](https://www.nngroup.com/articles/response-times-3-important-limits/); WWDC18 |
| **Continuity** | The same object travels between states (card → detail, disc → stage, composer → bubble). Use springs so velocity is continuous. | WWDC23; WWDC24 zoom |
| **Interruptibility** | Every transition can be grabbed or reversed mid-flight; retarget springs, never queue. "Let people cancel motion… don't make people wait for an animation to complete." | [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion); WWDC24 (push → pop) |
| **Velocity hand-off** | On `onEnd`, pass `velocity` into `withSpring` (physics form), project with the decay rate (0.998), and snap to the nearest target. Overshoot only when momentum exists (bounce ≤ 0.2). | WWDC18; Reanimated `withDecay` |
| **Choreography** | Primary object first. Secondary content 40–80 ms later. Stagger lists 18–40 ms within at most 200 ms. Different properties may end at different times. | WWDC23 (app launch layering); PROPOSAL for numbers |
| **Brevity for frequent UI** | "Generally avoid adding motion to UI interactions that occur frequently." | HIG Motion |
| **Ambient budget** | Only one thing loops while idle (the orbs). Transforms only. Slow (more than 20 s periods, so well under 0.2 Hz; Apple warns about sustained oscillation near 0.2 Hz in visionOS, applied here by analogy). Paused when unfocused, in Low Power Mode, or with Reduce Motion on. | [HIG Motion (visionOS)](https://developer.apple.com/design/human-interface-guidelines/motion); [Energy Guide](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/AvoidExtraneousGraphicsAndAnimations.html); [Android ARR](https://developer.android.com/develop/ui/views/animations/adaptive-refresh-rate) |
| **Translucency cost** | "Reduce the use of opacity… avoid using it over content that changes frequently. Otherwise, energy cost is magnified." Glass over moving orbs is that case, so orbs drift slowly and freeze during scroll-heavy screens. | Energy Guide |
| **Frame budget** | 16 ms at 60 Hz, 11 ms at 90 Hz, 8 ms at 120 Hz. A frame that overruns by 1 ms is dropped entirely. More than 700 ms is a frozen frame. | [Android vitals](https://developer.android.com/topic/performance/vitals/render) |
| **Refresh rate** | iOS needs `CADisableMinimumFrameDurationOnPhone` for more than 60 Hz; "the system automatically handles frame pacing". On Android, any animation "often boosts to the maximum refresh rate", and ARR on Android 15 QPR1+ lowers it for small animations. | [Apple ProMotion](https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays); Android ARR |
| **Low-end Android** | At most 100 animated components. Prefer transform/opacity. Use release builds when judging. Pause orbs under Power Saver (`expo-battery` `useLowPowerMode`, [doc](https://docs.expo.dev/versions/latest/sdk/battery/)). | Reanimated perf guide |
| **Reduce Motion** | Tighten springs (no bounce). Track gestures directly. No z-depth animation. **Replace x/y/z transitions with fades.** No animating into or out of blurs. Reduce automatic and repetitive animation. Liquid Glass loses its elasticity. | [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility); WWDC25-219 |
| **Motion can't carry state** (Blendn's existing rule) | Every state reads in a still frame and under Reduce Motion. Motion is feedback and continuity. Consistent with HIG "Make motion optional… avoid using it as the only way to communicate important information." | HIG Motion |

### 3.7 Audit of Blendn's current motion values (COMPUTED)

| Current token / use | Physics | ≈ Apple duration / bounce | Overshoot | Settle (0.1 %) | Verdict |
|---|---|---|---|---|---|
| `MOTION_SPRING.gentle` | d 18, k 220, m 0.9 | 0.40 s / **0.36** | 7.3 % | 720 ms | Not gentle: bouncier than Apple's `.bouncy` (0.3). It is used to *drain* a failed hold, which should be smooth. |
| `MOTION_SPRING.snappy` | d 16, k 280, m 0.75 | 0.33 s / **0.45** | 12.5 % | 711 ms | Above Apple's 0.4 caution. Used for drag spring-backs and face-in, where Apple says 0.2 is enough. |
| HeartPop spring | d 9, k 320, m 0.6 | 0.27 s / **0.68** | 34 % | 974 ms | Cartoonish. Fine for a single heart, but off-family. |
| Room `LinearTransition.springify().damping(18).stiffness(220)` (no mass, so default 4) | d 18, k 220, m 4 | 0.85 s / **0.70** | 37 % | **~2.9 s** | Probably a bug. It looks like `gentle` with the mass forgotten. Reflow wobbles for about 3 s. |
| SwipeDeck home / RisingSheet `{duration 550/400, dampingRatio 0.8}` | duration form | bounce 0.2 | 1.5 % | 1.5× the stated duration | The character is right. Move to the physics form so velocity can't change the feel. |
| Reanimated 4 default | d 120, k 900, m 4 | 0.42 s / 0 | 0 | 641 ms | A good "settle" default. |

**De-facto curves that are missing from the token file:**
- `bezier(0.23, 1, 0.32, 1)`: ScalePress, popIn, the SwipeDeck throw. Telegram uses the identical curve as the horizontal axis of its send animation.
- `bezier(0.32, 0.72, 0, 1)`: RisingSheet.
- `bezier(0.33, 0, 0.2, 1)`: MatchMoment hearts.

### Implication for Blendn (§3)

- Re-base the springs on Apple's (duration, bounce) family, with the physics form canonical in code, mass 1.
- Cap bounce at 0.2 for gesture hand-offs and 0.35 for once-a-session peaks. Effects (opacity, colour, blur, glass) never overshoot.
- Fix the mass-4 layout spring.
- Codify the three ad-hoc curves.
- Plan Reanimated 4.6.x for `:active` press feedback.
- Use the Expo zoom transition on iOS 18+ only, behind a fallback. Do not use Reanimated SET.

---

## 4. Proposed motion system (PROPOSAL)

### 4.1 Token set

**Durations (ms).** These keep the current scale and add two.

| Token | ms | Use |
|---|---|---|
| `instant` | 0 | Reduce Motion endpoints, state swaps that must read in a still frame |
| `press` | 100 | press-in and press-out visuals (existing 100) |
| `quick` | 160 | exits, small fades, effects-fast (existing 160) |
| `base` | 220 | effects default, small enters, crossfades (existing 220) |
| `medium` | 320 | medium spatial when timing is required, shake (existing 320) |
| `long` | 520 | large spatial when timing is required (existing 520) |
| `moment` | 1000 | **new**: the total budget for a choreographed peak (match, check-in) |
| `ambient` | 28000 / 36000 | **new**: orb drift periods (two, incommensurate) |

**Springs.** The physics form is canonical: Reanimated `{mass: 1, stiffness, damping}`. The duration form is COMPUTED by emulating Reanimated 4's solver and is valid only for a start from rest; prefer the physics form.

| Token | Apple (duration, bounce) | Reanimated physics | Reanimated duration form | Overshoot | Settle | Use |
|---|---|---|---|---|---|---|
| `press` | 0.16 s, 0 | `{1, 1542, 78.5}` | `{210, 1.0}` | 0 | ~280 ms | press scale in/out, tiny state nudges |
| `snap` | 0.30 s, 0.12 | `{1, 439, 36.9}` | `{445, 0.88}` | 0.3 % | ~450 ms | chips, toggles, selection/tab indicator, badges, small spatial |
| `settle` | 0.42 s, 0 | `{1, 224, 29.9}` | `{551, 1.0}` | 0 | ~640 ms | **default spatial**: layout reflow, inserts, programmatic sheet moves, drains |
| `travel` | 0.50 s, 0 | `{1, 158, 25.1}` | `{656, 1.0}` | 0 | ~750 ms | large surfaces: disc → stage, card → detail fallback, full-height sheet |
| `fling` | 0.40 s, 0.20 | `{1, 247, 25.1}` | `{651, 0.80}` | 1.5 % | ~590 ms | any **release after a gesture with momentum**: pass `velocity` (WWDC18 80 % damping; M3 expressive default) |
| `pop` | 0.45 s, 0.30 | `{1, 195, 19.5}` | `{834, 0.70}` | 4.6 % | ~770 ms | playful confirmations: heart, reaction landing, match faces meeting |
| `celebrate` | 0.60 s, 0.35 | `{1, 110, 13.6}` | `{1195, 0.65}` | 6.8 % | ~1.04 s | once-per-session peaks only (the match headline, the check-in pass reveal) |

**Migration:** `gentle` → `settle` (drains) or `pop` (match faces). `snappy` → `fling` (spring-backs) or `snap` (face-in). HeartPop → `pop`, or keep a dedicated heart spring with bounce ≤ 0.4. The room `LinearTransition` → `.springify().mass(1).stiffness(224).damping(29.9)`.

**Easings** (cubic-bezier). Use these for timing-based effects and fallbacks:

| Token | Curve | Use |
|---|---|---|
| `standard` | (0.2, 0, 0, 1) | keep. On-screen moves when timing is used. Equals M3 standard/emphasized. |
| `entrance` | (0.16, 1, 0.3, 1) | keep. Enters. |
| `exit` | (0.4, 0, 1, 1) | keep. Exits; similar to M3 standard-accelerate (0.3, 0, 1, 1). |
| `gentle` | (0.33, 1, 0.68, 1) | keep. Soft fades. |
| `snapOut` | (0.23, 1, 0.32, 1) | **codify**. Press release, popIn, throw; Telegram's send horizontal axis. |
| `sheet` | (0.32, 0.72, 0, 1) | **codify**. Timed sheet rise and fall. |
| `linear` | — | progress only (the hold fill: "its speed *is* the information") and ambient loops (`ease-in-out` alternate). |

**Staggers:** keep 18 / 28 / 40 ms. **Rule:** the stagger window is at most 200 ms. Items after about the 8th enter together. No stagger on pagination or on anything entering during scroll.

**Effects rule:** opacity, colour, blur and glass style use timing (`quick` or `base` + `standard`) or a ζ = 1 spring, and never overshoot (M3). Glass fades use `glassEffectStyle.animate`, never `opacity` (expo-glass-effect).

### 4.2 Ambient budget

**Allowed to move while idle:**
1. The orbs.
2. The typing indicator, only while someone is typing.
3. Countdown text, which updates once a minute and doesn't animate.

Nothing else loops. There is no breathing glow, no shimmer on loaded content, and no pulsing LIVE dot; Blendn's own rule keeps the dot still.

**Orbs:**
- Two pre-rendered radial blobs: an SVG `radialGradient` or a bitmap, not a live blur.
- One instance at the root, under the tabs.
- Animate `translate` (±24 pt) and `scale` (0.96–1.04) only, through a Reanimated CSS keyframe animation with `alternate` and `ease-in-out`.
- Periods of 28 s and 36 s, so the pattern never visibly repeats.

**Pause the orbs (render them static):**
- when the screen is unfocused or the app is backgrounded
- in Low Power Mode or Power Saver (`useLowPowerMode`)
- under Reduce Motion
- with the keyboard open, and in chat and DM screens
- **during active scroll on glass-heavy screens** (the Energy Guide's "opacity over changing content")

**Respond only at peaks.** The match moment and check-in success may raise orb opacity once (`slow effects`, about 600 ms) and settle back. That is the one time orbs "react".

### 4.3 Choreography per transition

Format: **Sequence** (t in ms) · **Tokens** · **Haptic** (from §2.2) · **Reduce Motion** · **Notes/feasibility**.

**1. App launch → first screen**

- **Sequence:**
  - The native splash is a solid page colour with no logo, per the HIG: "nearly identical to the first screen… avoid… logos". `expo-splash-screen` fades it out with `setOptions({ fade: true, duration: 200 })` ([doc](https://docs.expo.dev/versions/latest/sdk/splash-screen/)).
  - t 0: orbs are already at rest, with no entrance. The glass tab bar is present.
  - Pulse content is cached or a skeleton at t 0. The first 6 cards fade in and rise 8 pt over `base`/`entrance`, with a 28 ms stagger.
- **Haptic:** none.
- **Reduce Motion:** fade only.
- **Notes:** the existing 2.4 s IntroAnimation should run **once, on first launch or signed-out only**. Today it runs for signed-in users and flies to the sign-in lockup over the Pulse (audit §6.6).

**2. Tab switch**

- **Sequence:**
  - The icon fill state swaps at t 0 (still-frame legible).
  - The glass selection indicator slides under the icons on `snap`.
  - Content crossfades over `quick` with opacity only. Tabs are peers, so nothing translates.
  - Each tab keeps its scroll position.
- **Haptic:** none (row 3).
- **Reduce Motion:** the indicator jumps; the crossfade stays (fades are the RM substitute).
- **Notes:** stay on the JS tab bar because of the disc.

**3. Push / pop**

- **Sequence:**
  - Use the native-stack platform transition (iOS slide and edge-swipe; Android default). It is interruptible for free; "push converts to pop".
  - The destination's primary block is present at t 0. Secondary blocks fade in over `base` +60 ms.
- **Haptic:** none.
- **Reduce Motion:** the system handles it, including iOS "Prefer Cross-Fade Transitions" (`prefersCrossFadeTransitions`).
- **Notes:** don't reimplement stack transitions in JS.

**4. Event card → event detail**

- **iOS 18+:**
  - `Link.AppleZoom` on the card image, with `Link.AppleZoomTarget` on the detail hero. Hide headers on both screens and use a floating glass back button instead.
  - Press: the card scales to 0.97 on `press`, then the system zoom runs (continuously interactive). Detail text fades in over `base` once the hero settles.
- **Fallback (iOS < 18, Android):**
  - Card press scale, then a native push.
  - The detail hero uses the *same cached `expo-image` URI* so it never flashes blank. Title and meta rise 8 pt and fade in over `base`/`entrance`.
- **Haptic:** none.
- **Reduce Motion:** default push or crossfade. Whether the zoom transition self-disables under Reduce Motion is UNVERIFIED, so gate it on `isReduceMotionEnabled`.
- **Notes:** zoom is alpha with about 1 s latency on rapid reopen (expo#42797), so ship it behind a flag. **Do not** use Reanimated SET.

**5. Sheet present / dismiss with detents**

- **Native:** prefer `presentation: 'formSheet'`, `sheetAllowedDetents: [0.5, 1]`, `sheetGrabberVisible`. This gives system glass and system interaction. Android allows at most 3 detents and no header inside.
- **Custom glass sheet** (PersonCard, ConnectSheet):
  - **Present:** translateY from its own height to the detent on `travel`. The scrim fades 0 → 1 over `base`.
  - **Drag:** 1:1 with the finger, rubber-banding above the top detent.
  - **Release:** project with the velocity and a 0.998 decay. Choose the nearest detent. `fling` with `velocity`.
  - **Dismiss:** past 30 % of height or 800 pt/s (today's thresholds), on `fling` with velocity. The scrim fades over `quick`.
  - **Material by detent:** as the sheet approaches full height, interpolate glass → more opaque, mirroring iOS 26's "becoming more opaque and gently growing".
- **Haptic:** row 23 (Light on settling at a different detent after a drag).
- **Reduce Motion:** a 200 ms fade; dragging still tracks the finger (the HIG allows "tracking animations directly with people's gestures").

**6. Modal** (full-screen overlay: the match container, the rules tray)

- **Sequence:**
  - The scrim fades in over `base`.
  - The content block rises 24 pt and fades in on `settle`.
  - Exit is a `quick` fade plus an 8 pt drop with `exit`.
  - The modal is dismissible at any time: tap the scrim or drag.
- **Haptic:** per content.
- **Reduce Motion:** fade only.

**7. Check-in success** (Blend'n hold → Room)

- **Sequence:**
  - t 0: the hold fill completes (linear 900 ms) with a commit haptic (row 15). The pill shows busy: the spinner replaces the icon and the label stays.
  - On server OK (t₁):
    - Success haptic (row 14).
    - The pill's content crossfades over `base` to a check glyph, which scales 0.9 → 1 on `pop`.
    - ConfettiBurst fires from the pill (existing 2200 ms, 72 pieces).
    - Orbs lift once.
  - t₁ + 700 (`CONFETTI_PEAK`): the stage switches Tonight → Room. The room hero enters on `travel` and secondary sections stagger in at 28 ms.
  - The centre disc → live: its fill state swaps, then a single `snap` scale of 1 → 1.06 → 1.
- **Server refusal:**
  - Error haptic (row 19).
  - The pill **drains on `settle`**, not today's bouncy `gentle`.
  - Then the refusal tray.
- **Reduce Motion:** no confetti, no scale; 200 ms crossfades; haptics unchanged.
- **Notes:** fixes the double Success (§1.6). Also unify the three check-in "doors" (audit §5) onto this one sequence.

**8. Match moment** (budget `moment`, about 1000 ms, interruptible)

- **Sequence:**
  - t 0: the scrim fades in over `base`. Orbs behind the stage lift once.
  - Faces slide in from ±120 pt on `pop` (was `gentle`) and meet at about 450 ms.
  - Hearts at t 260 / 350 / 440 (90 ms stagger): three arcs, 560 ms each, on `(0.33, 0, 0.2, 1)` (keep).
  - t ≈ 1000, landing: their face bumps to 1.08 over 110 ms, then returns on `snap`. **The lub-dub haptic fires on this frame** (row 13).
  - Text block fades in at delay 420, over `base`.
  - "Say hi" enters at about 1100 over `base`/`entrance`. It is tappable as soon as it is visible.
  - A tap on the scrim at any time skips to the end state.
- **Reduce Motion:** faces are placed at the end positions, no hearts, an immediate haptic, a 200 ms text fade (as today).
- **Notes:** this is the one place a gradient and the orbs are "earned" (audit §6.3).

**9. Message send** (bubble from composer)

- **Sequence:**
  - t 0: the composer clears, the haptic fires (row 16), and the new bubble mounts at its list slot.
  - A custom `entering` worklet starts the bubble at the composer field's global rect (`targetGlobalOriginX/Y` minus the measured composer rect). It animates to 0 over **300 ms on split axes**: vertical `(0.2, 0.01, 0.28, 0.91)` and horizontal `snapOut (0.23, 1, 0.32, 1)`. This is Telegram's recipe ([ChatMessageTransitionNode.swift](https://github.com/TelegramMessenger/Telegram-iOS/blob/master/submodules/TelegramUI/Sources/ChatMessageTransitionNode.swift): 0.3 s, separate x/y curves, so it travels on a slight arc).
  - The bubble's fill crossfades from the composer field colour to the bubble colour over `quick`.
  - The list above shifts on `settle`.
- **Failure:** the bubble shows "Not sent" (still-frame) plus row 19 plus the shake (#17).
- **Reduce Motion:** the bubble fades in place over `quick`.

**10. New message arrives**

- **At bottom:** the bubble rises 12 pt and fades in over `base`/`entrance`; the list reflows on `settle`.
- **Scrolled up:** no list motion. A glass "New messages ↓" pill appears on `snap`, with scale 0.9 → 1 and a fade.
- **Bursts:** coalesce, with an 18 ms stagger inside a 200 ms window.
- **Haptic:** none (row 17).
- **Reduce Motion:** opacity only.

**11. Typing indicator**

- **Sequence:**
  - Three dots. Each runs opacity 0.35 → 1 → 0.35 and translateY 0 → −2 → 0 on a 1200 ms cycle, with a 160 ms phase offset. This is a Reanimated CSS keyframe loop, off the JS thread.
  - It appears over `base` and disappears over `quick`.
  - It runs only while someone is typing.
- **Reduce Motion:** a static "typing…" label.
- **Notes:** the values are a PROPOSAL; no platform spec was found.

**12. Like**

- **Sequence:**
  - On double-tap, the HeartPop runs at the touch point: scale 0.4 → 1 on `pop` (was bounce 0.68), hold 260 ms, fade over `quick`.
  - On a Like button, the glyph fill swaps at t 0, plus `pop` scale 0.85 → 1.
- **Haptic:** row 12.
- **Reduce Motion:** fade 180 / hold 300 / fade 180 (existing).
- **Notes:** a like that is already liked shows no pop and no haptic.

**13. List item enter**

- **First load:** fade plus an 8 pt rise over `base`/`entrance`, with a 28 ms stagger, 8 items or 200 ms at most.
- **Pagination and scroll-time inserts:** no entrance; `quick` opacity at most.
- **Removal:** a `quick` fade, then `LinearTransition` on `settle` (single-column FlatList only).
- **Reduce Motion:** opacity only.

**14. Skeleton → content**

- **Sequence:**
  - Skeletons match the final geometry exactly, so nothing jumps.
  - Don't show a skeleton at all for waits under about 300 ms (PROPOSAL, UNVERIFIED heuristic).
  - For longer waits, the skeleton pulses opacity 0.5 ↔ 0.8 on a 1400 ms period (CSS loop). There is no shimmer sweep.
  - Content replaces it with a `base` crossfade.
- **Reduce Motion:** a static skeleton.

**15. Pull-to-refresh**

- **Sequence:** native `RefreshControl` with a brand tint. If it is custom, the indicator tracks at 0.5× resistance, arms at a threshold (haptic row 8), and holds while loading. On completion it returns on `settle`.
- **Reduce Motion:** unchanged (direct manipulation).

**16. Toast**

- **Sequence:**
  - A glass pill enters with translateY −16 → 0 and a fade on `snap`.
  - It dwells for 3–4 s. Toasts never carry the only copy of required information or an action (HIG: minimise time-boxed UI).
  - It exits with a `quick` fade and an 8 pt drift on `exit`.
  - Swipe dismisses it, on `fling`.
- **Haptic:** none (row 27).
- **Reduce Motion:** fade.

**17. Error shake**

- **Sequence:** translateX keyframes 0, −8, 8, −6, 6, −3, 0 over `medium` (320 ms). The field's error text and border appear at t 0 (still-frame). The haptic fires at t 0 (row 19).
- **Reduce Motion:** no shake; text, border and haptic only.
- **Notes:** the values are a PROPOSAL.

**18. Ambient backdrop orbs**

- **Sequence:** see §4.2.
- **Reduce Motion:** static. **Reduce Transparency:** no glass, and the orbs stay static.
- **Notes:** one root instance; transforms only; paused off-focus and in Low Power Mode.

**19. Centre button: idle → available → live**

| State | At rest (still-frame truth) | Enter transition | Haptic |
|---|---|---|---|
| **idle** | outline mark on a glass disc | from live: fill crossfade over `base` | none |
| **available** (check-in possible) | **gradient-filled mark + dot**; optional *static* glow ring | fill crossfade over `base`, plus **one** `snap` scale 1 → 1.06 → 1; no loop | **none** (row 5) |
| **live** (checked in) | live fill + still dot (no pulse) | via the check-in choreography (#7) | rides #7 |
| **press** | — | `press` scale to 0.92; glass "illuminates" (a brightness overlay over `quick`) | row 4 (Medium) |
| **open stage** | — | the disc morphs to the full-screen stage on `travel`. Drag-to-close tracks the finger and closes past 140 pt or 900 pt/s (existing) on `fling` with velocity | none |

- **Reduce Motion:** crossfades only (200 ms), no scale pulse, the stage fades (existing).

### Implication for Blendn (§4)

This is a seven-spring, seven-duration, six-curve system that maps onto both Apple's and M3's families.

Two rules are hard:
- Only the orbs move while idle.
- Effects never bounce.

Every transition has a still-frame end state, a Reduce Motion substitute, and at most one haptic.

**The engineering work, in order:**
1. Re-base `MOTION_SPRING` and fix the mass-4 layout spring.
2. Add `lib/haptics.ts` with Android ladders, plus the expo-haptics threshold patch.
3. Move check-in Success to the server response and fix the double wave haptic.
4. Add the send, like and reaction haptics.
5. Upgrade to Reanimated 4.6.x for `:active`.
6. Pilot `Link.AppleZoom` on iOS 18+ behind a flag.
7. Optionally add Pulsar for the match and hold ramp.
