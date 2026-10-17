# Blend'n client: entry system and design foundations audit

For the Claude Design redesign brief: glass on the floating control and navigation layer, solid content cards, ambient orange/violet orbs behind everything, the brand gradient used only on the Blend'n mark and the one primary action, outlined icons, Satoshi type, and richer motion and haptics.

- **Source:** `the client repo (a clean origin/dev worktree)`, a clean worktree of client `origin/dev` at `54481d2` ("feat(board): turn the board on (step 6c) (#362)").
- **Method:** read-only. I read every file named in scope in full, plus the files they depend on: `lib/onboarding.ts`, `lib/useOnboarding.ts`, `lib/dating.ts`, `components/ActionTray.tsx`, `components/motion/ScalePress.tsx`, `app/_layout.tsx`, `app/index.tsx`, `components/friends/*`, `lib/support.ts`, `lib/links.ts` and the native config. I did not run the app.
- **Paths:** all `path:line` references are relative to the client repo root.

---

## 0. Headline findings for the brief

1. **The current system forbids, in code, most of what the redesign asks for.** The rules live in `scripts/check-design-tokens.js` and run on every `npm test`:
   - `<BlurView` is a test failure (`check-design-tokens.js:93-96`).
   - Any `shadow*` is a failure (`:88-91`).
   - Raw hex and `rgba()` colours are failures (`:68-71`). That rules out gradient stop literals and orb colours.
   - `pulsePalette.test.ts:81-85` fails if `app/_layout.tsx` contains `BackgroundGradient`. That blocks a root-level orb backdrop.
   - `docs/DESIGN_SYSTEM.md` ("Surfaces are flat") and `tasks/lessons.md:16` say the same in prose. The lessons entry is a recorded owner ruling: "No glows, blooms or glass stacks… rejected the frosted-glass CTA with an orange bloom… as 'very AI generated'". **The new direction reverses that ruling, and the owner should confirm it explicitly in the brief.**
2. **Every screen sits on an opaque `EMBER.bg`.** That applies at three levels:
   - the root Stack `contentStyle` (`app/_layout.tsx:520`);
   - the onboarding Stack `contentStyle` (`app/onboarding/_layout.tsx:33`);
   - the `OnboardingScreen` root (`components/onboarding/OnboardingScreen.tsx:265`) and its opaque footer (`:311`).

   Orbs drawn once at the root would be hidden. Either the orbs move into a per-screen backdrop component, or those `contentStyle`s go transparent. sign-in, forgot-password and Settings are already `transparent` (`sign-in.tsx:442`, `forgot-password.tsx:273`, `settings.tsx:656`). About and Support paint `EMBER.bg` (`about.tsx:66`, `support.tsx:75`).
3. **The accent is not the brand orange.**
   - `EMBER.accent` is `#FF906D`, the warm end of an old Figma gradient (`theme.ts:149-154`).
   - The brand gradient sampled from the logo assets runs `#EF5524 → #C05965 → #915CA6` (adaptive icon background, diagonal). The monogram stroke runs `#EF4B18 → #9869AD`.
   - `EMBER.violet` is `#F79EFF`, a pink-lilac, not the brand violet (about `#8E4BAA`).
   - There are three near-identical oranges in config: `#F05524` (app.json), `#F15524` (android `colors.xml`) and `#F05423` (the brief).
4. **Gradient CTA contrast.**
   - White on `#F05423` is **3.50:1**, which fails AA for 16pt text.
   - White on `#8E4BAA` is 5.62:1.
   - The current dark-on-accent text (`#5B1600`) on `#F05423` is only 3.85:1.
   - `themeContrast.test.ts:46-49` pins "dark text on the accent, which white would fail".

   The gradient primary needs a contrast decision. Options: white on a gradient biased to the violet end, a darker ink, or a text-on-scrim treatment. Whichever is chosen, the test has to be rewritten to match.
5. **Haptics are almost absent in scope.**
   - Only `app/onboarding/ready.tsx:32,36` fires one (success or error on finishing).
   - `EmberButton`, `EmberChip`, the toggles, the segmented control, the steppers and every onboarding transition have none.
   - `ScalePress` (scale-on-press plus a selection haptic) is used on About, Support and Settings with `haptic={false}` every time (`about.tsx:46`, `support.tsx:55`, `settings.tsx:501,552`).
   - `useInteractionFeedback` (`lib/useInteractionFeedback.ts`) exists but is used in only 3 places app-wide, none in scope.
6. **Motion in scope is limited to five things:**
   - the sign-in segment thumb slide, 200ms (`sign-in.tsx:121-128`);
   - the onboarding progress fill (`OnboardingScreen.tsx:122-131`);
   - the media tile reflow and fade-out (`media.tsx:194-197,286-287`);
   - the Toast drop-in (`Toast.tsx:80-106`);
   - the ActionTray rise and drag (`ActionTray.tsx:92-128`).

   None of the screens has a staggered entrance. Steps push in with the native stack only, and chips, buttons and toggles have no motion.
7. **Icons: Ionicons (86 distinct glyphs) dominates.**
   - Ionicons: 146 JSX uses in 66 files.
   - MaterialIcons: 9 uses. These are the filled Material set, used for scene amenities and a few glyphs; the amenity names come from the server.
   - AntDesign: 1 use, the Google "G" on the entry screen.
   - Of the 86 Ionicons glyphs, **36 are not `-outline`**. 13 of those are line glyphs where the name is the only difference; 23 are genuinely filled.
   - The design system itself prescribes filled glyphs for "saved/liked" and for active tabs, which conflicts with outline-only. Full list in §B9.
8. **Type migration (Satoshi):**
   - `lib/fonts.ts` loads Plus Jakarta Sans 700/800 and Manrope 400/600/700 from `@expo-google-fonts`. Satoshi is not a Google font, so it has to be bundled locally (there is no `assets/fonts/` today).
   - `fonts.test.ts` demands an exact two-way match between loaded families and `TYPE` families.
   - Weight comes from the family name, never `fontWeight` (Android ignores `fontWeight` on custom fonts). The lint bans `fontWeight` too.
   - Two labels on the entry screen use `fontSize: 21, fontWeight: '500'` with no family, so they render in the system font (`app/index.tsx:481,509`).
9. **Documentation has drifted from the code in `docs/ONBOARDING.md`.**
   - It says the bio limit is 300. The code says 500 (`details.tsx:52`).
   - It says journey's secondary reads "Save as Draft". The code says "Skip" (`journey.tsx:99-104`, SCRUM-185).
   - It gives the basics curation copy as "CURATION PHASE…". The code says "NEXT / A few quick questions…" (`basics.tsx:297-298`).
   - **It says the orientation switch's on-screen label says who can see it. The visible label is still "Show on profile" (`preferences.tsx:210`).** The audience sentence ("Only people you match or talk with will see it. Never a room.") exists only as an `accessibilityHint` (`:211`), so sighted users never see it.

   The redesign should make that last sentence visible.
10. **Three of the five "Looking for" photos have baked-in UI chrome.** `looking-dating.jpg`, `looking-friendship.jpg` and `looking-networking.jpg` contain window bars and text such as "Preferences" in the image itself. A 40% dim and a scrim hide this today. Replace them in the redesign.
11. **Small defects worth folding in:**
    - `assets/onboarding/curation.png` (362 KB, the art on the *first* onboarding screen) is missing from the splash prefetch list (`lib/onboardingAssets.ts`), so it pops in.
    - `assets/images/icon.png` is the Expo template's light-grey keyline grid. It is still the image placeholder in `PhotoManager.tsx:342` and is preloaded at launch (`_layout.tsx:74`).
    - The Android native splash background is `#000000` (`android/app/src/main/res/values{,-night}/colors.xml`), while app.json says `#0F0E0E`. The `android/` folder is committed, so the app.json values only apply on prebuild.
    - On the post-onboarding "Bring your friends" screen, a failed invite load disables the CTA with no retry, although `useFriendInvite().reload` exists (`friends.tsx:56`).
12. **No preview harness covers the entry system.** `app/preview/*` covers the Pulse, Scene, Banter, chat, profile, room, Tonight, confetti and perf, but not sign-in, onboarding or Settings. For Claude Design fixtures, the onboarding screens need a fixture harness, or a `useOnboarding` mock that stays signed out.

---

## A. Screens

### A0. How the entry system connects

```
native splash (#0F0E0E, monogram-gradient 118pt)  → splash fades 200ms (_layout.tsx:71)
  → IntroAnimation overlay (intro.webp, 180ms black + 1890ms draw + hold, 260ms fade; tap to skip)
  → app/index.tsx  (out of scope: lockup-hero, tagline, Google / Apple / "Continue with email", LegalLine)
       └─ push /sign-in  (?notice)            ── back → index
             └─ push /forgot-password (?email) ── back → sign-in
       on auth success the ROOT GUARD routes (screens never navigate on success):
         resumeStep() → replace /onboarding/<step>   or   replace /(tabs)/events (fade)
/onboarding stack: basics → notifications → location → preferences → journey → details → media → ready
   push forward, back() or replace backward (useOnboarding.goBack), swipe within flow on,
   swipe OUT of the flow off (_layout.tsx:575)
   ready ── finish() ok → replace /onboarding/friends ── replace /(tabs)/events
Me tab (profile.tsx:599) → push /settings → push /about | /support | /blocked-users | external URLs
```

Progress is `round((index+1)/8 × 100)` (`lib/onboarding.ts:104-110`):

| Step | basics | notifications | location | preferences | journey | details | media | ready | friends |
|---|---|---|---|---|---|---|---|---|---|
| Progress | 13% | 25% | 38% | 50% | 63% | 75% | 88% | 100% | no bar |

Routing has one owner, the effect in `app/_layout.tsx:177-420`. The guard treats `/`, `/sign-in`, `/forgot-password` and `/preview/*` (preview only in `__DEV__`) as signed-out routes (`:234-239`).

Push permission is never asked during onboarding except by its own step. Push starts 2s after reaching the app, and only if the user did not decline (`:385-405`).

### A1. Shared onboarding frame: `components/onboarding/OnboardingScreen.tsx`

All nine onboarding screens use this frame. Its anatomy, top to bottom:

- **Header** (`:135-173`). A row with gap 16 and padding `insets.top + 12`, GUTTER sides and 24 bottom. It holds:
  - the back chevron (`chevron-back`, 24, `textPrimary`). When there is no `onBack`, a same-size empty view keeps the footprint (`:146-158`);
  - a progress track, 6pt tall (a literal, `:281`), `surfaceSunken`, pill. The fill is `textPrimary`;
  - a `{percent}%` label in `TYPE.label`.
- **Scroll body** (`:184-218`) inside a `KeyboardAvoidingView` (`padding`, offset 0).
  - Headline block: `TYPE.display` title, with `titleAccent` as a nested span that is the *same* `textPrimary` (`:301`), so the "accent" word is not visually accented. A `TYPE.body` subtitle in `textSecondary` follows, with `maxWidth: 300` (a design-exception, `:302-303`). The block has 32 bottom margin.
  - Body gap 32.
  - `keyboardDismissMode` is interactive on iOS and on-drag on Android.
  - `alwaysBounceVertical=false`; `scrollEnabled={!!children}`.
- **Pinned footer** (`:226-258`). Opaque `EMBER.bg`, 16 top padding, 12 gap, bottom `max(insets.bottom, 16)`. It holds:
  - `EmberButton` (the primary);
  - an optional secondary text button: `TYPE.body` in `textSecondary`, centred, 48 minimum height, disabled while busy;
  - an optional `footerNote`: a filled `lock-closed` icon (16, `textTertiary`) and the note UPPERCASED in `TYPE.label` `textTertiary`.

Motion and haptics:

- The progress fill animates from the previous step's width, held in a module variable (`:90`). It waits 200ms, then runs `withTiming` for 300ms with `bezier(0.23,1,0.32,1)` (`:122-131`). With Reduce Motion it is static.
- The secondary and back buttons dim to `OPACITY.pressed` when pressed.
- There are no haptics.

Glass mapping:

- **Header becomes a floating glass bar.** It holds back, progress and percent.
- **Footer becomes a glass dock.** It holds the gradient CTA and the text secondary. The "opaque so scrolled text never shows through" rationale (`:310-311`) is exactly what a frosted dock replaces.
- **Body:** the solid cards and controls sit on top of the orbs.

---

### `/sign-in`: Sign in / Create account

- **Files:** `app/sign-in.tsx`. It renders `SafeAreaView`, `KeyboardAvoidingView`, `ScrollView`, `PendingInvite`, `EmberButton` and `LegalLine`.
- **Job:** email sign-in and account creation on one screen. The logic is final and the layout is provisional (`:47-56`; `docs/PLACEHOLDER_SCREENS.md` §0).
- **Entry:**
  - From `app/index.tsx` "Continue with email" (`index.tsx:383-385`), with an optional `notice` param (session ended).
  - Root stack transition: `ios_from_right` / `slide_from_right` (`_layout.tsx:535-541`).
- **Exit:**
  - Back (`router.back()`, `:216-224`).
  - "Forgot your password?" pushes `/forgot-password` with the typed email (`:412-427`).
  - On success the root guard routes to onboarding or the events tab. The screen itself never navigates (`:70-72`, `:193-195`).
- **Primary action:** `EmberButton` labelled "Sign in" or "Create account" (`:405-410`).

**Content, top to bottom:**

1. Back chevron.
2. `lockup-hero.png` at 40pt high, centred, hidden from accessibility (`:232-238`, `LOCKUP_HEIGHT` `:42`).
3. `PendingInvite`: "Sign in to accept {name}'s invite" with a 32pt avatar, or a dead-link line.
4. Session notice in `meta`, centred.
5. Segmented control [Sign in | Create account].
6. Create-account mode only: the NAME field.
7. EMAIL field.
8. PASSWORD field with a show/hide eye.
9. Create-account mode only: the AGE field.
10. Error line.
11. Primary button.
12. Sign-in mode only: "FORGOT YOUR PASSWORD?". Create-account mode only: `LegalLine` "By creating an account you agree to our Terms and Privacy Policy."

**Interactive elements:**

| Element | Behaviour |
|---|---|
| Back | Pops the screen. Has `hitSlop` 12 and no pressed feedback. |
| Segment tabs | Calls `switchMode` and clears the error (`:131-137`). Disabled while busy. `accessibilityRole` is `tablist` / `tab`. |
| Name | `autoComplete="name"`, `autoCorrect` off, `maxLength` 100. "Next" moves to email. |
| Email | `email-address` keyboard. "Next" moves to password. |
| Password | `secureTextEntry` toggled by the eye button (`eye-outline` / `eye-off-outline`, 20). Autocomplete is `new-password` / `newPassword` in create mode and `current-password` / `password` in sign-in mode (`:349-356`); keep that. "Go" submits in sign-in mode; "Next" moves to age in create mode. |
| Age | Number pad; non-digits are stripped; `maxLength` 3; "Go" submits. |
| Primary | Calls `submit` (`:153-203`). An `inFlight` ref guards against a double submit from keyboard "Go" plus the button (`:105`). |
| Forgot link | `TYPE.label`, `textPrimary`. No pressed feedback. |
| Legal links | Nested `Text` `onPress` opening the Terms and Privacy URLs. |

**Haptics and animation:**

- The selected segment's thumb is one absolute view translated with `withTiming` over 200ms using `Easing.bezier(0.77,0,0.175,1)` (`:121-128`, `:439`). With Reduce Motion it snaps.
- No haptics anywhere. A `pressed` style is defined but never used (`:491`).

**States:**

| State | What happens |
|---|---|
| Validation | One error line, in order: invalid email; name required; age (`accountAgeError`, required: "Enter your age. Blend'n is for people 18 and over.", or the under-18 or out-of-range sentence); password required; under 12 characters on sign-up: "Use at least 12 characters. Length beats symbols." (`:139-151`). |
| Server error | The server's own message is shown verbatim (`:183-191`). |
| Network or exception | "Something went wrong. Please try again." (`:196-198`). |
| Busy | The primary shows a spinner; the segments are disabled. |
| Offline | Same as the exception path. There is no offline banner. |
| Notice | Shown only when there is no error (`:242-246`). |

**Data:** email (trimmed and lowercased), password, name and age, plus `deviceInfo` (platform, device name, app version). These go to `signUp` or `signInWithEmail` in `lib/useAuth.ts`, which call `/auth/signup` and `/auth/signin`.

**Product rules to keep:**

- **18+.** The age field is required on sign-up and refused below 18. The server agrees (`:171-177`, `:380`; `lib/onboarding.ts:381-430`, `ACCOUNT_MIN_AGE` 18 and `ACCOUNT_MAX_AGE` 120, `ADULTS_ONLY` copy `:385`).
- **Password minimum** of 12 mirrors the API (`:76-83`).
- **Errors are inline and persistent, not toasts** (PLACEHOLDER_SCREENS §0).
- **The wordmark is never rendered as text.**
- **The keyboard order is name → email → password → age** (`:282-287`).
- **Legal line is shown on sign-up** (`:429-431`). `__tests__/first-run-journey.test.ts` pins the legal links and the notice and email hand-off.

**Redesign opportunities:**

- **Background and grouping.** The screen is `transparent` over the root `bg` (`:442`), so it is ready for orbs. Put the form in one solid card, or leave the fields loose on the orbs.
- **Segmented control as glass.** Make it a glass pill. It is currently `surfaceSunken` with a `textPrimary` thumb.
- **Pressed and haptic feedback.** Add pressed scale or opacity to back, the link and the segments. Add a `selectionAsync` on segment change and an error notification haptic when validation fails.
- **Inputs.** Fields are pill-shaped (56pt, `surface`, 24pt horizontal padding, `:477-483`). Labels are `TYPE.label` uppercase above the field. Consider focus rings: there is no focus state at all today.
- **The primary** becomes the brand-gradient button. The contrast note in §0.4 applies.
- **Lockup size.** The lockup is 40pt here and 60pt on the entry screen (`index.tsx:62`). Consider a shared-element continuity, so the lockup shrinks on push.
- **Field reveal.** The create-account fields appear and disappear without animation. Add an entering or exiting fade-and-height.

---

### `/forgot-password`: Forgot password / Check your inbox

- **Files:** `app/forgot-password.tsx`. It renders `EmberButton` (primary and secondary) and `useToast`.
- **Job:** request a reset link without revealing whether the account exists (`:41-52`).
- **Entry:** pushed from sign-in, with `email` prefilled when one was typed (`sign-in.tsx:415-420`).
- **Exit:**
  - Back.
  - The link in the email opens the **web** reset page in a browser (`:54-60`). Completing a reset signs out every device.
- **Primary action:**
  - Form state: "Send reset link".
  - Sent state: "Open mail app".

**Content, top to bottom:**

- **Form state** (`:224-265`):
  1. Back chevron.
  2. `lockup-hero` at 40pt.
  3. "Forgot your password?" (`TYPE.title`).
  4. Body copy (`textSecondary`).
  5. EMAIL field (`autoFocus` when empty).
  6. Error line.
  7. Primary button.
- **Sent state** (`:179-223`):
  1. A 56pt `surface` circle well with `mail-outline` (24).
  2. "Check your inbox".
  3. "If **{address}** has an account, a reset link is on its way. It opens in your browser and expires in an hour."
  4. Error line.
  5. "Open mail app" (primary).
  6. "Resend link" / "Resend in {n}s" (secondary `surface` pill, disabled during the cooldown).
  7. "USE A DIFFERENT EMAIL" (text action back to the form).

**Interactive elements:**

- Email input: "Go" submits.
- Send button.
- Open mail: tries `message:` (iOS inbox), then `mailto:`, then shows the toast "No mail app found. Open your email to find the link." (`:139-150`).
- Resend: has a 30s cooldown (`RESEND_COOLDOWN_S` `:39`, ticking `:82-86`). On success it shows the toast "Sent again. Give it a minute to arrive." (`:129`).
- Use a different email: returns to the form and clears the error.

**Haptics and animation:** none. The swap between form and sent state is instant.

**States:**

| State | What happens |
|---|---|
| Invalid email | "Enter a valid email address." |
| Rate-limited | `forgotPasswordMessage` → "…reset requests… try again in N minutes" (`lib/signInRefusal.ts:43-46`; pinned by `rate-limited-says-the-wait.test.ts`). |
| Other failure | The server error, or "Couldn't send the reset link. Try again." |
| Busy | Spinner on the button. |
| Cooldown | Secondary label counts down. |

**Data:** the email (trimmed and lowercased) goes to `POST /api/auth/forgot-password`. Nothing is stored locally.

**Product rules to keep:**

- **The confirmation is unconditional.** Never show "no account with that email" (`:44-52`).
- **The reset happens in a browser.**
- **The resend cooldown** stays.

**Redesign opportunities:**

- **State change.** Animate the form-to-sent swap: crossfade, and let the mail well scale in. Fire a success haptic on send.
- **Mail well.** Make it a gradient-ringed or glass orb, matching the orb backdrop.
- **Countdown.** It could be a progress ring on the Resend pill.
- **Layout.** It mirrors sign-in on purpose (`:26-27`), so keep the two together.

---

### `/onboarding/_layout`: the onboarding stack

- **Files:** `app/onboarding/_layout.tsx`.
- **Navigator:** a `Stack` with `headerShown: false` and `gestureEnabled: true`. Animation is `ios_from_right` on iOS and `slide_from_right` on Android. `contentStyle: { backgroundColor: EMBER.bg }` (`:26-35`).
- **Exceptions:** the `friends` screen has `gestureEnabled: false` (`:40`).
- **Root level:** the `onboarding` group itself has `gestureEnabled: false` (`app/_layout.tsx:564-576`), so a swipe cannot drop the user out of the flow onto the sign-up form of an account that now exists.
- **Redesign:** the opaque `contentStyle` hides any root orb layer. Either make it transparent and give `OnboardingScreen` a shared orb backdrop, or draw the orbs inside `OnboardingScreen`.

**Shared state across steps** (`lib/useOnboarding.ts`):

- The draft is saved to AsyncStorage per user id on every keystroke (`:140-149`).
- Only the current step's fields are sent to the server, through `stepPayload` (`lib/onboarding.ts:275-307`).
- A failed server save **stays on the step** and shows an error toast; Continue then acts as the retry (`useOnboarding.ts:218-313`).
- `skip()` records progress and sends nothing (`:322-337`).
- `finish()` re-sends the whole draft plus `onboarded: true`. It is the only writer of `onboarded` (`:351-402`).
- A ref allows only one move in flight at a time (`:112`).

**Resume:** `resumeStep(finishedOnServer, stored, isNewAccount, mayParticipate)` (`lib/onboarding.ts:160-170`).

**Redesign note:** a flow-level transition is possible here. A shared glass header could persist while the bodies slide, but each step is its own route, so the header would need `headerShown` with a custom header, or a layout-level overlay.

---

### `/onboarding/basics`: "The basics" (step 1 of 8, 13%, cannot be skipped)

- **Files:** `app/onboarding/basics.tsx`. It renders `OnboardingScreen`, `EmberField`, `EmberFieldGroup`, `EmberChipRow` and `EmberChip`, an `expo-image` with a `LinearGradient` for the curation card, and an `ActionTray`. It is wrapped in `ScreenProfiler` (`:356-362`).
- **Job:** collect name, gender and date of birth. The birth date is the age gate for everything downstream (`:31-37`).
- **Entry:** the root guard replaces to this step for a new account, an unfinished stored flow, or a non-participating account. "Edit my details" on Ready jumps here with `replace` (`ready.tsx:59`).
- **Exit:**
  - Continue saves and pushes `/onboarding/notifications`.
  - "Not you? Sign out" opens a confirm tray, then signs out; the guard moves the user to index.
  - There is no back (no `onBack` is passed).
- **Primary action:** "Continue", disabled until there is a name and a valid 18+ date of birth (`canContinue`, `:121-128`; `lib/onboarding.ts:366-369`).

**Content, top to bottom:**

1. Title "The basics". Subtitle "Tell us a bit about yourself. You can change any of it later."
2. **YOUR NAME** field.
   - Placeholder "First and last name".
   - Helper: "In event rooms you go by a made-up name. If you choose to show yours, people there see your full name." (`:157-173`).
   - Prefilled from the draft, else from the account name (`:79-100`).
3. **GENDER IDENTITY** chips: Woman, Man, Non-binary, Prefer not to say (`:50-55`, `:175-188`).
4. **DATE OF BIRTH**, three compact boxes DD / MM / YYYY at flex ratio 1 : 1 : 1.5.
   - Helper: "Your age will be private and used only for verification."
5. Inline errors (live region polite):
   - "Blend'n is for people 18 and over." when the date is under 18;
   - "That is not a date we recognise." when the date is invalid.
6. An inline "SIGN OUT" text action appears beside the under-18 error (`:255-271`).
7. **Curation card** (`:279-300`), decorative and hidden from accessibility:
   - 192pt tall, `EMBER_RADIUS.card`, on `surfaceMedia`;
   - `curation.png` (a copper swirl) at 0.6 opacity, a design-exception (`:344-345`);
   - a `bgClear → bg` gradient over it;
   - the eyebrow "NEXT" and the caption "A few quick questions, then your Pulse is personalised around you."
8. Footer: Continue, then "Not you? Sign out".

**Interactive elements:**

- **Name:** "Next" focuses the day box.
- **Gender chips:** single select. Tapping the selected chip again clears it (`:182-184`).
- **Date boxes:** digits only (`digits()` `:323-325`). They auto-advance:
  - day moves on at 2 digits, or at a single digit above 3;
  - month moves on at 2 digits, or at a single digit above 1 (`:202-224`);
  - "Go" in the year box submits.
- **Sign out (footer or inline):** opens an `ActionTray`.
  - Title "Sign out?". Message "What you've filled in stays on this phone, so you can pick up here when you sign back in."
  - Buttons: Cancel (secondary) and Sign out (primary, with a spinner) (`:302-311`).

**Haptics and animation:**

- `expo-image` fades in over 180ms.
- The tray animates (see ActionTray).
- No haptics.

**States:**

| State | What happens |
|---|---|
| Loading | Fields prefill once storage answers, during that render (`:94-100`). |
| Validation | Continue is disabled. Errors show only once all three date boxes are full. |
| Under 18 | Dead end: error plus the inline sign-out. |
| Save failure | Error toast; the step stays. |
| First run | The name is prefilled from sign-up. |

**Data:** `name`, `gender` (an enum) and `dateOfBirth` (YYYY-MM-DD). Saved to `PUT /api/mobile/profiles/:userId`, plus the local draft.

**Product rules to keep:**

- **18+ via date of birth.** Server-authoritative; the client check is a courtesy (`lib/onboarding.ts:451-462`).
- **Cannot be skipped** (`lib/onboarding.ts:59-63`).
- **"Prefer not to say" stores `prefer_not_to_say`**, labelled as what it stores (`:39-49`).
- **The full name is collected**, and the helper copy is honest about pseudonyms. Pinned by `onboarding-names-copy.test.ts`.
- **A way out exists.** Sign-out is offered on the first step and beside the under-18 message. Pinned by `first-run-journey.test.ts`.

**Redesign opportunities:**

- **The curation card** is the obvious hero slot. Swap the AI copper swirl for the brand orbs or monogram, or remove it, since orbs now carry the atmosphere.
- **Date entry** could become a single segmented field or a wheel. Keep the auto-advance logic.
- **Haptics:** a selection tick on chip select; a warning haptic when the under-18 error appears.
- **Copy weight.** The chips (`textPrimary` fill when selected) work well on glass. The date helper and error stack under each other with similar weight; give the error an icon or tint.

---

### `/onboarding/notifications`: "Never miss a spark." (step 2, 25%, skippable)

- **Files:** `app/onboarding/notifications.tsx`. It renders `OnboardingScreen`, `NotificationIllustration` and `SettingsTray`.
- **Job:** a pre-permission explainer before the one-time OS dialog. The answer is recorded either way (`:11-23`).
- **Entry:** pushed from basics.
- **Exit:** forward to location after an answer. Back goes to basics.
- **Primary action:** "Turn on notifications" (`:91`).

**Content, top to bottom:**

1. Title "Never miss " plus the accent span "a spark.". Subtitle "Know when someone at your event wants to connect, or when a match sends you a message."
2. The illustration card: moon or ember-orb art, with a mock notification bubble "New Spark Nearby / Just now / Someone active is ready to connect!" and a filled `flash` icon (`PermissionIllustration.tsx:50-78`).
3. Footer: CTA, then "Maybe later".

**Interactive elements:**

- **CTA, `ask()`** (`:42-83`):
  - Calls `getPermissionsAsync`. If already granted, it answers granted.
  - If the OS can still ask, it calls `requestPermissionsAsync`.
  - If the OS is blocked, it opens the `SettingsTray` and the step waits.
  - If the permission call throws, it records "not granted" and moves on.
- **"Maybe later":** calls `answer(false)`, which records the decline locally (`markPushDeclined`) and commits `push_enabled: false` (`:35-38`, `:109`).
- **SettingsTray** (when blocked):
  - Title "Turn this on in Settings".
  - Message: the hint "Blend'n uses notifications to know when someone nearby wants to connect." plus "Your phone only asks once…".
  - Buttons: Not now (records false and moves on) and Open Settings (stays on the step).

**Haptics and animation:** none, apart from the image fade and the tray.

**States:**

| State | What happens |
|---|---|
| Asking | CTA busy (`saving \|\| asking`). |
| Granted | Moves forward. |
| Denied in the dialog | Records false and moves forward. |
| Blocked | Shows the tray. |
| Broken | Records false and moves on. |
| Save failure | Toast; stays. |

**Data:**

- `push_enabled` (boolean) goes to the profile.
- A local per-account "declined" flag (`lib/pushDecline.ts`) stops the app-level push start-up from prompting later. Pinned by `push-maybe-later.test.ts`.

**Product rules to keep:**

- **Explain before the OS asks.**
- **"Maybe later" records `false`** and does not leave the `@default(true)` (`:95-108`).
- **Push is never initialised during onboarding** (`_layout.tsx:385-399`).

**Redesign opportunities:**

- **The illustration** is the strongest candidate for a glass treatment. The mock notification bubble *is* a glass banner (it is currently a `surface` pill). Animate it dropping in with a spring and a light impact haptic, previewing the real thing.
- **Remaining filled glyph:** `flash` stays filled.
- **Accent span.** The "a spark." span is not accented (same `textPrimary`). The brief could render title accents with the brand gradient as text, as part of the mark family. Flag it, because the brief limits the gradient to the mark and the CTA.

---

### `/onboarding/location`: "See who's around" (step 3, 38%, skippable)

- **Files:** `app/onboarding/location.tsx`. It renders `OnboardingScreen`, `LocationIllustration` and `SettingsTray`.
- **Job:** a pre-permission explainer for foreground location. Check-in is GPS-validated, so without location an account can browse but never attend (`:9-26`).
- **Entry:** from notifications.
- **Exit:** forward to preferences. Back goes to notifications.
- **Primary action:** "Allow location" (`:78`).

**Content, top to bottom:**

1. Title "See who's around". Subtitle "Blend'n uses your location to show events near you, and to check you in when you arrive at one."
2. The illustration (`PermissionIllustration.tsx:88-142`):
   - a dark map with orange streets at 0.4 opacity;
   - two concentric hairline rings (192 and 288);
   - three stock portrait pins (48, 48 and 40);
   - a 64pt "YOU" avatar with a white ring and a "YOU" tag;
   - a bottom gradient footer with a filled `location` glyph, "CURRENT ZONE: OLD GOA", a hairline, and "Real-time local presence active".
3. Footer: CTA, then "Maybe later", then the footer note with a filled `lock-closed` glyph: "YOUR PRECISE LOCATION IS NEVER SHARED WITH STRANGERS." (`:85`).

**Interactive elements:**

- **CTA:** `getForegroundPermissionsAsync`, then `requestForegroundPermissionsAsync`, then the same blocked and broken branches as notifications. It commits `share_location: granted`.
- **"Maybe later":** commits `share_location: false` (`:84`).
- **Tray:** "Not now" commits false; "Open Settings" behaves as on notifications.

**Haptics and animation:** none.

**States:** asking (busy), granted, denied, blocked (tray), broken, save failure (toast).

**Data:** `share_location` goes to the profile. The OS permission and the profile preference are different things (`:21-25`).

**Product rules to keep:**

- **"Maybe later" records `false`.**
- **The reassurance footer note stays.**
- **Copy says what location is for**, not a warning (`:15-20`).

**Redesign opportunities:**

- **Map illustration.** Replace it with a live, animated radar: pulsing rings with `withRepeat`, honouring Reduce Motion.
- **"Old Goa"** is hard-coded fake data. Use the user's city or a neutral label.
- **Stale comment.** The comment at `PermissionIllustration.tsx:80-87` says the stock portraits were left out, but the code renders them (`:41-45`, `:105-115`). The doc comment is stale. The design should decide whether real-looking strangers belong here.

---

### `/onboarding/preferences`: "Your preferences" (step 4, 50%, skippable)

- **Files:** `app/onboarding/preferences.tsx`. It renders `EmberSection`, `EmberInlineToggle`, `EmberChipRow` (pack) with `EmberChip`, `EmberToggle` and `LookingForCards`.
- **Job:** orientation (up to 3, for dating), the room anonymity default, and "Looking for".
- **Entry:** from location.
- **Exit:** Continue commits and pushes journey; Skip; back goes to location.
- **Primary action:** "Continue". The secondary is "Skip" (`:146-164`).

**Content, top to bottom:**

1. Title "Your " plus the span "preferences". Subtitle "Who you'd like to meet and why you go out. It shapes who you're introduced to."
2. **Orientation** section, hidden entirely for under-18s (`:167-230`).
   - Heading `TYPE.heading`. Caption "Select all that apply to you — up to three."
   - On the right of the heading, the inline pill toggle "Show on profile". It is always mounted and hidden (opacity 0, no pointer events) until an orientation is chosen (`:200-216`).
   - Chips: Straight, Gay, Lesbian, Bisexual, Pansexual, Queer, Asexual, Prefer not to say (`lib/dating.ts:32-59`). Packed to fill rows; "Prefer not to say" is kept last.
3. **Anonymity** section. Caption "You can change this in any room."
   - `EmberToggle` "Stay anonymous at events".
   - Helper: "Join rooms under a made-up name. Off, we'll offer to show your name and photo when you check in." (`:242-249`).
4. **Looking for** section. Caption "What brings you to Blend'n today?"
   - Two-across photo tiles: Dating, Friendship, Networking, Travel, Open. "Dating" is hidden for under-18s.

**Interactive elements:**

- **Orientation chips:** multi-select with a cap of 3 (`MAX_ORIENTATIONS`, `lib/dating.ts:123`).
  - "Prefer not to say" is exclusive in both directions (`toggleOrientation` `:136-152`).
  - Chips past the cap are dimmed to 0.45, not hidden (`orientationDisabled` `:160-166`).
- **Show on profile:** the whole pill is the switch target. The inner `Switch` is scaled to 0.8.
- **Stay anonymous:** the whole row is the target.
- **Looking-for tiles:** toggle on and off. Selected tiles get a 4pt `textPrimary` border.

**Haptics and animation:** none. The chip-select reflow is avoided deliberately (transparent borders keep chips the same width).

**States:**

| State | What happens |
|---|---|
| Prefilled | Once storage has loaded. |
| Under 18 | The orientation section is not rendered and orientations are not sent; Dating is removed from Looking for (`:120-123`, `:149-160`). |
| Save failure | Toast. |

**Data sent:**

- `orientations[]`;
- `show_orientation`, through `orientationConsent`: clearing the last label clears consent (`lib/onboarding.ts:352-357`);
- `looking_for[]`, free text that does not reach matching (`docs/ONBOARDING.md` §3);
- `reveal_by_default = !anonymous`.

**Product rules to keep:**

- **Anonymous is the default.** `anonymousByDefault` is test-pinned (`lib/onboarding.ts:327-329`).
- **The orientation cap, exclusivity and dimming are shared** with Edit profile.
- **Consent rules:**
  - The consent switch appears only once an orientation is chosen.
  - Clearing the last label clears consent.
  - Minors are not asked (SCRUM-200). Pinned by `minor-no-dating-choices.test.tsx` and `onboarding-names-copy.test.ts` ("says the switch offers a reveal at check-in").
- **Who sees orientation:** matches, open conversations and rooms the user revealed in. Never a room roster.

**Redesign opportunities:**

- **This is the densest screen and needs hierarchy.** Three sections stack with the same weight.
- **Make the audience visible.** The "Show on profile" pill has no visible audience text: "Only people you match or talk with will see it. Never a room." is hint-only (`:211`). The docs claim it is visible.
- **Anonymity row as a hero.** It could become a dedicated card with a pseudonym avatar preview (`lib/pseudonymAvatar.ts`), which teaches the concept the comment says this screen must teach (`:232-241`).
- **Haptics:** a selection haptic on chip and tile toggles; a warning haptic or a shake when the user taps a dimmed chip at the cap.
- **Art:** replace the Looking-for photos (§0.10).

---

### `/onboarding/journey`: "Your journey" (step 5, 63%, skippable)

- **Files:** `app/onboarding/journey.tsx`. It renders three `EmberCardSection` cards, `EmberField`, `EmberFieldGroup` and `ListLoadState`, plus `EmberChipRow` (pack, explicit width) with `EmberChip`.
- **Job:** city, job title, field of work (a server bucket) and education. All optional.
- **Entry:** from preferences.
- **Exit:** Continue, Skip or back.
- **Primary action:** "Continue". The secondary is "Skip"; the comment explains why it is not "Save as Draft" (`:99-104`).

**Content, top to bottom:**

1. Title "Your " plus the span "journey". Subtitle "Where you live, what you do and where you studied. All optional."
2. Card 1, `location-outline` icon:
   - Title "Where you live". Caption "Used to show you events nearby".
   - CITY field, placeholder "Search city". It is a plain text input, not a search.
3. Card 2, `briefcase-outline` icon:
   - Title "Occupation". Caption "Your job title and where you work".
   - JOB TITLE field, placeholder "e.g. Product designer".
   - FIELD OF WORK chips from `GET /api/mobile/work-fields`.
   - Helper: "The only part of this shown in a room. Your job title and employer are not." (`:146-167`).
4. Card 3, `school-outline` icon:
   - Title "Education". Caption "Where you studied, if you want to say".
   - SCHOOL / UNIVERSITY field.

**Interactive elements:**

- Three free-text fields. City is `maxLength` 200 and the others are 100.
- Field-of-work chips are single select; tapping again clears.
- `ListLoadState` "TRY AGAIN" re-fetches.

**Haptics and animation:** none.

**States:**

| State | What happens |
|---|---|
| Work fields loading | Spinner. |
| Work fields error | "Couldn't load the fields of work." plus TRY AGAIN (`ListLoadState`). |
| Empty list | Section omitted. |
| Save failure | Toast. |

**Data:** `location`, `occupation`, `education` and `work_field` (slug) go to the profile.

**Product rules to keep:**

- **Work fields come from the server, never hard-coded.**
- **Only `work_field` is shown in rooms.** The job title and employer stay private.
- **No employment-type or class-year fields.** They have no column (`:19-33`).

**Redesign opportunities:**

- **Already the model for the target look.** `EmberCardSection` uses `surfaceMedia`, radius 32, a hairline border, padding 16 and a 48pt badge (`EmberControls.tsx:632-655`). These are the solid content cards; the icon badges could pick up a subtle gradient ring.
- **City field.** It promises "Search city" but does not search. Either wire it to the city list (`lib/city.ts`) or relabel it.

---

### `/onboarding/details`: "The finer details" (step 6, 75%, skippable)

- **Files:** `app/onboarding/details.tsx`. It renders `EmberField` (multiline), prompt cards, `ListLoadState`, and an `EmberFieldGroup` with an `EmberChipRow` per category group.
- **Job:** bio, and interests from the server category tree, which writes both the free-text names and the `user_interests` graph.
- **Entry:** from journey.
- **Exit:** Continue, Skip or back.
- **Primary action:** "Continue" (`:119`).

**Content, top to bottom:**

1. Title "The finer " plus the span "details". Subtitle "A few lines about you and what you're into. It's what people read before they say hello."
2. **ABOUT ME** multiline field.
   - 160pt tall, `EMBER_RADIUS.card`.
   - Placeholder "Ask me about… the best coffee in the city, a trip I'm planning, or what I'm reading."
   - Helper counter `{n}/500`. `BIO_LIMIT` is 500 (`:46-52`).
3. Three **non-interactive** prompt cards (`:24-28`, `:143-149`):
   - "A perfect Sunday for me is…"
   - "Lately I've been learning…"
   - "Ask me about…"

   Each is `surfaceMedia` with a 4pt `textTertiary` left bar and radius 16.
4. Interest load state.
5. One chip group per category: group name uppercase, then packed chips.

**Interactive elements:**

- The bio is hard-capped by slice and `maxLength`.
- Interest chips are multi-select, toggled by name and id together (`:102-109`).
- TRY AGAIN re-fetches.
- **The prompt cards look tappable but do nothing.**

**Haptics and animation:** none.

**States:** categories loading, error with "Couldn't load the interests.", save failure (toast; interests sync before the profile PUT, `useOnboarding.ts:260-266`).

**Data:**

- `bio` and `interests` (names) go to the profile.
- `interestIds` are diffed into `user_interests` (`POST` / `DELETE /api/mobile/profiles/:id/interests`; `syncInterests`, `useOnboarding.ts:34-46`).
- The board needs 2 or more interests.

**Product rules to keep:**

- **One bio cap (500), shared with Edit profile.** Pinned by `onboarding-labels-and-caps.test.ts`.
- **Interests are server categories only.**
- **The graph is written.** Pinned by `onboarding-writes-the-graph.test.ts`.

**Redesign opportunities:**

- **Wire the prompt cards.** Tapping one should insert the prompt into the bio, with a selection haptic; right now they read as dead buttons. Or style them clearly as hints.
- **Interest wall.** It can run very long. Consider collapsible groups, a selected-count summary chip in the glass header, and a staggered chip entrance.
- **Counter warning.** The bio counter could colour-shift near the limit.

---

### `/onboarding/media`: "Add your photos" (step 7, 88%, skippable)

- **Files:** `app/onboarding/media.tsx`. It renders `OnboardingScreen`, an animated `Pressable` tile grid, `OptimizedImage`, `LinearGradient` and `useToast`. It is wrapped in `ScreenProfiler`.
- **Job:** up to 6 photos. `photos[0]` is the main photo and is mirrored to `User.image`, which DMs, conversation lists and the reveal all use (`:43-58`).
- **Entry:** from details.
- **Exit:** Continue, "Skip for now" or back.
- **Primary action:** "Continue" (`:170-173`).

**Content, top to bottom:**

1. Title "Add your " plus the span "photos". Subtitle "Up to six. Recent photos where your face is clear work best."
2. A 2-column grid with a 16 gap (`SLOT` = (width − 48 − 16) / 2).
   - The **main** tile is full width and `SLOT × 1.55` tall, with a 2pt `textPrimary` ring, a scrim, and a "MAIN PHOTO" tag (`textPrimary` pill, `bg` text).
   - Other tiles show a "Make main" scrim pill.
   - Every tile has a 24pt round remove badge (`close`, 16) on `scrim`.
   - One empty slot appears only while fewer than 6 photos exist: a dashed `separator` border with a 48pt `surface` circle holding a hand-drawn plus (`Plus`, two bars, `:80-121`). The empty slot is full-width "main" size when there are 0 photos.
3. A note, by count:
   - 0: "Your main photo is the one people see on your profile and in messages. Add up to 6."
   - 1: "This is your main photo. Add more and you can pick a different one."
   - 2 or more: "Tap any photo to make it your main one. JPG and PNG, up to 6." (`:274-280`).

**Interactive elements:**

- **Empty slot:** calls `selectAndUploadPhoto`. That opens an app sheet "Add a photo" with "Take a photo" and "Choose from library" (`lib/photoUtils.ts:197-201`). Camera-refused branches offer "Choose from photos" and, when blocked, Open Settings.
- **Upload:** validated and uploaded to Tigris through a presigned URL. A spinner shows in the slot.
- **Tap a non-main tile:** makes it main (moves it to the front).
- **Remove badge:** removes the photo locally.

**Haptics and animation:**

- `LinearTransition` 250ms with `bezier(0.77,0,0.175,1)` on reorder and grow; `FadeOut` 160ms on remove (`:194-197`, `:286-287`).
- Reduce Motion: none.
- No haptics.

**States:**

| State | What happens |
|---|---|
| Empty | One large add slot. |
| Uploading | Spinner; other taps disabled. |
| Picker cancelled | Silent. |
| Validation or upload error | Toast with the validator or server words, e.g. "Photo must be less than 5MB" (`:152`). |
| Save failure | Toast. On a successful save, the draft swaps upload URLs for the server's sealed copies (`useOnboarding.ts:59-63`, `:281-283`; SCRUM-491). |

**Data:**

- `photos[]` (URLs) go to the profile.
- The save adds a blurred copy of the main photo (`withBlurForPrimary`, `useOnboarding.ts:270`; SCRUM-478).

**Product rules to keep:**

- **Photos only, no video** (`:36-41`).
- **Six maximum.**
- **Main is chosen by tap**, and removing is a separate target.
- **Main is shown three ways:** size, ring and label.
- **Skippable.** Pinned by `onboarding-media-follows-draft.test.tsx`.

**Redesign opportunities:**

- **Glass chips over photos.** "Make main", "MAIN PHOTO" and the remove badge sit on photos, which is a natural place for small glass chips. They are currently the flat `scrim` at 60%.
- **Haptics:** an impact on make-main and a light tick on remove.
- **Empty slot.** The dashed border is the only dashed style in the app; it could become a glass well with a gradient "+".
- **Upload progress.** A progress shimmer during upload.

---

### `/onboarding/ready`: "You're all set, {name}" (step 8, 100%, cannot be skipped)

- **Files:** `app/onboarding/ready.tsx`. It renders `OnboardingScreen`, a profile preview card with `OptimizedImage`, an interests card and `Summary` rows.
- **Job:** review the profile and write `onboarded: true` (the only writer) through `finish()`.
- **Entry:** from media.
- **Exit:**
  - Success: a success haptic, then `router.replace('/onboarding/friends')`.
  - "Edit my details": `jumpTo('basics')` (a replace, with no history).
  - Back goes to media.
- **Primary action:** "Start Blend'n" (`:55`).

**Content, top to bottom:**

1. Title "You're all set" plus the span ", {name}". Subtitle "Your profile is ready for the community. Review it before you start blending."
2. **Profile card** (`surfaceMedia`, radius 32, padding 24):
   - a corner badge: a 48pt `surface` circle with a `checkmark`;
   - a 136pt avatar ring (`textTertiary`) around a 128pt photo, with a 4pt `surfaceMedia` gap. Without a photo it shows an empty `surfaceSunken` disc;
   - the name (`TYPE.title`, or "Your name" when empty);
   - the occupation;
   - a 96pt hairline divider, then the bio in quotes (`:62-113`).
3. **Interests card** (`surfaceSunken`): the heading "Interests" and the chips (`surface` pills, `bodyStrong`).
4. **Summary rows:** "Where you live" (filled `location`) and "Looking for" (filled `people`), with values joined by " · ". Each shows only when answered (`:115-134`).

**Interactive elements:** CTA, "Edit my details" and back. The cards are not tappable.

**Haptics and animation:**

- `Haptics.notificationAsync(Success)` when finishing works (`:32`); `Error` when it fails (`:36`).
- No entrance motion.

**States:**

| State | What happens |
|---|---|
| Saving | CTA busy. |
| Failure | Toast `FINISH_FAILED`: "We could not finish setting up your profile. Check your connection and try again — nothing you entered has been lost." (`useOnboarding.ts:48-49`, `:381`). The step stays. |
| Empty answers | Their cards are omitted. |

**Data:** the whole draft plus `onboarded: true` go to the profile. The interests graph is re-synced. The local record is cleared. `clearNewAccountFlag`; `refreshAuthUser`.

**Product rules to keep:**

- **The only `onboarded` writer.**
- **Never advance on failure.**
- **Show only answered fields** (`:115-116`).

**Redesign opportunities:**

- **This is the payoff moment.** It is the right place for the brand gradient ring around the avatar: the doc mentions "128px avatar in a gradient ring" in the frame (`docs/ONBOARDING.md` §9), and the code uses a grey `textTertiary` ring.
- **Celebration.** Add a confetti or orb bloom on success (`ConfettiBurst` exists, `components/motion/ConfettiBurst.tsx`) and a staggered card entrance (`MOTION_STAGGER`).
- **Edit shortcut.** Make the preview cards tap-to-edit per step: `jumpTo` already supports it.

---

### `/onboarding/friends`: "Bring your friends." (after the flow; no progress bar)

- **Files:** `app/onboarding/friends.tsx`. It renders `OnboardingScreen` (no `step`, no `onBack`) and `InviteLinkCard`; it uses `useFriendInvite`.
- **Job:** explain that nobody can find you by search, and share the invite link once.
- **Entry:** `replace` from ready. Swipe-back is disabled (`_layout.tsx:40`); Android hardware back goes into the app (`:35-43`).
- **Exit:** `router.replace('/(tabs)/events')` (root fade).
- **Primary action:** "Share my link". After a share it becomes "Start Blend'n" (`:54-59`).

**Content, top to bottom:**

1. Title "Bring your " plus the span "friends.". Subtitle "Nobody can find you on Blend'n by searching. Share your link, and anyone you send it to can ask to be your friend."
2. `InviteLinkCard`: a `link` icon and the URL without `https://`, selectable, up to 2 lines.
3. Footer: CTA; secondary "Maybe later" (or "Share again" after a share); `footerNote` "IN A ROOM, FRIENDS SEE YOUR PSEUDONYM LIKE EVERYONE ELSE. YOU CAN CHANGE THAT IN SETTINGS." with a lock glyph.

**Interactive elements:** CTA opens the OS share sheet (`Share.share`); the result counts only when the sheet reports it was shared. Secondary.

**Haptics and animation:** none.

**States:**

| State | What happens |
|---|---|
| Invite loading | CTA busy; card spinner. |
| Invite failed | Card: "Your link didn't load. Check your connection and try again." CTA disabled. **There is no retry button** (`reload` is unused). "Maybe later" still works. |
| Shared | CTA becomes "Start Blend'n". |

**Data:** reads `GET /api/mobile/friends/invite`.

**Product rules to keep:**

- **Shown once.**
- **No search:** the link is the only way in.
- **Optional.**
- **Friends see your pseudonym by default.**

**Redesign opportunities:**

- **Failed-load retry.** Add one.
- **Invite card.** A natural solid card with a QR code. Animate the CTA label swap.
- **Share haptic.** A success haptic on a confirmed share.

---

### `/settings`: Settings

- **Files:** `app/settings.tsx`. It renders `AppHeader`, a `ScrollView` with `RefreshControl`, one grouped card of rows (`Pressable` switch rows and `ScalePress` nav rows) and three `ActionTray`s.
- **Job:** privacy and notification toggles, safety, help, about, sign out and delete account.
- **Entry:** Me tab settings button (`app/(tabs)/profile.tsx:597-599`); `BlendnScreen.tsx:372` ("unhide"). Root stack push.
- **Exit:** back; push `/blocked-users`, `/support`, `/about`; external URLs in a browser; sign out or delete, after which the guard moves to index.
- **Primary action:** none by design ("A screen with no primary action… (Settings)", DESIGN_SYSTEM).

**Content, top to bottom** (`:379-436`): `AppHeader` "Settings" (`TYPE.display` 34pt, with a back chevron). Then one `surfaceSunken` card, radius 16 with a hairline border (`:660`). Section headers are UPPERCASE `TYPE.label` *inside* the card. The sections:

| Section | Rows |
|---|---|
| **PRIVACY** | Switch rows, each with an icon (20) and title (`bodyStrong`), plus an optional hint (`meta`): "Show online status" (`eye-outline`, hint "Off: you're counted at events but not listed to other people there."); "Read receipts" (`checkmark-done-outline`); "Share location for nearby events" (`navigate-outline`); "Friends can see who I am in rooms" (`people-outline`, hint "Off: at an event, your friends see your pseudonym like everyone else."). |
| **NOTIFICATIONS** | "Push notifications" (`notifications-outline`). When the OS has blocked notifications, the hint reads "Off in your phone's settings." and the switch shows off. |
| **SAFETY** | Blocked users (`ban-outline`, chevron); Safety tips (`shield-checkmark-outline`, external); Community guidelines (`flag-outline`, external). |
| **HELP** | Help centre (`help-circle-outline`, external); Contact support (`mail-outline`). |
| **ABOUT** | About Blend'n (`information-circle-outline`). |
| **ACCOUNT** | Sign out (`log-out-outline`). |
| **DANGER ZONE** | Spaced 48pt above (`:667`; the comment says 40). Delete account (`trash-outline`, `destructive` red, label "Deleting account…" while busy). |

Rows have 16 padding. Hairline dividers are inset past the icon (`:676`). External rows end in `open-outline` (16) and internal ones in `chevron-forward` (16).

**Interactive elements:**

- **Switch rows:** the whole row is the switch (`accessibilityRole="switch"`, `:462-494`). The update is optimistic.
  - `persistPreference` sends `push_enabled`, `show_online`, `read_receipts`, `share_location` and `friends_see_me_in_rooms` (`:242-248`).
  - A per-row spinner shows while saving.
  - On failure, only that key rolls back and a toast says "Couldn't save "{title}". Try again." (`:269-278`).
- **Push on:** clears the decline flag and calls `initializePushNotifications` (which may prompt). Push off removes the token (`:255-266`).
- **Push while OS-blocked:** opens the "Notifications are off" tray, with "Not now" and "Open Settings" (`:623-639`).
- **Nav rows:** `ScalePress` with `pressedScale` 0.98 and `haptic={false}`.
- **Pull to refresh:** reloads preferences and the OS push state.
- **Sign out tray:** "Sign out?" / "You'll need to sign in again to see your events, friends and messages." with Cancel and Sign out (primary, spinner). A failed server sign-out shows an info toast (`:344-363`).
- **Delete tray** (two steps in one tray, `layout="stack"`, not dismissible while deleting, `:587-621`):
  - Step 1, "Delete your account?": "Your profile, photos, friends and sign-in are deleted now. Messages you sent stay in their conversations under a deleted account, and we keep your registration details for 180 days, as Indian law requires." Buttons: Delete account (destructive), What's kept (external link), Cancel.
  - Step 2, "Delete your account for good?": "This can't be undone. You'd need a new account to use Blend'n again." Buttons: Delete my account / Try again (destructive), Cancel.
  - Success shows the toast "Your account has been deleted."

**Haptics and animation:**

- `ScalePress` scale 0.98 over 120ms (`ScalePress.tsx:71-78`), with haptics explicitly off (`:497-501`).
- `Switch` is native.
- Trays animate.
- No haptics anywhere.

**States:**

| State | What happens |
|---|---|
| Loading | Switches disabled and showing the cached or default values. There is no skeleton. |
| Load error | "Your settings didn't load. Pull down or try again." plus a "Try again" pill (`:194`, `:544-560`). |
| Offline | Same as the load error. |
| Saving per row | Spinner. |
| Push OS-blocked | Shown as off, with the hint. |
| Deleting | Row label changes; tray busy. |
| First run | Defaults are push/online/receipts/location `true`, friendsSeeMe `false` (`:39-47`). |

**Data:**

- Reads `GET /api/mobile/profiles/:id`.
- Writes the 5 booleans through `PUT`.
- Caches to AsyncStorage `settings_preferences_<userId>`.
- Delete uses `DELETE /api/mobile/account`.

**Product rules to keep:**

- **Section structure is test-pinned** (`meAndSettings.test.ts`): Blocked users under Safety; no "Discovery" section; Delete account last under its own spaced header; one profile editor, with no second door in Settings.
- **Sign out asks first.** Sign out is not red.
- **The 180-day retention copy** follows IT Rules 2021, r.3(1)(h) (`:581-586`).
- **`friendsSeeMe` defaults to off.** Pinned by `friendsWiring.test.ts`.
- **Push is shown on only when the account *and* the OS agree** (`:451-454`).

**Redesign opportunities:**

- **AppHeader becomes a floating glass nav bar** with large-title collapse. Today it is a 34pt display title on a transparent row.
- **Split the cards.** The single long card holds all the sections, and putting section headers inside one card is unusual. Use one solid card per section, with the headers outside.
- **Danger zone.** Move it to its own outlined destructive card.
- **Haptics:** add selection haptics on switch flips (system Settings has none, but the brief asks for richness); a success haptic on save; a warning haptic on opening the delete tray.

---

### `/about`: About Blend'n

- **Files:** `app/about.tsx`. It renders `AppHeader`, a version block and a link card of `ScalePress` rows.
- **Job:** show the build version and link the legal documents.
- **Entry:** Settings, then About.
- **Exit:** back; external links.
- **Primary action:** none ("No accent", `:17-19`).

**Content, top to bottom:**

1. Header "About Blend'n".
2. "VERSION" label above a selectable `bodyStrong` value, e.g. "1.0.0 (118)", from `appVersionLabel` (native version and build, `lib/support.ts:13-23`).
3. A card (`surfaceSunken`, radius 16, hairline) with three rows:
   - Terms of Service (`document-text-outline`);
   - Privacy Policy (`lock-closed-outline`);
   - Community guidelines (`flag-outline`).

   Each row ends in `open-outline`. Dividers are inset (`:77`).

**Interactive elements:** rows open URLs (`BLENDN_LINKS`, `lib/links.ts`). On failure, a toast says "That page didn't open. Try again."

**Haptics and animation:** `ScalePress` at 0.98, `haptic={false}`.

**States:** link failure (toast). Nothing else.

**Data:** none. The version is read from native.

**Product rules to keep:** legal links stay one tap away; the version stays readable and selectable for support.

**Redesign opportunities:**

- **Brand moment.** A small brand lockup or monogram with gradient here.
- **Version as a chip.** Tap to copy, with a haptic.

---

### `/support`: Contact support

- **Files:** `app/support.tsx`. It renders `AppHeader`, `EmberButton` and a `ScalePress` row.
- **Job:** a `mailto:` to support carrying the version, platform and account id.
- **Entry:** Settings, then Contact support.
- **Exit:** the mail app; the help centre URL; back.
- **Primary action:** "Email support" (`:50`).

**Content, top to bottom:**

1. Explainer: "Tell us what happened and we'll write back by email. Your draft includes these details so we don't have to ask:"
2. A details box (`surfaceSunken`) listing "App 1.0.0 (118)", "iOS 18.2" and "Account {id}".
3. The primary button.
4. `support@blendn.app`, selectable and centred.
5. A Help centre row (`help-circle-outline`, "Answers to the common questions", `open-outline`).

**Interactive elements:** Email opens `supportMailto` (`lib/support.ts:39-56`). If no mail app opens, the toast says "No email app opened. Write to support@blendn.app." (info). The Help row opens the URL.

**Haptics and animation:** `ScalePress` at 0.98, no haptic.

**States:** no mail app (toast); link failure (toast).

**Data:** the version, platform and user id go into the mail body. Nothing is sent by the app.

**Product rules to keep:** **the screen says what the draft includes before the user sends it**, and nothing leaves until they press send in their mail app (`:16-22`). The address is written in one place (`accountJourney.test.ts`).

**Redesign opportunities:** the gradient primary; the details box as a solid card with icons; a copy-address affordance.

---

## A2. Components in scope

Format: **path** · role · where used · variants and states · interactions · motion and haptics · material layer in the glass redesign · notes.

- **`components/onboarding/EmberControls.tsx` → `EmberButton`** (`:68-120`).
  - Role: the primary or secondary pill button, `CONTROL.lg` 56.
  - Used in: sign-in, forgot-password, support, index, `f/[token]`, event-preferences, `friends/*`, `ErrorBoundary`, `OnboardingScreen` (11 files).
  - Variants: `primary` (flat `EMBER.accent` fill, `onGradient` text) and `secondary` (`surface` fill, `textPrimary` text) (`:535-547`).
  - States: disabled (opacity 0.45, but busy keeps its fill), busy (`ActivityIndicator` in the ink colour), pressed (opacity 0.85). The label is capped at 1.3× font scale and one line.
  - Motion and haptics: none.
  - **Glass mapping:** primary becomes the **brand-gradient** fill (the single primary); secondary becomes **glass** or a solid card fill.
  - Notes: add scale-on-press, a selection or impact haptic, and a success or error haptic hook. This is the place to implement the gradient once.

- **`EmberChip`** (`:147-183`).
  - Role: a single choice pill.
  - Used in: basics, preferences, journey, details.
  - Look: idle is `surface` with a `separator` hairline; selected is a `textPrimary` fill with `bg` text; disabled is opacity 0.45. A transparent 1pt border on both states keeps the width stable. Padding 16/12, minimum height 48, `flexShrink` 1, `maxWidth` 100%.
  - Accessibility: `button` role with `selected`, deliberately not `radio`.
  - Motion and haptics: none.
  - **Glass mapping:** solid (content-level control); a glass fill is an option on the orb-backed screens.
  - Notes: add a selection haptic and a subtle selected-state spring. Keep the fixed width (anti-reflow).

- **`EmberChipRow`** (`:200-280`).
  - Role: a wrapping row built with half-margins rather than `gap` (a Yoga wrap bug).
  - Packing: optional `pack` reorders chips by measured widths to fill rows (`lib/chipPacking.ts`). Catch-alls such as "Prefer not to say" are kept last.
  - Used in: basics, preferences, journey, details.
  - Motion: none. A pack reorder happens one frame after mount.
  - **Glass mapping:** none; it is layout only.

- **`EmberField`** (`:300-324`).
  - Role: a labelled `TextInput`. The uppercase `TYPE.label` sits above, with an optional `meta` helper in `textTertiary` below.
  - Look: input is 56pt, a `surface` pill, 24 horizontal padding, `TYPE.body`. `compact` makes it centred with 12 padding and no visible label (DD/MM/YYYY).
  - Font scale: `maxFontSizeMultiplier` 1.3 is a literal (`:315`).
  - Used in: basics, journey, details.
  - States: **no focus, error or filled styling.**
  - **Glass mapping:** solid input fill. Add a focus ring, perhaps gradient-tinted.

- **`EmberToggle`** (`:348-373`).
  - Role: a full-width row with label, a *required* helper, and a native `Switch` (`SWITCH_COLORS`: off `textTertiary`, on `success`).
  - Look: row is `surfaceSunken`, radius 16, padding 16/24. The row is the switch target.
  - Used in: preferences (Stay anonymous).
  - **Glass mapping:** solid card row.
  - Notes: the on colour is **green `success`, not accent**. Decide whether the gradient or an orange on-state applies; the doc forbids accent on switches.

- **`EmberSection`** (`:387-418`).
  - Role: a `TYPE.heading` title, an optional right-hand control on the title line, and a caption in `meta` `textTertiary` running full width.
  - Used in: preferences ×3.
  - **Glass mapping:** none (open content).

- **`EmberInlineToggle`** (`:431-469`).
  - Role: a pill with a label and a scaled (0.8) `Switch`.
  - Look: `surfaceMedia`, minimum height 32, `hitSlop` 8.
  - Used in: preferences (Show on profile).
  - **Glass mapping:** a glass pill.
  - Notes: the `hint` is accessibility-only. **Surface it visually** (see preferences).

- **`EmberCardSection`** (`:483-508`).
  - Role: an enclosed card with an icon badge (48pt `surface` circle with a 20pt glyph), a `heading` title and a caption.
  - Look: `surfaceMedia`, radius 32, hairline, padding 16, gap 16.
  - Used in: journey ×3.
  - **Glass mapping:** **solid content card**, the reference shape for the redesign's cards.

- **`EmberFieldGroup`** (`:511-527`).
  - Role: an uppercase label over arbitrary children, plus a helper.
  - Used in: basics, journey, details.
  - **Glass mapping:** none.

- **`components/onboarding/ListLoadState.tsx`** (`:16-43`).
  - Role: an inline loading state (`ActivityIndicator` in `textSecondary`) or an error ("Couldn't load the {what}." plus "TRY AGAIN" in `label` `textPrimary`, `hitSlop` 8).
  - Used in: journey, details.
  - **Glass mapping:** none.
  - Notes: could become a skeleton chip shimmer (`EMBER.skeleton`).

- **`components/onboarding/LookingForCards.tsx`** (`:50-96`).
  - Role: five square photo tiles, two across, `CARD` = (width − 48 − 16) / 2.
  - Look: radius 32. Art at 0.4 opacity (design-exception `:112-113`) under a `bgClear → bgClear → bg@0.95` gradient. A **filled** Ionicon (heart, people, briefcase, compass, infinite) and a `TYPE.button` label at the bottom. Selected adds a 4pt `textPrimary` border; the border is transparent at rest.
  - Under 18: removes Dating.
  - Used in: preferences.
  - Motion and haptics: none.
  - **Glass mapping:** solid image cards. The selected state could gain a gradient border or a glass check badge.
  - Notes: replace three of the images (UI chrome baked in) and convert the icons to outline.

- **`components/onboarding/OnboardingScreen.tsx`**: see §A1.
  - Used by the 9 onboarding screens. (`edit-profile.tsx:546` only cites it in a comment.)
  - **Glass mapping:** header and footer become glass; the body sits on the orbs.

- **`components/onboarding/PermissionIllustration.tsx`** (`NotificationIllustration` `:50-78`, `LocationIllustration` `:88-142`).
  - Role: decorative cards, 4:5 aspect, radius 32, hairline, hidden from accessibility.
  - Notification card: the orb art, a 75% bottom scrim, and a bubble (`surface` pill with a 48pt `surfaceSunken` well holding a filled `flash` icon, title, time and body).
  - Location card: the map at 0.4, rings (192 and 288, the outer at 0.5 opacity), three pins, a 64pt YOU marker with its tag, a 110pt gradient footer, and "CURRENT ZONE: OLD GOA".
  - Images: `expo-image` with a 180ms transition and memory-disk cache.
  - Exceptions: four design-exceptions (`:186`, `:230`, `:243`, `:245`).
  - **Glass mapping:** the bubble and the zone footer are **glass**; the card is a solid media card.
  - Notes: the strongest motion opportunity (the bubble drops in; the rings pulse). The comment at `:80-87` is stale.

- **`components/onboarding/SettingsTray.tsx`** (`:14-45`).
  - Role: an `ActionTray` titled "Turn this on in Settings", with buttons Not now (secondary) and Open Settings (primary, which closes the tray and calls `Linking.openSettings()`).
  - Used in: notifications, location.
  - **Glass mapping:** a glass sheet (via `ActionTray`).

- **`components/ui/Text.tsx`** (`:18-32`).
  - Role: role-based text. `variant` defaults to `body`; there is a `color` prop; `maxFontSizeMultiplier` defaults to `MAX_FONT_SCALE[variant]`.
  - Used in: 38 files. **42 files still import RN `Text` and spread `TYPE`**, including every onboarding screen, sign-in, forgot-password and Settings.
  - **Glass mapping:** none.
  - Notes: the Satoshi swap happens in `TYPE`. Consider migrating the in-scope screens to `<Text variant>` first, so the swap is one edit.

- **`components/ui/Grabber.tsx`** (`:12-24`).
  - Role: the sheet handle, 40×4 (literals the lint does not check), pill, `textTertiary`.
  - Used in: `ActionTray`, `NotificationBell`, `FilterControl`, `PersonCard`, `ChatDock`, `ConnectSheet`, `events`.
  - **Glass mapping:** sits on glass sheets; it may need a lighter tint on glass.

- **`components/Toast.tsx`**.
  - Role: a top stack of at most 3 toasts (`slice(-2)`, `:177`) at `insets.top + 8`.
  - Variants:
    - success: `tint(success, .15)` fill, `tint(success, .4)` border, filled `checkmark-circle`;
    - error: the same with `destructive`, filled `alert-circle`;
    - info: `surface`, `separator` border, filled `information-circle`.
  - Look: radius 16, padding 12/16, the message in `TYPE.body` up to 3 lines, an optional underlined `button`-style action.
  - Duration: 3s, or 5s with an action (`:37-38`).
  - Accessibility: `announceForAccessibility` on iOS; a live region on Android (`:166-176`).
  - Motion: enters with fade plus translateY −12→0 over 220ms (`MOTION_EASING.entrance`) and exits over 160ms, with a `LinearTransition` reflow (`:80-106`). Reduce Motion leaves the fade only.
  - **Glass mapping:** **glass** (a floating layer), with the status tint as a glass tint.
  - Notes: add a success or error haptic per variant (none today); convert the icons to outline.

- **`components/ErrorBoundary.tsx`**.
  - Role: a full-screen fallback on `EMBER.bg`.
  - Content: `warning-outline` at 48 in `destructive`; "Something went wrong" (title); "This screen stopped working. Nothing you saved is lost. Try again, and if it keeps happening, tell us."; a dev-only raw message; `EmberButton` "Try again"; "CONTACT SUPPORT" (a text action that opens a mailto with the error id, or shows the address inline if no mail app opens); "Error E-XXXX-XXXX", selectable.
  - Used in: the root `_layout.tsx:470`, which also reports to Sentry.
  - **Glass mapping:** solid; orbs behind.
  - Notes: pinned by `accountJourney.test.ts` (raw error in dev only, support with the error id, Try again kept).

- **`components/LegalLine.tsx`** (`:14-39`).
  - Role: the sentence "{lead} agree to our Terms and Privacy Policy." in `meta` `textTertiary`, centred, with the links underlined in `textPrimary`.
  - Used in: index ("By continuing you") and sign-in ("By creating an account you").
  - **Glass mapping:** none.
  - Notes: links come from `BLENDN_LINKS`. Pinned by `first-run-journey.test.ts`.

- **`components/AppHeader.tsx`** (`:38-123`).
  - Role: a transparent row.
  - Contents: a back `chevron-back` at 24 in a 48 box; a title in `TYPE.display` 34pt with `adjustsFontSizeToFit` down to 0.7; an optional subtitle in `meta`; a right-side text CTA (an **accent** pill, 48 tall) or an icon button.
  - Padding: 12 horizontal, so the chevron lands on the 24 gutter.
  - Used in: settings, about, support, blocked-users, edit-profile, `board/[eventId]`, `friends/*`, `chat-info/[id]` (11 files).
  - Motion and haptics: pressed opacity only.
  - **Glass mapping:** **glass nav bar.** It is the main "floating navigation layer" outside the tabs.
  - Notes: no large-title-to-inline collapse on scroll; consider one.

- **`components/VirtualizedList.tsx`** (`:34-158`).
  - Role: a tuned `FlatList` wrapper (`windowSize` 7, `initialNumToRender` 8 and so on).
  - Used in: **only** `app/(tabs)/events.tsx:2414`.
  - No visual role.
  - **Glass mapping:** none. Lists that scroll under a glass header need top content inset equal to the header height and `scrollIndicatorInsets`.

Adjacent components the scoped screens depend on:

- **`components/ActionTray.tsx`.**
  - Role: a modal bottom sheet.
  - Look: `surfaceSunken` with a hairline, top radius 24, `backdrop` `rgba(0,0,0,.6)`, a grabber, a title (`title`), a message (`body` `textSecondary`), and buttons as 56pt pills. Button variants: primary is accent, destructive is red, secondary is `surface`. Layouts are `row` or `stack`.
  - Motion: enters with opacity over 160ms and a 40→0 rise over 220ms (`MOTION_EASING.entrance`); the Modal fades out. A drag-to-dismiss on the head closes the tray past 80pt or 800 velocity, otherwise it springs home (`withSpring` 300ms, `dampingRatio` 1).
  - **Glass mapping:** **a glass sheet.** It is the main sheet primitive (16 files), and `lib/sheet.ts` / `SheetHost` drive the app-wide sheets.

- **`components/motion/ScalePress.tsx`.**
  - Role: a press-in scale (default 0.97) as a 120ms CSS transition with `cubicBezier(0.23,1,0.32,1)`, plus a `Haptics.selectionAsync` on press-in when `haptic` is true (the default).
  - Usage: 81 uses, 49 with `haptic={false}`.
  - Notes: the ready-made "rich haptics" primitive. Flip the in-scope defaults.

- **`components/friends/InviteLinkCard.tsx`**: a `surfaceSunken` card, radius 16, holding a `link` icon and the URL, a failure line or a spinner.

- **`components/friends/PendingInvite.tsx`**: "Sign in to accept {name}'s invite" with a 32pt avatar, or "This invite link doesn't work any more…".

---

## B. Design foundations

### B1. `lib/theme.ts`: every token

**Legacy `APP_*` block.** These are retired, and the lint bans them in `app/`, `components/` and `lib/` (except `theme.ts`). Only `APP_MOTION` is still read, by `lib/uxStandards.ts` `TRANSITION_SPECS`.

| Token | Values |
|---|---|
| `APP_COLORS` (`:10-22`) | backgroundBase `#000000`, backgroundElevated `#1C1C1E`, backgroundCard `#2C2C2E`, separator `rgba(255,255,255,0.14)`, textPrimary `#FFFFFF`, textSecondary `#EBEBF599`, textTertiary `#EBEBF54D`, accent `#0A84FF`, accentPressed `#0060DF`, destructive `#FF3B30`, success `#34C759` |
| `APP_SPACING` (`:24-34`) | xxs 4, xs 8, sm 12, md 16, lg 20, xl 24, 2xl 32, 3xl 40, 4xl 48 |
| `APP_RADIUS` (`:36-43`) | xs 8, sm 12, md 16, lg 20, xl 24, pill 999 |
| `APP_SIZE` (`:45-50`) | touchTarget 44, iconSm 16, iconMd 20, iconLg 24 |
| `APP_ELEVATION` (`:52-74`) | low: shadow `#000` opacity .18, radius 6, offset 0/2, elevation 3. medium: .22 / 10 / 0,4 / 6. high: .30 / 14 / 0,8 / 10 |
| `APP_MOTION` (`:76-88`, **live**) | duration instant 90, fast 160, normal 220, slow 300. easing entrance `[0.16,1,0.3,1]`, exit `[0.4,0,1,1]`, standard `[0.2,0,0,1]` |
| `APP_CTA` (`:90-110`) | primary bg accent, text white, pressed `#0060DF`, disabled `rgba(10,132,255,0.4)`. secondary bg `#1C1C1E`, border separator, pressed `#2C2C2E`, disabled `rgba(255,255,255,0.08)`. destructive bg `#FF3B30`, pressed `#D12D24`, disabled `rgba(255,59,48,0.45)` |

`APP_MOTION` duplicates `MOTION_DURATION` with drifted values: instant 90 vs 100, slow 300 vs 320.

**`EMBER` palette** (`:123-176`, "Liquid Ember", from Figma "🕓 Updates"):

| Token | Value | Role (from comments) |
|---|---|---|
| `bg` | `#0F0E0E` | Page; a warm near-black, "not `#000`, which reads blue beside the accent" |
| `surface` | `#272525` | Inputs and large content cards; pill controls |
| `surfaceSunken` | `#211F1F` | Unselected chips and the progress track; grouped panels and trays |
| `surfaceMedia` | `#141313` | Media wells and onboarding cards; darker than the page |
| `textPrimary` | `#FFFFFF` | |
| `textSecondary` | `#AEAAAA` | Body copy, field labels, percentages |
| `textTertiary` | `#928E8D` | Helper text; AA on bg, sunken and surface (was `#787574`) |
| `textPlaceholder` | `#8A8F99` | Cool grey placeholder (was `#6B7280`) |
| `accent` | `#FF906D` | The primary action, flat; one per screen. The Figma gradient was `#FF906D → #FF6D8D` |
| `onGradient` | `#5B1600` | Text on the accent (dark, because white fails) |
| `separator` | `rgba(255,255,255,0.1)` | Hairlines and outlines |
| `skeleton` | `rgba(255,255,255,0.12)` | Loading blocks |
| `destructive` | `#FF453A` | |
| `success` | `#30D158` | Also the switch "on" colour |
| `warning` | `#FFBC5C` | |
| `violet` | `#F79EFF` | "The one cool hue: the alternate glyph in a pair of amenity tiles" |
| `scrim` | `rgba(15,14,14,0.6)` | Pills on photos |
| `bgClear` | `rgba(15,14,14,0)` | The clear end of a photo-to-page fade |
| `backdrop` | `rgba(0,0,0,0.6)` | Behind modals, sheets and the lightbox |

**Helpers and scales:**

- `tint(hex, alpha)` returns `rgba(r,g,b,alpha)` (`:182-185`). It is the sanctioned way to get a translucent token colour, and is usable for glass fills.
- `SWITCH_COLORS` (`:193-199`): trackColor false `textTertiary`, true `success`; thumbColor `textPrimary`; `ios_backgroundColor` `textTertiary`.
- `EMBER_RADIUS` (`:205-214`): sm 8 (thumbnails, badges), md 16 (rows, bubbles), lg 24 (sheets, panels), card 32, pill 9999.
- `EMBER_FONTS` (`:228-234`): displayExtraBold `PlusJakartaSans_800ExtraBold`, displayBold `PlusJakartaSans_700Bold`, bodyRegular `Manrope_400Regular`, bodySemiBold `Manrope_600SemiBold`, bodyBold `Manrope_700Bold`.
- `SPACE` (`:254-263`): xxs 2, xs 4, sm 8, md 12, lg 16, xl 24, xxl 32, xxxl 48. `GUTTER` is `SPACE.xl` (24) (`:266`).
- `ICON` (`:269-273`): sm 16, md 20, lg 24.
- `CONTROL` (`:282-288`): lg 56, md 48, sm 32, badge 18.
- `OPACITY` (`:297-300`): pressed 0.85, disabled 0.45.

**`TYPE`** (`:318-377`). Every role sets `color`:

| Role | Family | Size / line | Tracking | Default colour |
|---|---|---|---|---|
| display | Jakarta 800 | 34/40 | −1 | textPrimary |
| title | Jakarta 700 | 24/30 | −0.4 | textPrimary |
| heading | Jakarta 700 | 20/26 | −0.2 | textPrimary |
| button | Jakarta 700 | 16/24 | n/a | textPrimary |
| body | Manrope 400 | 16/24 | n/a | textPrimary |
| bodyStrong | Manrope 600 | 16/24 | n/a | textPrimary |
| meta | Manrope 400 | 13/18 | n/a | textSecondary |
| label | Manrope 700 | 12/16 | 1.2 | textSecondary (uppercase in the string) |
| caption | Manrope 600 | 11/14 | n/a | textSecondary |

`MAX_FONT_SCALE` (`:396-406`): display 1.2, title 1.2, heading 2, button 1.3, body 2, bodyStrong 2, meta 2, label 1.3, caption 1.3.

Measured contrast (WCAG):

| Text | bg | surfaceSunken | surface | surfaceMedia |
|---|---|---|---|---|
| textPrimary | 19.28 | 16.40 | 15.24 | 18.55 |
| textSecondary | 8.38 | 7.13 | 6.63 | 8.06 |
| textTertiary | 5.94 | 5.06 | 4.70 | 5.72 |
| textPlaceholder | 5.94 | 5.05 | 4.70 | 5.71 |

- On the accent: `onGradient` 6.07; white 2.22.
- On `bg`: `#F05423` 5.50; `#8E4BAA` 3.43 (fails AA as text); accent 8.69.
- **Glass implication:** translucent glass over orange and violet orbs changes these numbers per pixel. The contrast test only checks fixed solid surfaces, so a glass surface token needs an assumed worst-case backdrop to test against.

### B2. `lib/motion.ts` (`:1-39`)

- `MOTION_DURATION`: instant 100, fast 160, normal 220, slow 320, relaxed 520 ("first-load entrances on the Me tab").
- `MOTION_EASING`:
  - standard `[0.2,0,0,1]`;
  - entrance `[0.16,1,0.3,1]`;
  - exit `[0.4,0,1,1]`;
  - gentle `[0.33,1,0.68,1]` (easeOutCubic, for watched entrances).
- `MOTION_STAGGER`: xFast 18, fast 28, normal 40 (ms).
- `MOTION_SPRING`:
  - gentle: damping 18, stiffness 220, mass 0.9;
  - snappy: damping 16, stiffness 280, mass 0.75.
- Used by Toast, ActionTray, onboarding media, event detail, scene and so on (14 files use `MOTION_DURATION`; 6 use `MOTION_SPRING`).
- **Ad-hoc curves in scope that are not tokens:**
  - `bezier(0.77,0,0.175,1)` for the sign-in segment (200ms) and the media tiles (250ms);
  - `bezier(0.23,1,0.32,1)` for the onboarding progress (300ms after 200) and `ScalePress` (120ms).

  A redesign should add these as tokens (an `emphasized`/`inOut` and an `outQuint`), plus the press-scale values.

### B3. `lib/fonts.ts` (`:1-46`)

- `EMBER_FONT_MODULES` contains `PlusJakartaSans_700Bold`, `PlusJakartaSans_800ExtraBold`, `Manrope_400Regular`, `Manrope_600SemiBold` and `Manrope_700Bold`, imported from `@expo-google-fonts/manrope` and `@expo-google-fonts/plus-jakarta-sans` (package.json `^0.4.2`).
- Passed to `useFonts` in `app/_layout.tsx:100`. The splash waits for the fonts or a font error (`:101`).
- **Satoshi migration:**
  - Add the font files under a new `assets/fonts/`, either loaded with `useFonts({ 'Satoshi-Bold': require(...) })` or embedded with the `expo-font` config plugin.
  - Name each weight as its own family (Android ignores `fontWeight`).
  - Update `EMBER_FONTS`, `TYPE` and `EMBER_FONT_MODULES` together.
  - `fonts.test.ts` fails on any loaded-but-unused family and any used-but-unloaded one.
  - Check the Satoshi licence (Fontshare's free licence covers app embedding) and which weights to ship. Typical cuts are Regular, Medium, Bold and Black, plus Light.

### B4. `lib/useInteractionFeedback.ts` (`:1-22`) and haptics inventory

- Returns `tap` (`Haptics.selectionAsync`), `success`, `warning` and `error` (`notificationAsync` with the matching type). Every call swallows rejections.
- Used in 3 places: `(tabs)/events.tsx`, `preview/confetti.tsx`, `EventDetailScreen.tsx` (and `lib/useCheckInFlow.ts`).
- **No impact styles are exposed** (Light, Medium, Heavy, Rigid, Soft). Several components call `Haptics.impactAsync` directly instead.
- App-wide there are about 30 direct `expo-haptics` calls in about 17 files: selection 9, impact Light 8, impact Medium 3, success 6, warning 2, error 2.
- **In scope: only `onboarding/ready.tsx:32,36`.**
- **Recommendation:** grow this hook into the single haptic vocabulary (`tap`, `select`, `toggle`, `impactLight`/`Medium`, `success`, `warning`, `error`, `rigid` for the gradient CTA), and route `EmberButton`, `EmberChip`, the toggles, `ScalePress`, `Toast` and `ActionTray` through it.

### B5. `scripts/check-design-tokens.js`: every rule it enforces (the redesign must rewrite these)

**Scope** (`:42-48`):

- Every `.ts`, `.tsx`, `.js` and `.jsx` file under `app/` and `components/`.
- `lib/` (except `theme.ts`) is checked for the `legacy-palette` rule **only**.
- Comments are stripped before matching: block comments, including JSX `{/* */}`, and line comments not preceded by `:` (`:170-190`).

**Escape hatch:** `// design-exception: <non-empty reason>` on the same line or the line before (`:160-162`). Without a reason it does not count.

**Main `RULES`** (`:51-107`):

| id | Regex | Message |
|---|---|---|
| `raw-font-size` | `/\bfontSize:\s*-?\d/` | raw fontSize — use a TYPE role |
| `font-weight` | `/\bfontWeight:/` | fontWeight — pick the weight through the TYPE role / EMBER_FONTS family |
| `legacy-palette` | `/\bAPP_(COLORS\|SPACING\|RADIUS\|SIZE\|CTA\|ELEVATION)\b/` | legacy APP_* token — use EMBER / SPACE / ICON / CONTROL / EMBER_RADIUS (`APP_MOTION` is *not* banned) |
| `raw-colour` | ``/['"`]#[0-9a-fA-F]{3,8}['"`]\|\brgba?\(/`` | raw colour — use an EMBER token, or tint(EMBER.x, alpha) |
| `raw-radius` | `/\bborder(TopLeft\|TopRight\|BottomLeft\|BottomRight\|TopStart\|TopEnd\|BottomStart\|BottomEnd)?Radius(:\s*\|=\{)[1-9]/` | raw borderRadius — use EMBER_RADIUS (a circle is EMBER_RADIUS.pill). `0` is allowed |
| `raw-line-height` | `/\blineHeight:\s*\d/` | raw lineHeight — the TYPE role sets it |
| `text-transform` | `/\btextTransform:/` | textTransform — uppercase `label` text in the string |
| `shadow` | `/\bshadow(Color\|Opacity\|Radius\|Offset):/` | shadow — surfaces are flat; separate with fill contrast or EMBER.separator (note: `elevation:` is not caught) |
| `blur` | `/<BlurView\b/` | BlurView — no glass; use a flat EMBER surface |
| `retired-token` | `/\b(EMBER_TYPE\|EMBER_GRADIENT\|EMBER_CONTROL_HEIGHT\|EMBER_GLOW\|EMBER_ATMOSPHERE)\b\|EMBER_RADIUS\.input\b\|EMBER\.(gradientFrom\|gradientTo\|onGradientChip)\b/` | retired token — TYPE / flat EMBER.accent / CONTROL.lg / EMBER_RADIUS.pill |
| `legacy-typography` | `/from ['"][./]*(lib\/typography\|components\/Typography\|\.\/Typography)['"]/` | old Typography — use components/ui/Text |

**Numeric scale checks** (`:48-49`, `:138-140`, `:205-214`):

- `SPACE` allowed set: `{0,2,4,8,12,16,24,32,48}`.
  - Applied to `padding` and `margin` with suffixes Top, Bottom, Left, Right, Horizontal, Vertical, Start or End, using the absolute value, so negatives are allowed. Regex: `/\b(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?:\s*(-?\d+(\.\d+)?)\b/g`.
  - Applied to `gap`, `rowGap` and `columnGap`. Regex: `/\b(gap|rowGap|columnGap):\s*(\d+(\.\d+)?)\b/g`.
- `ICON` allowed set: `{16,20,24}`, or any size of 28 and above ("decorative").
  - Applied to `<Ionicons|MaterialIcons|MaterialCommunityIcons|Feather|*Icon … size={n}>` with a literal `n`. Regex: `/<(Ionicons|MaterialIcons|MaterialCommunityIcons|Feather|\w+Icon)\b[^>]*?\bsize=\{(\d+)\}/g`.
  - It does not catch `AntDesign`, nor sizes given as variables.

**`LATE_RULES`** (`:115-131`). Everything except `LATE_RULE_ALLOWLIST` is subject to these:

| id | Regex | Message |
|---|---|---|
| `inset-literal` | `/\binsets\.(top\|bottom\|left\|right)\s*[-+]\s*[1-9]/` | number added to a safe-area inset — use SPACE |
| `size-literal` | `/\b(min\|max)(Width\|Height):\s*[1-9]/` | literal min/max width or height — use CONTROL, SPACE or a named constant |
| `opacity-literal` | `/\bopacity:\s*0?\.\d/` | literal opacity — use OPACITY.pressed / OPACITY.disabled, or name it |

- `LATE_RULE_ALLOWLIST` (`:133-136`): `app/preview/tonight.tsx` and `app/preview/profile.tsx`, both "dev-only design preview, not shipped".
- `staleAllowances()` reports allowlisted files that no longer need the entry (`:232-239`).
- CLI: `npm run lint:design [files…]`.

**What the linter does not check**, and the redesign should consider adding:

- literal `height` and `width` (for example the 6pt progress track, the 40×4 grabber, the 192 curation card, 160 bio, 128 avatar);
- `borderWidth`;
- `hitSlop`;
- `maxFontSizeMultiplier` literals;
- `transform` scales;
- `elevation`;
- `LinearGradient` colour arrays when built from tokens;
- AntDesign icon sizes.

**Rules the glass redesign will have to rewrite:**

- The `blur` ban: allow `BlurView`, but only through a `GlassSurface` primitive. A new rule could ban raw `BlurView` outside that file.
- The `shadow` ban: allow named elevation or glow tokens if any are used (the brief implies none; glass edges are usually a hairline plus an inner highlight).
- `raw-colour`: the brand gradient and orb colours become `EMBER` (or new `BRAND`) tokens, so the existing rule still works.
- The retired-token list names `EMBER_GRADIENT`, `EMBER_GLOW` and `EMBER_ATMOSPHERE`. A new gradient token must use a different name, or the redesign must un-retire those (`check-design-tokens.js:99`).
- `opacity-literal`: orb opacities and glass alphas need named constants.
- The doc's "accent at most once per screen" and "Surfaces are flat" sections need rewriting (`docs/DESIGN_SYSTEM.md`).

### B6. Design tests (exact assertions)

**`__tests__/themeContrast.test.ts`:**

- For each of textPrimary, textSecondary, textTertiary and textPlaceholder, on each of `bg`, `surfaceSunken` and `surface`: contrast ≥ 4.5 (12 cases, `:33-40`). `surfaceMedia` is **not** tested.
- `textTertiary` is dimmer than `textSecondary` on `bg` (`:42-44`).
- `onGradient` on `accent` ≥ 4.5, **and** `textPrimary` (white) on `accent` < 4.5 (`:46-49`). This pins the dark-text CTA.
- `MAX_FONT_SCALE.button` < `.body`; `.display` ≤ `.button`; the `MAX_FONT_SCALE` keys equal the `TYPE` keys (`:52-57`).

**`__tests__/designTokens.test.ts`:**

- `findViolations()` over the repo returns `[]` (`:14-19`). This is the gate.
- Self-tests of the regexes:
  - fontSize, off-scale padding and gap, an off-scale icon size, fontWeight and the exception comment (`:21-33`);
  - colours, radius 999 and 4, shadow, `BlurView`, `EMBER_TYPE`, lineHeight and textTransform, a custom `*Icon` size 18, with the token forms allowed (`:35-54`);
  - inset arithmetic, min and max sizes, opacity `0.7` and `.5`, with token forms and `'80%'` allowed (`:56-70`).
- Allowlisted files skip only the late rules (`:72-76`).
- The allowlist contains only `app/preview/*`; a shipped file joining it is a regression (`:78-83`).
- `lib/` is checked only for the legacy palette (`:85-89`).

**`__tests__/fonts.test.ts`:**

- Every `EMBER_FONTS` value is a loaded key (`:22-26`).
- Every `TYPE[*].fontFamily` is loaded (`:28-34`).
- Every loaded family is used by some `TYPE` role (`:36-46`).

**`__tests__/pulsePalette.test.ts`:**

- `app/(tabs)/events.tsx` contains none of `styles.sectionTitle`, `styles.viewAllText` or `styles.sectionDividerLine` (`:15-28`).
- With comments stripped, `events.tsx` contains no `sectionBg`, `topBarSticky`, `styles.topBar`, `wordmark` or `SafeAreaView`.
- **`app/_layout.tsx` does not contain `BackgroundGradient`** (`:81-85`, "paints no gradient behind every screen"). A root orb layer named `BackgroundGradient` would fail; any other name passes. The *intent* of the test is "no root background treatment", so rewrite or retire it deliberately.

**Other source-shape tests that pin scoped screens** (these will fail on a rewrite that renames or moves things):

- `first-run-journey.test.ts`: push waits for its step; a failed save stays on the step; permission steps wait for an answer; sign-out on step 1 and beside the under-18 message; the picker load and fail states; Terms and Privacy from one list; the session notice; email carried to forgot-password.
- `meAndSettings.test.ts`: the Settings section names and order; rollback; Delete last and spaced.
- `push-maybe-later.test.ts`: the notifications screen, Settings and `_layout` wiring.
- `friendsWiring.test.ts`: the friends screen after onboarding; no swipe back; declared routes; `friendsSeeMe` defaults off.
- `onboarding-names-copy.test.ts`: the basics and preferences copy about names and reveal.
- `onboarding-labels-and-caps.test.ts`: secondaries wired to `skip()`; the bio cap.
- `minor-no-dating-choices.test.tsx`: preferences hides Dating and orientation for minors.
- `edit-profile-age-floor.test.ts`: sign-in and basics use the 18 floor.
- `onboarding-writes-the-graph.test.ts`: details writes the graph.
- `onboarding-media-follows-draft.test.tsx`: media re-sends the stored photos.
- `rate-limited-says-the-wait.test.ts`: sign-in and forgot-password show the wait.
- `accountJourney.test.ts`: the `ErrorBoundary` contract.
- `accessibility.test.ts`: fixed-box text is capped; decoration is hidden from accessibility.

### B7. `app.json` / `app.config.js` and native configuration

- **Name and slug:** "Blend'n" / `blendn`. Orientation portrait. Scheme `blendn`. **`userInterfaceStyle: "dark"`** (`app.json:10`). The app also calls `Appearance.setColorScheme('dark')` (`_layout.tsx:57`).
- **Icon:** `./assets/logo/icon-ios.png`, 1024² RGB. It shows the white monogram outline on the orange-to-violet diagonal gradient.
- **iOS:**
  - `supportsTablet: true`;
  - bundle `com.matryxsociallabs.blendn`;
  - `usesAppleSignIn`;
  - associated domain `applinks:www.blendn.app`;
  - infoPlist: `CADisableMinimumFrameDurationOnPhone: true` (120Hz ProMotion; good for motion), location, motion, camera and photo usage strings, a Google URL scheme, and a UIScene manifest (SceneDelegate).
  - **There is no `ios.splash` key.**
- **Android:**
  - `adaptiveIcon`: foreground `adaptive-foreground.png` (white monogram), background `adaptive-background.png` (gradient), `backgroundColor` `#F05524`.
  - package `com.matryxsociallabs.blendn`.
  - blocked permissions `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW`.
  - intent filters: `https://www.blendn.app/f/*` (autoVerify) and `blendn://`.
  - **There is no `edgeToEdgeEnabled` and no `androidStatusBar` / `androidNavigationBar` key in app.json.**
- **Web:** metro bundler, static output, favicon `assets/images/favicon.png` (48², grey).
- **Plugins:**
  1. `expo-router`.
  2. **`expo-splash-screen`** with `{ image: ./assets/logo/monogram-gradient.png, imageWidth: 118, resizeMode: contain, backgroundColor: #0F0E0E, dark: { same image, 118, contain, #0F0E0E } }` (`app.json:94-108`).
  3. `@react-native-google-signin/google-signin` (iosUrlScheme).
  4. `expo-secure-store`.
  5. **`expo-notifications`** with `{ icon: ./assets/logo/monogram-white.png, color: #F05524 }`.
  6. `@sentry/react-native/expo`.
  7. `expo-asset`.
  8. `expo-video`.
- **Other config:** `experiments.typedRoutes: true`; EAS project `fa9b288d-…`.
- **`app.config.js`** only spreads app.json and injects `android.config.googleMaps.apiKey` from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **Runtime splash and status bar:**
  - `SplashScreen.preventAutoHideAsync()` and `SplashScreen.setOptions({ fade: true, duration: 200 })` (`_layout.tsx:70-71`).
  - The splash hides when images and fonts are ready, not on auth (`:146-148`).
  - Then `IntroAnimation`: 180ms black, `intro.webp` drawing over 1890ms, a hold, a 260ms fade; tap to skip; hidden from accessibility.
  - `<StatusBar style="light" />` (`_layout.tsx:490`).
- **Native folders are committed,** with drift from app.json:
  - `android/gradle.properties:77` has `edgeToEdgeEnabled=true`. `android/app/src/main/res/values/styles.xml` makes the status and navigation bars transparent and sets `windowSplashScreenBehavior` to `icon_preferred`.
  - `android/app/src/main/res/values/colors.xml` has **`splashscreen_background #000000`** (and in `values-night`), `iconBackground #1B1931`, `colorPrimary #023c69` and `notification_icon_color #F15524`. These do not match app.json's `#0F0E0E` and `#F05524`.
  - iOS `SplashScreenBackground.colorset` is `#0F0E0E` (it matches). `Info.plist`: `UIUserInterfaceStyle Dark`, `UIStatusBarStyleDefault`, `UIViewControllerBasedStatusBarAppearance false`.
  - With committed native projects, EAS builds use them as they are. A new splash or icon needs `expo prebuild` or hand edits, which `docs/PLACEHOLDER_SCREENS.md` §0 also says.
- **Installed but unused:** `expo-blur ~57.0.3` is in package.json and imported nowhere. Other relevant packages: `expo-linear-gradient`, `expo-haptics`, `react-native-reanimated 4.5.1`, `react-native-worklets 0.10.1`, `react-native-svg 15.15.4`, `react-native-gesture-handler ~2.32`, `expo-image`. Expo SDK 57, RN 0.86.3.
- **Android blur:** `expo-blur` on Android has historically needed an opt-in blur method and is costlier. `tasks/lessons.md:5` warns against `layout=` transitions on views containing a `BlurView`, which stuttered on device. Prototype the glass layer on a mid-range Android before committing.

### B8. Assets

| File | Format, size | Use |
|---|---|---|
| `assets/logo/icon-ios.png` | PNG 1024² RGB, 91 KB | App icon: white outline monogram on a diagonal gradient (`#EF5524 → #915CA6`) |
| `assets/logo/adaptive-foreground.png` | PNG 1024² RGBA | Android adaptive foreground (white monogram) |
| `assets/logo/adaptive-background.png` | PNG 1024² RGB | Android adaptive background, a diagonal gradient. Sampled: top-left `#EF5524`, centre `#C05965`, bottom-right `#915CA6` |
| `assets/logo/monogram-gradient.png` | PNG 453×534 RGBA | **The mark.** An outlined "B" monogram with a vertical gradient stroke (`#EF4B18` top → `#9869AD` bottom). Used for the native splash, the auth-loading holding state (`index.tsx:22`, 96pt), the `EventCover` fallback, and preloaded |
| `assets/logo/monogram-white.png` | PNG 453×534 RGBA | Notification icon (expo-notifications) |
| `assets/logo/monogram-white-bold.png` | PNG 453×534 RGBA | The tab bar's centre Blend'n disc, tinted `BRAND_INK #1B1931` (`app/(tabs)/_layout.tsx:62,246-249`) |
| `assets/logo/lockup-hero.png` | PNG 674×202 RGBA | Gradient monogram plus a white "Blend'n" wordmark, generated from the intro's last frame. Used on index at 60pt and on sign-in and forgot-password at 40pt |
| `assets/logo/lockup-white.png` | PNG 816×242 RGBA | All-white lockup. **Unused in code** (it was the old sign-in lockup) |
| `assets/logo/intro.webp` | Animated WebP 720×346, 658 KB | Intro animation: the monogram slides and the wordmark writes on. Generated by `scripts/build-intro-animation.sh` from a ProRes master |
| `assets/images/icon.png` | PNG 1024² 8-bit colormap | **The Expo template keyline-grid icon (light grey).** Still the `PhotoManager` image placeholder and preloaded |
| `assets/images/favicon.png` | PNG 48² | Web favicon |
| `assets/onboarding/curation.png` | PNG 512², 362 KB | AI copper-swirl render, the basics curation card. Not prefetched |
| `assets/onboarding/notifications.jpg` | JPG 512² | AI cracked ember orb, the notification illustration |
| `assets/onboarding/location-map.jpg` | JPG 512² | Dark city map with orange streets, the location illustration |
| `assets/onboarding/nearby-1/2/3.jpg`, `you.jpg` | JPG 152/162/128 × 192 | Stock portrait pins and the YOU marker |
| `assets/onboarding/looking-{dating,friendship,networking,travel,open}.jpg` | JPG 512² | Looking-for tiles. **Dating, Friendship and Networking contain baked-in app UI chrome and text**; Travel (a figure before orange and teal mountains) and Open (an orange swirl) are clean |
| `assets/fixtures/sample-clip-poster.jpg` | JPG 1280×720 | Preview fixture (`preview/scene.tsx:79`) |

- **No** `assets/fonts/`, no Lottie, no video files (`expo-video` is used for remote media), and no SVG icon set. `react-native-svg` is used only for city art (`components/cityArt/*`).
- Fonts come from npm packages (`@expo-google-fonts/*`).
- The monogram is raster-only. **Ask for an SVG or vector monogram** for the gradient mark at arbitrary sizes, for animating its stroke, and for a crisp glass-disc use.

### B9. Icon usage

**Libraries** (`@expo/vector-icons ^15.0.2`; imports across `app/`, `components/` and `lib/`):

| Library | Files importing | JSX uses | Notes |
|---|---|---|---|
| **Ionicons** | 66 | **146** (app 70 in 26 files; components 76 in 40 files; 4 in previews) | Plus 13 `keyof typeof Ionicons.glyphMap` type references |
| **MaterialIcons** | 5 (`BanterSections`, `PersonCard`, `SceneHero`, `SceneSections`, `lib/amenityTile.ts`) | 9 | `event`, `schedule`, `groups`, `person`, `more-horiz`, `location-on`, `play-arrow`, `expand-more`, plus `name={icon}` for **server-driven amenity icons** (`lib/amenityTile.ts:42-81`, fallback `check-circle`; preview uses `local-bar` and `camera`). This is the filled Material set |
| **AntDesign** | 1 | 1 | `google` mark on the entry screen (`index.tsx:339`). Google's guidelines want their multicolour asset |
| Feather, MaterialCommunityIcons, others | 0 | 0 | |

**Ionicons glyph names in use: 86 distinct.**

- **O** = `-outline` (50).
- **F-line** = a non-outline name for a line glyph, where the base and `-outline` draw essentially the same strokes; renaming is cosmetic, but check in the glyph viewer (13).
- **F-solid** = a genuinely filled glyph (23).
- The count is the number of string occurrences.

| Glyph | Type | n | Where (sample) |
|---|---|---|---|
| add | F-line | 3 | edit-profile:532, PhotoManager:408, BoardSections:390 |
| alert-circle | F-solid | 1 | Toast:53 |
| arrow-forward | F-line | 1 | EventDetailScreen:1225 (CTA icon) |
| arrow-undo | F-solid | 1 | SwipeToReply:57 |
| ban-outline | O | 1 | settings:406 |
| bookmark | F-solid | 1 | tab bar active (`(tabs)/_layout.tsx:82`) |
| bookmark-outline | O | 1 | tab bar idle |
| briefcase | F-solid | 1 | LookingForCards:45 |
| briefcase-outline | O | 2 | journey:131, PersonCard:243 |
| calendar-outline | O | 6 | events, going, nearby-events, PersonCard, MemoryTile, FeaturedCard |
| camera-outline | O | 1 | (tabs)/profile:133 |
| chatbubble | F-solid | 2 | PersonCard:161, RoomSections:289 |
| chatbubble-ellipses-outline | O | 2 | private-chat:1011,1035 |
| chatbubbles | F-solid | 1 | tab bar active |
| chatbubbles-outline | O | 5 | tab bar idle, chat:1109, board:385, ChatDock:224, EventDetailScreen:1226 |
| checkmark | F-line | 5 | event-preferences:218, **onboarding/ready:72**, PersonCard:209, CityArtCard:65, EventDetailScreen:1226 |
| checkmark-circle | F-solid | 1 | Toast:48 |
| checkmark-done-outline | O | 1 | settings:388 |
| chevron-back | F-line | 14 | **sign-in:223, forgot-password:167, OnboardingScreen:154, AppHeader:62**, chat, friends, nearby-events, SceneBarButton… |
| chevron-down | F-line | 5 | chat:1078, preview/room, private-chat, BlendnScreen, PulseHeader |
| chevron-forward | F-line | 10 | **settings:516**, profile, chat-info, friends, TonightView… |
| close | F-line | 8 | **onboarding/media:255**, edit-profile, event-preferences, f/[token], rate, PhotoLightbox… |
| close-circle | F-solid | 2 | PhotoManager:384, PulseHeader:207 |
| cloud-offline-outline | O | 8 | index:245, events, nearby-events, rate, LoadError, RoomVisibilityBanner… |
| compass | F-solid | 1 | LookingForCards:46 |
| construct-outline | O | 1 | PersonCard:249 |
| create-outline | O | 1 | EventDetailScreen:1582 |
| document-text-outline | O | 2 | about:27, profile:135 |
| ellipsis-horizontal | F-solid | 4 | friends/[userId], user/[id], BanterSections, BoardSections |
| ellipsis-vertical | F-solid | 2 | chat:170, private-chat:195 |
| exit-outline | O | 2 | chat-info:274, RoomLeftState:34 |
| eye-off-outline | O | 2 | **sign-in:370**, RoomVisibilityBanner |
| eye-outline | O | 4 | **sign-in:370, settings:383**, private-chat, RoomVisibilityBanner |
| finger-print | F-line | 1 | TonightView:254 |
| flag-outline | O | 4 | **about:29, settings:408**, chat-info, EventDetailScreen |
| flame | F-solid | 1 | tab bar active (Pulse) |
| flame-outline | O | 1 | tab bar idle |
| flash | F-solid | 1 | **PermissionIllustration:65** |
| hand-left-outline | O | 1 | private-chat:272 |
| heart | F-solid | 7 | **LookingForCards:43**, HeartIcon (liked), HeartPop, MatchMoment, PersonCard, RoomSections |
| heart-outline | O | 5 | HeartIcon (idle), PersonCard, EventDetailScreen, preview/scene |
| help-circle-outline | O | 2 | **settings:411, support:62** |
| images-outline | O | 1 | profile:134 |
| infinite | F-line | 1 | LookingForCards:47 |
| information-circle | F-solid | 1 | Toast:58 |
| information-circle-outline | O | 1 | settings:419 |
| link | F-line | 1 | InviteLinkCard:18 |
| link-outline | O | 1 | f/[token]:120 |
| location | F-solid | 2 | **ready:130, PermissionIllustration:134** |
| location-outline | O | 7 | **journey:116**, events, going, nearby-events, FeaturedCard, PulseHeader |
| lock-closed | F-solid | 1 | **OnboardingScreen:254** (footer note) |
| lock-closed-outline | O | 2 | **about:28**, board:353 |
| log-out-outline | O | 1 | settings:423 |
| mail-outline | O | 2 | **forgot-password:186, settings:412** |
| map-outline | O | 1 | NearbyEventCard:116 |
| megaphone-outline | O | 1 | EventDetailScreen:1590 |
| moon-outline | O | 1 | TonightView:386 |
| navigate | F-solid | 2 | events:2857, CityArtCard:73 |
| navigate-outline | O | 5 | **settings:389**, events, going, nearby-events, UpcomingCard |
| notifications-off-outline | O | 4 | chat, chat-info, BanterSections, NotificationBell |
| notifications-outline | O | 3 | **settings:398**, chat-info, NotificationBell |
| open-outline | O | 5 | **about:55, settings:516, support:67**, chat-info, EventDetailScreen |
| options-outline | O | 3 | preview/room, BlendnScreen, PulseHeader |
| paper-plane-outline | O | 1 | PersonCard:209 |
| pencil | F-solid | 1 | profile:422 |
| people | F-solid | 4 | **ready:133, LookingForCards:44**, chat:134, chat-info:256 |
| people-outline | O | 6 | **settings:391**, board, friends, PersonCard, BoardSections, UpcomingCard |
| person | F-solid | 1 | tab bar active (Me) |
| person-add | F-solid | 1 | profile:437 |
| person-add-outline | O | 3 | friends/index, friends/requests, RequestsRow |
| person-outline | O | 3 | tab bar idle, friends/[userId], user/[id] |
| radio-outline | O | 2 | EventDetailScreen:1226, preview/scene |
| remove | F-line | 1 | BoardSections:378 |
| rocket-outline | O | 1 | events:2619 |
| school-outline | O | 1 | **journey:171** |
| search | F-line | 3 | BanterSections:65,74, PulseHeader:179 |
| search-outline | O | 1 | events:2621 |
| send | F-solid | 1 | ChatComposer:124 |
| settings-outline | O | 1 | profile:597 |
| share-outline | O | 3 | going, EventDetailScreen, preview/scene |
| shield-checkmark-outline | O | 4 | **settings:407**, blocked-users, chat-info, RoomGuidelinesBanner |
| shuffle | F-line | 1 | RoomSections:181 |
| sparkles-outline | O | 1 | profile:136 |
| time-outline | O | 2 | NearbyEventCard, PersonCard |
| trash-outline | O | 2 | **settings:435**, EventDetailScreen:1598 |
| warning-outline | O | 1 | **ErrorBoundary:130** |

**Conflicts with the outlined-only brand rule:**

- The tab bar uses **filled-when-active** pairs (`flame`, `bookmark`, `chatbubbles`, `person`; `(tabs)/_layout.tsx:80-85`).
- `DESIGN_SYSTEM.md` prescribes a "saved / liked (heart, bookmark): filled glyph in `textPrimary`".

The brief needs a new active, selected and liked signal: weight, a gradient stroke, a dot, or a glass pill behind the icon.

**Line glyphs:** `chevron-*`, `close`, `add`, `remove`, `checkmark`, `search`, `link`, `infinite`, `finger-print`, `shuffle` and `arrow-forward` only need renaming to `-outline` if the lint is to enforce outline-only by name.

**MaterialIcons are filled.** `@expo/vector-icons`' MaterialIcons has no outlined family, so amenity icons need a mapping: MaterialCommunityIcons `-outline` names, or Ionicons equivalents in `lib/amenityTile.ts`.

**Lint gap:** the token linter's icon rule does not know AntDesign. An "outline-only" lint rule could whitelist `-outline` names, plus a list of line glyphs.

### B10. Hard-coded design exceptions (`// design-exception:`)

26 occurrences:

| Location | Value it covers | Reason given |
|---|---|---|
| `app/index.tsx:68` | `GOOGLE_FILL = '#FFFFFF'` | Google sign-in button fill, per Google's branding guidelines |
| `app/index.tsx:70` | `GOOGLE_INK = '#1F1F1F'` | Google sign-in button text and mark |
| `app/index.tsx:480` | `googleLabel: { fontSize: 21, fontWeight: '500' }` | sized to the system-drawn Apple button label (it has no size prop) |
| `app/index.tsx:508` | `emailLabel: { fontSize: 21, fontWeight: '500' }` | level with `googleLabel` and the Apple button |
| `app/(tabs)/_layout.tsx:77` | `BRAND_INK = '#1B1931'` | the logo's own ink, sampled from the artwork |
| `app/chat-info/[id].tsx:422` | `avatarGlyph: { fontSize: 20, lineHeight: 26 }` | emoji glyph sized to fill a 40pt disc |
| `app/private-chat/[conversationId].tsx:233` | `markGlyph: { fontSize: 20, lineHeight: 26 }` | emoji glyph sized to fill a 40pt disc |
| `app/onboarding/basics.tsx:344` | `curationArt … opacity: 0.6` | decorative art dimmed under its caption |
| `components/onboarding/OnboardingScreen.tsx:302` | `subtitle … maxWidth: 300` | a reading measure for the subtitle, from the frame |
| `components/onboarding/LookingForCards.tsx:112` | `art … opacity: 0.4` | decorative art dimmed under its label |
| `components/onboarding/PermissionIllustration.tsx:186` | `mapDim: { opacity: 0.4 }` | part of the drawing |
| `components/onboarding/PermissionIllustration.tsx:230` | `marginTop: -96` | half the ring's 192pt size, to centre it |
| `components/onboarding/PermissionIllustration.tsx:243` | `marginTop: -144` | half the ring's 288pt size |
| `components/onboarding/PermissionIllustration.tsx:245` | `opacity: 0.5` | part of the drawing |
| `components/LoadError.tsx:39` | `<Ionicons size={36}>` | the glyph tile's 36pt illustration in an 80pt tile |
| `components/chat/RoomLeftState.tsx:33` | `<Ionicons name="exit-outline" size={36}>` | the empty-state glyph tile's 36pt illustration |
| `components/chat/ReactionPicker.tsx:59` | `emoji: { fontSize: 24, lineHeight: 30 }` | emoji fills its 48pt disc |
| `components/chat/ChatBubble.tsx:340` | `avatarGlyph: { fontSize: 20, lineHeight: 26 }` | emoji fills a 40pt disc |
| `components/board/BoardSections.tsx:45` | `<Text style={markGlyph} maxFontSizeMultiplier={1}>` | emoji sized to a 40pt disc, fixed against Dynamic Type |
| `components/board/BoardSections.tsx:407` | `markGlyph: { fontSize: 20, lineHeight: 26 }` | emoji fills a 40pt disc |
| `components/banter/BanterSections.tsx:426` | `pseudonymGlyph: { fontSize: 26, lineHeight: 32 }` | emoji fills a 56pt disc |
| `components/profile/MemoryTile.tsx:57` | `<Ionicons name="calendar-outline" size={28}>` | decorative glyph standing in for a missing cover |
| `components/profile/ProfileSections.tsx:444` | `markGlyph: { fontSize: 128, lineHeight: 150 }` | emoji hero sized to fill the portrait |
| `components/scene/SceneSections.tsx:953` | `fontSize: 26, lineHeight: 32` | emoji fills the 48pt inner disc |
| `components/scene/SceneSections.tsx:974` | `cardBody … paddingBottom: 56` | 56 gap to the map band, pinned by `sceneCta.test.ts` (frame 1141:4901) |
| `components/scene/SceneSections.tsx:1063` | `paddingVertical: 15` | 15 lands the bordered pill on `CONTROL.lg` (56) |

Pattern: most exceptions are **emoji sizing** in pseudonym and avatar discs (a type role for "emoji in a disc" would retire 9 of them) and **decorative opacities** in onboarding art (named constants would retire 5).

### B11. `app/preview/*` harnesses (fixtures, deep link `exp+blendn:///preview/<name>`)

- `_layout.tsx`: a Stack with no header and a `fade` animation. Its comment says "Not gated behind `__DEV__`", but the root guard allows signed-out access only under `__DEV__` (`_layout.tsx:234`).
- `pulse.tsx`: the Pulse home feed against fixtures (frame `1141:4643`). Featured cards, carousels and section geometry. The original "screenshot harness".
- `scene.tsx`: the event detail "Scene" (frame `1141:4853`). Hero, bar buttons, amenities (Material icons), gallery, map, attendees, location card and the sticky CTA.
- `banter.tsx`: the Banter inbox. Live rooms, message requests, today and earlier conversations, search.
- `chat.tsx`: every kind of chat-room row (frame `1141:5498`). Bubbles mine and theirs, reply, edit, reactions, system notices, sponsored broadcast.
- `profile.tsx`: the attendee profile (frame `1141:5163`), with a revealed or anonymous toggle. Hero, gallery, bio, interests (shared ones highlighted with a gradient chip), actions.
- `room.tsx`: the room visibility banner in every state (longest pseudonym first; "named and blocked"), plus the room top bar with "Check out".
- `tonight.tsx`: the Blend'n screen's Tonight mode. Event deck, venue pass, worst-case long titles.
- `confetti.tsx`: the hold-to-check-in button plus `ConfettiBurst`, replayable, using `useInteractionFeedback().success`.
- `perf.tsx`: a render-cost table (mount, worst commit, commits per screen) from `lib/perf.tsx`. Not a design fixture.
- **There is no harness for sign-in, forgot-password, any onboarding step, Settings, About, Support, Toast, ActionTray or ErrorBoundary.** These screens depend on `useAuth` and `useOnboarding`, so a fixture route would need a mock user and draft.

---

## C. Material map for the glass redesign (entry system)

| Layer | Current | Redesign |
|---|---|---|
| Backdrop | Flat `EMBER.bg #0F0E0E` everywhere (root, stack `contentStyle`s, `OnboardingScreen`, About, Support) | Ambient orange (`#F05423`) and violet (`#8E4BAA`) orbs, slow drift, honouring Reduce Motion. Needs transparent `contentStyle` or a per-screen backdrop, and a rewrite of `pulsePalette.test` |
| Floating navigation | `AppHeader` (transparent row, 34pt title); `OnboardingScreen` header (back, progress, %) | Glass bar; progress track inside the glass |
| Floating controls | `OnboardingScreen` footer (opaque `bg`); sign-in segmented control; `EmberInlineToggle` pill; media photo pills | Glass dock and pills |
| Overlays | Toast (status tint on `surface`); `ActionTray` and `SettingsTray` (`surfaceSunken` sheet); `ErrorBoundary` (flat) | Glass toast and glass sheets; status as a tint |
| Content cards | `EmberCardSection`, ready profile, interests and summary, Settings card, About and Support rows, `PermissionIllustration`, `LookingForCards`, `InviteLinkCard`, prompt cards, `EmberToggle` row | Solid (`surface`, `surfaceSunken`, `surfaceMedia`); keep hairlines; keep radius 16/32 |
| Inputs and chips | `surface` pills, `textPrimary`-filled selected chips | Solid; add focus and selected motion |
| Gradient | None (flat `#FF906D` accent) | `EmberButton` primary only, plus the Blend'n mark (lockup, monogram, tab disc). Decide the CTA text colour (§0.4) |
| Icons | Ionicons, mixed filled and outline | Outline only; a new active-state signal |
| Type | Plus Jakarta Sans + Manrope | Satoshi (bundle locally; one family per weight) |
| Motion | Five isolated animations; native stack push | Staggered entrances; springy chips and buttons; animated permission illustrations; a celebration on ready; tokenised curves |
| Haptics | 1 screen | A `useInteractionFeedback` vocabulary on every control |
