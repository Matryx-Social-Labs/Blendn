# Releasing

Push to `stage` → TestFlight and Play internal, against the staging API.
Push to `prod` → both stores, against production, waiting for a human.

> **Since 2026-09-28 `stage` does not ship itself.** The Expo free plan's builds
> for the month are spent, so the `ship` job is off and a `stage` push runs
> `verify` and stops. The commit then ships from a Mac with
> `npm run ship:local`. See [Shipping `stage` from a Mac](#shipping-stage-from-a-mac).

**A push means a promotion PR merged with a merge commit.** Since 2026-09-27 a
ruleset makes `stage` and `prod` take changes only through a pull request from
`dev` (or `stage` → `prod`), checked by `promotion source`
(`.github/workflows/promotion.yml`). Nobody can push to them directly, delete
them, or force-push them, admins included. Every `stage` merge spends EAS
builds, so promote when a build is wanted, not on every dev merge.

Nobody downloads an `.ipa` or an `.aab`, and nobody opens Transporter.

```
            ┌─ iOS     ──► TestFlight
  stage ────┤                                    (staging-api.blendn.app)
            └─ Android ──► Play, internal track

            ┌─ iOS     ──► App Store Connect ──► you press Submit for Review
  prod  ────┤                                    (api.blendn.app)
            └─ Android ──► Play, production track as a DRAFT ──► you roll out
```

The two platforms are independent chains in each workflow. An iOS signing
problem does not stop Android testers getting a build.

## Second developer, from zero

Getting someone else building on their own machine. The whole thing is about
twenty minutes; the two items marked **⚠️** are what otherwise eat a morning,
because both fail in ways that do not name themselves.

### Do not share the Expo login

`app.json` sets `owner: matryx-social-labs-private-limited`, which is an
**organisation**, not a personal account. So the answer to "should I give them
the account with the keystore on it" is no — **invite them to the org** (Expo
dashboard → Organisation → Members) and they run their own `eas login`.

Membership gets them, without anyone sending anything:

| | |
|---|---|
| **The keystore** | EAS holds credentials server-side per project. A member builds with the upload key without the file ever reaching their laptop |
| **Environment variables** | The `preview` and `production` EAS environments resolve for them the same way |
| **Attribution** | Builds are theirs in the dashboard, and access is revocable in one click |

A shared login technically works and costs you all three. It also means relaying
2FA codes forever. And there is a specific reason to keep the number of people
holding that account small: **the Android upload key has already been lost
once** — see *The upload keystore* below, which is the only irreversible thing
in this document.

### Setup

```bash
git clone … && cd ashgabat
npm install
cp .env.example .env
```

**⚠️ Then edit `.env`.** `EXPO_PUBLIC_API_BASE_URL` is required, and without it
the app **crashes before the first screen** — `lib/apiClient.ts` throws at module
scope. It does not degrade, it shows no error, and the file is gitignored, so
the symptom is a build that dies instantly for no visible reason. Point it at
`https://staging-api.blendn.app` unless they are running the API locally.

Nothing else in `.env.example` is a secret. Everything prefixed `EXPO_PUBLIC_`
is compiled into the bundle — see *Environment variables* below for why that is
not a leak and what the actual rule is.

### ⚠️ Xcode 27: `expo run:ios` cannot find the Simulator, and the Pods are too old for it

Two things that cost an afternoon on 2026-09-21, both on a stock Xcode 27.0
install:

1. **There is no `Simulator.app` any more.** The simulator window lives in
   `Xcode.app/Contents/Applications/DeviceHub.app`. Expo looks the old app up
   by name and stops with *"Can't determine id of Simulator app; the Simulator
   is most likely not installed"* — after it has installed the Pods. Devices
   still boot headless (`xcrun simctl boot <udid>`); open DeviceHub to see
   them. A Simulator process left over from the previous Xcode may still be
   running from a path that no longer exists — kill it, it is what makes
   `open -a Simulator` look half-alive.
2. **Xcode 27's minimum deployment target is 15.0**, and several Pods
   (`GoogleUtilities`, `PromisesObjC`, `GoogleSignIn`, the `react-native-maps`
   privacy target) still declare 9.0–12.0. The build fails in the Pods project
   before a line of app code compiles.

So build the simulator app with `xcodebuild` directly and pass the floor on
the command line — the Podfile is untouched, and the binary is the same one
`expo run:ios` would have produced:

```bash
xcrun simctl boot <udid>                       # e.g. iPhone 17 Pro, iOS 26.5
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild \
  -workspace ios/blendn.xcworkspace -scheme blendn \
  -configuration Release -sdk iphonesimulator \
  -destination "id=<udid>" -derivedDataPath ios/build -quiet build
xcrun simctl install <udid> ios/build/Build/Products/Release-iphonesimulator/blendn.app
xcrun simctl launch  <udid> com.matryxsociallabs.blendn
```

`Release` bundles the JS, so no Metro is needed and the app reads `.env` —
which points at **staging**. A `Debug` configuration needs `npx expo start`
running alongside.

Driving it: the Maestro **CLI** (2.10, needs JDK 17 on `PATH`) with one batched
flow per journey; the MCP's embedded driver stalls on the first XCUITest
snapshot when the host load is high. `hideKeyboard` does not work on iOS —
tap a static label to dismiss, and tap the eye icon before typing a password
(a secure field swallows `inputText` otherwise).

### ⚠️ Android needs JDK 17, and the JDK on the machine is probably wrong

The React Native Gradle plugin cannot parse a Java version above the low
twenties. **Android Studio currently ships JDK 25** and Homebrew's `openjdk` is
26, so the obvious choices both fail — and the error names the plugin rather
than the cause:

```
Error resolving plugin [id: 'com.facebook.react.settings']
> 25.0.2
```

That trailing number is the Java version. Gradle usually has a 17 already
provisioned:

```bash
export JAVA_HOME=$(find ~/.gradle/jdks -maxdepth 3 -name Home -type d | head -1)
"$JAVA_HOME/bin/java" -version   # want 17.x
```

If that finds nothing, install any JDK 17 and point `JAVA_HOME` at it.

They also need **`android-36`** in the SDK Manager. The app targets API 36, so
35 alone will not configure.

### Then build locally, not on EAS

```bash
npx expo run:android      # emulator or USB device
npx expo run:ios --device
```

This is the whole workflow for testing. See *Testing does not need EAS at all*
below — it is free, unlimited, and the same binary shape, and it is what keeps
the fifteen-a-month EAS quota for the thing only EAS can do.

**iOS on a real device** additionally needs them added to the Apple Developer
team. The simulator does not.

### The two `development` profiles, and why there are two

`ios.simulator` is a boolean and the project needs both answers, so there are
two profiles rather than one that gets flipped:

| Profile | `ios.simulator` | For |
|---|---|---|
| `development` | `true` | The simulator. **The Maestro agents drive this one**, so it is the default |
| `development-device` | `false` | Installing on a physical iPhone |

```bash
eas build --profile development         # simulator .app
eas build --profile development-device  # installable on a real device
```

`development-device` is `extends: development`, so everything except that one
boolean is inherited and the two cannot drift.

This is written down because the flag was flipped to `false` once to fix device
installs, which silently broke simulator builds for the test agents — a single
boolean cannot serve both, and nothing in the repo recorded which case it was
set for. Android needs no equivalent: a development APK installs on an emulator
and a handset alike.

### ⚠️ Sentry fails a *release* build on a fresh clone, and it is not a warning

`android/sentry.properties` and `ios/sentry.properties` are gitignored, so a new
clone does not have them. This section previously said a build without them
"warns and carries on". **That is wrong for release builds**, and it was
corrected after a second developer hit exactly this.

What actually happens, from `@sentry/react-native/sentry.gradle`:

```groovy
"--auth-token", sentryProps.get("auth.token") ?: System.getenv("SENTRY_AUTH_TOKEN")
```

With neither, `sentry-cli` is handed nothing, the upload task fails, and the
**build fails with it**.

**Which builds hit it, and which do not:**

| | Bundles JS? | Sentry upload runs? |
|---|---|---|
| `npx expo run:android` / `run:ios` (debug) | no — Metro serves it | **no**, unaffected |
| A local **release** build, or any APK/AAB | yes | **yes — fails without a token** |
| EAS | yes | fine; the token is an EAS environment variable |
| `eas build --local` (`npm run ship:local`) | yes | **yes — fails without a token**: it is a `secret` EAS variable, which local builds do not get. The script disables the upload unless the shell has one |

So the documented testing path is genuinely unaffected, which is why this went
unnoticed. `bundleInDebug` is not set in `android/app/build.gradle`, so React
Native's default holds and bundling is release-only.

**The escape hatch**, for a local release build when you do not want to upload
source maps at all:

```bash
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:android --variant release
```

`sentry.gradle` gates the upload task on that variable with an `onlyIf`, so it
becomes a no-op rather than a failure. The alternative is `SENTRY_AUTH_TOKEN` in
the environment, or being sent the two `sentry.properties` files — but a local
release build has no reason to be publishing source maps to the shared Sentry
project, so prefer disabling it.

The runtime DSN is separate and unaffected: it is `EXPO_PUBLIC_SENTRY_DSN`, and
crash reporting works without any of the above.

### One file that does not matter

There is no `google-services.json` or `GoogleService-Info.plist` in this repo and
none is needed; push goes through Expo's service.

### Building a branch other than `stage` or `prod`

**`dev` triggers no workflow.** Only `stage` and `prod` do, which is deliberate —
see the workflow files. To put a `dev` build on someone's phone, run it by hand
from a `dev` checkout:

```bash
eas build --profile preview --platform android
```

`preview` is `distribution: internal` against the staging API, so it installs
directly and never touches Play.

## Nothing builds until the suite is green

**`stage`.** A push runs `.github/workflows/ci.yml`. Its `verify` job runs the
typecheck against the baseline, the full test suite and lint. Only if that
passes does its `ship` job run
`eas workflow:run .eas/workflows/stage-testflight.yml --ref <that sha>`.
The EAS workflow has no trigger of its own and no test job. It is the two
build → submit chains and nothing else. **The `ship` job is off for now**: it
runs only when the repository variable `EAS_CLOUD_SHIP` is `true`, and it is
unset. [Shipping `stage` from a Mac](#shipping-stage-from-a-mac) is the route
meanwhile, and it holds to the same gate.

**`prod`.** Unchanged. `.eas/workflows/prod-appstore.yml` triggers itself on
the push and starts with its own `verify` job, which both builds `need`.

**Why `stage` moved the gate to GitHub.** We are on the free tier, and every EAS
job waits for the one worker slot. The old `verify` job on EAS meant queueing
just to repeat what GitHub was already running, and then queueing again for
each build and each submit. The build credit was never at risk. The hours were.

**Why this is not "reading a GitHub check".** The old objection holds: a green
check is a fact about *a commit*, and gating on one means trusting that commit
is the one about to be built. Here nothing reads a check. The run that tested
the SHA is the run that hands that same SHA to EAS, and `--ref` builds it from
GitHub rather than from an upload. The commit EAS records is the one `verify`
passed.

**Where to look when a `stage` deploy fails.** On the `stage` commit's checks,
open **ship to TestFlight + Play internal**. Each part is its own step:

| Step | A failure here means |
|---|---|
| Expo account | `EXPO_TOKEN` is missing or revoked. Replace the repo secret. |
| Start the EAS workflow | EAS refused the run. The step log has its message. |
| Wait for the builds and submits | A build or submit job failed. The log shows each job's state changes with timestamps, then the last 200 lines of every failed job. The run summary has the job table and the EAS link. |
| … "EAS run is ACTION_REQUIRED" | EAS stopped for a person, for example Apple needs an agreement accepted. Nothing is broken; finish it on the linked EAS page. |
| … "EAS run unreadable" | Ten minutes of failed status reads: the token, the run id, or the network. |

A red `verify` means `ship` never ran and nothing was built.

**Retrying without a new push.** Use `eas workflow:run
.eas/workflows/stage-testflight.yml --ref <sha>`, or re-run it from the EAS
dashboard. This skips GitHub, so only do it for a commit whose `verify` already
passed.

**The two platform chains stay independent of each other.** Neither waits on
the other, so an iOS signing problem still cannot stop Android testers getting
a build.

## Shipping `stage` from a Mac

The route while the EAS quota is spent. It is the same release made on local
hardware: the same `staging` profile, the same signing credentials and version
counter held by EAS, the same `eas submit`. `eas build --local` spends no build
credit.

```bash
git fetch origin && git switch --detach origin/stage
npm ci                              # eas-cli reads the app config, whose plugins live in node_modules
npm run ship:local                  # both platforms; or `-- ios`, `-- android`
npm run ship:local -- --dry-run     # the checks and the commands, nothing built
```

`scripts/ship-local.sh` **refuses** unless, after a fetch, HEAD is
`origin/stage`, the working tree is clean, and GitHub's `typecheck + test +
lint` check passed on that SHA. So "ship exactly what CI tested" still holds,
and the build is made from a git archive of the commit, so nothing uncommitted
could reach it anyway. Then, one platform after the other (16 GB will not hold
two release builds), four steps each:

1. **Toolchain.** For iOS, the Xcode that `eas.json` names (below). All of
   these are checked for both platforms before either builds, so a missing one
   refuses its platform before the version counter moves.
2. **Build.** `npx --yes eas-cli@24.8.0 build --local --platform <p> --profile staging --non-interactive …`
3. **Smoke test.** The build is launched, and stays up for 30 seconds, or it
   is not submitted (below).
4. **Submit**, up to three tries.
   - **iOS goes straight to App Store Connect** with Apple's `xcrun altool
     --upload-app`, when the App Store Connect API key is on this Mac at
     `~/.appstoreconnect/private_keys/AuthKey_F234C2B22X.p8` (chmod 600, never
     in the repo). It is the same key EAS uses for submissions: key
     `F234C2B22X`, issuer `45a73825-a8a9-4741-9b94-6ad6aa2bc726`. Override with
     `ASC_KEY_ID` / `ASC_ISSUER_ID`. Build 120 sat 40 minutes in the free plan's
     EAS Submit queue without starting; altool uploaded it in 2.5.
   - Without the key, and always for Android, it's
     `npx --yes eas-cli@24.8.0 submit --platform <p> --profile staging --path <file> --non-interactive`.
     Play's service-account key exists only on EAS.

A failure on one platform does not stop the other, as in the cloud workflow. It
ends with a table (platform, build, smoke, submit, artifact) and exits non-zero
if anything failed.

**What lands in `dist/`**, which is gitignored:

| File | |
|---|---|
| `blendn-<sha>-staging-ios.ipa` | What went to TestFlight |
| `blendn-<sha>-staging-android.aab` | What went to Play internal |
| `blendn-<sha>-staging-android-mapping.txt` | R8's mapping, to retrace a native Java crash. EAS kept this as a build artifact; now it is here |
| `smoke-<sha>-ios.png`, `smoke-<sha>-android.png` | The screen 30 seconds after launch, from the smoke test |
| `ship-<sha>.log` | Everything the run printed, appended per run |

### Build 118, and the Xcode rule

On 2026-09-28 `npm run ship:local` built iOS **build 118** (`4611f1d`) on a Mac
whose only Xcode was 27.0, and submitted it. On an iPhone running iOS 27.0 it
**crashes at launch**: `EXC_BREAKPOINT` in UIKitCore,
`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. An app linked
against the iOS 27 SDK must adopt the UIScene lifecycle, and ours still uses the
classic AppDelegate window: `ios/blendn/AppDelegate.swift` (`ExpoAppDelegate`,
`var window`), and no `UIApplicationSceneManifest` in `Info.plist`.

Cloud builds never met this. `eas.json` pins the image
`macos-tahoe-26.5-xcode-26.6`, so they use Xcode 26.6 and the iOS 26.5 SDK, which
does not demand scenes. **`eas build --local` ignores `image`** and uses
whatever Xcode the Mac has, so the local route had silently changed toolchain.
The `.ipa` said so, for anyone who looked: `DTXcode` 2700, `DTSDKName`
`iphoneos27.0`. Android build 23 from the same run was fine, and was launched
before anyone relied on it. Build 118 was never launched before it was
submitted, and that is the bigger failure.

**The rule: a local iOS build uses the Xcode in `eas.json`'s image.** The
script reads the version from the `staging` profile's `ios.image`
(`…-xcode-26.6` → 26.6), looks for an Xcode of that major.minor (`DEVELOPER_DIR`
if set, then every `/Applications/Xcode*.app`), and exports `DEVELOPER_DIR` to
it for the build. `xcode-select` is not touched. The Xcode it used is the
`Xcode:` line at the top of the log, and the smoke test checks that the `.ipa`'s
`DTXcode` matches it. If there is none it refuses iOS, before building, and says how to get
it; Android still ships:

```bash
brew install xcodesorg/made/xcodes && xcodes install 26.6   # asks for an Apple ID
```

or `Xcode_26.6.xip` from <https://developer.apple.com/download/all/>, moved to
`/Applications/Xcode-26.6.app`. Several Xcodes live side by side; nothing else
needs to change. When `eas.json` moves to a new image, the Mac needs that Xcode
too.

`--allow-xcode <version>` builds with another installed Xcode anyway, under a
loud warning in the log. **Only after the smoke test below passes on a device
running the newest iOS.** The simulator catches this class of crash only when
its runtime is that new: on 2026-09-28 an Xcode 27 build of `dev` crashed in the
smoke test on the iOS 27.0 simulator with build 118's exact exception, and an
Xcode 26.6 build of the same commit passed there. On an iOS 26 runtime both
would have passed.

**The long-term fix is to adopt the UIScene lifecycle** (a scene manifest in
`Info.plist` and a scene delegate that owns the window, which Expo's
`ExpoAppDelegate` has to support too), before Apple starts requiring the iOS 27
SDK for App Store Connect uploads, as it required iOS 26's on 28 April 2026 (see
*Xcode 26 is required for TestFlight too*, below). Not done yet; it is a
follow-up. Until then Xcode 27 cannot build this app for release.

### Nothing is submitted until it launches

After each build, before its submit. A failed smoke test leaves the build
unsubmitted and the table says `smoke fail`.

On both platforms the launch is the Maestro flow
[`.maestro/smoke/launch.yaml`](../.maestro/smoke/launch.yaml): open the app
from clean and wait up to 60 seconds for the signed-out screen's "Continue with
email". It passes only if that flow passes, **and** the app is still running
30 seconds later, **and** nothing crashed. The flow is one launch and one
assertion because on iOS the Maestro driver has crashed the app when a flow does
more, and it gets one retry with a three-minute driver start-up, because under
host load Maestro's iOS driver times out. The crash checks cover both tries.
Maestro's own output, with the flow's screenshot, is in
`dist/smoke-<sha>-<platform>-maestro/`.

**Android.** `bundletool build-apks --mode=universal` makes an APK from the
`.aab`, signed with `~/.android/debug.keystore`. It goes on the running
emulator, or the script boots `Blendn_A34` (`SMOKE_AVD` to change it) with
`-gpu host -no-snapshot-save -no-boot-anim` and waits for `sys.boot_completed`.
It installs, waits for `pm path` to answer and then 10 seconds more, and runs
the flow. The wait is not decoration: launching straight after an install on a
fresh boot threw a `NullPointerException` in `handleBindApplication` for a
build that was fine, because the package-install broadcast was still going
round. Alive is `pidof`; a crash is anything for the package in
`logcat -b crash`, which is cleared first. Then a screenshot, and the app is
uninstalled. Any copy of
the app already on the emulator is uninstalled first, since one signed another
way refuses the install.

**iOS.** The `.ipa` is signed for the store and runs on neither a simulator nor
an unregistered device, so the smoke test builds the same commit again for the
simulator: Release, the same `DEVELOPER_DIR`, and the same EAS environment
(`eas env:exec preview …`, so `EXPO_PUBLIC_*` point at staging as in the real
build). It does this in a temporary `git worktree` of the commit with a clone of
`node_modules`, because `pod install` rewrites the committed `ios/Podfile.lock`
and `ios/blendn.xcodeproj/project.pbxproj`, and it deletes
`Pods/.last_build_configuration` first: a Release build that segfaults in Hermes
at launch has picked up Debug Hermes. The app goes on a new simulator on the
newest iOS runtime installed, which is deleted afterwards along with the
worktree. Alive is a PID for the app in the simulator's `launchctl list`; a
crash is a new report for it in `~/Library/Logs/DiagnosticReports`. If it died, the script
waits up to a minute for the report, which a busy Mac writes late, and prints
its path and exception. It adds a full Release
build to the run, about as long as the device build.

To run either on its own, against something already built:

```bash
npm run ship:local -- --smoke-only android dist/blendn-<sha>-staging-android.aab
npm run ship:local -- --smoke-only ios      # builds HEAD for the simulator
```

`--skip-smoke` submits without launching, and refuses unless
`--i-launched-it-myself` is given with it. Both are written to the log.

Android is built with an artifacts directory, not `--output`: eas-cli 24.8.0
copies the profile's `buildArtifactPaths` to the `--output` path too, after the
`.aab`, so the mapping would replace the bundle.

**What the Mac needs.** The script checks the tools before it starts, so a
missing one fails before the version counter moves.

| | |
|---|---|
| Xcode | **The version in `eas.json`'s `staging` image**, 26.6 today, not a beta. Others may be installed beside it. See *Build 118, and the Xcode rule* |
| iOS simulator runtime | The newest iOS, for the smoke test: `xcodebuild -downloadPlatform iOS` with the newest Xcode. The newest installed is used |
| CocoaPods | `pod` on `PATH` |
| fastlane | `brew install fastlane`. The iOS build runs it |
| Android SDK + NDK | `ANDROID_HOME`, default `~/Library/Android/sdk`, with `ndk/`, `android-36`, `platform-tools` and `emulator` |
| An emulator | Running, or the AVD `Blendn_A34` (`SMOKE_AVD`), for the smoke test. Android Studio makes `~/.android/debug.keystore` with the first debug build |
| bundletool | `brew install bundletool`, for the smoke test |
| Maestro | The CLI on `PATH` (2.10), for the smoke test. It wants JDK 17 |
| JDK | 17 or 21 on `JAVA_HOME` (see the JDK section above; 25 and up fail) |
| eas-cli | Logged in as a member of the org (`npx eas-cli login`). The script pins 24.8.0, as CI does |
| gh | Logged in, to read the check |

**Three things differ from a cloud build.**

1. **Sentry.** `SENTRY_AUTH_TOKEN` is a `secret` EAS variable, and a local build
   is not given secret variables. Without it both release builds fail: the
   Android `SentryUpload` task, and on iOS the bundle phase, which
   `sentry-xcode.sh` exits 1. So unless `SENTRY_AUTH_TOKEN` is set in the shell,
   the script sets `SENTRY_DISABLE_AUTO_UPLOAD=true` and says so. That build's
   JS stack traces stay minified in Sentry and its iOS native crashes stay
   unsymbolicated. Crash reporting still works. To upload, export an
   organisation token as `SENTRY_AUTH_TOKEN`; `SENTRY_ORG` and `SENTRY_PROJECT`
   still come from the `preview` environment.
2. **`EXPO_PUBLIC_*`.** eas-cli lets the shell override the EAS environment, so
   a `.env` sourced into the shell would ship a staging build pointed at
   localhost. The script unsets every `EXPO_PUBLIC_*` first; `preview` decides.
3. **Xcode.** The cloud picks it from `image`; here the script does, above.

**Version numbers stay in step.** `autoIncrement` with `appVersionSource:
remote` works for a local build. eas-cli bumps the counter on EAS before it
hands the job to the local builder, on the same code path as a cloud build, and
the build uses that number. So submitting a local build does not desynchronise
the counter the way a hand upload does (below). A local build that fails after
the bump leaves a gap in the numbers, which both stores accept.

**Turning the cloud route back on:** set the repository variable
`EAS_CLOUD_SHIP` to `true` (Settings → Secrets and variables → Actions →
Variables, or `gh variable set EAS_CLOUD_SHIP --body true`). The next `stage`
push runs `ship` again, and nothing else changes. `npm run ship:local` keeps
working as a fallback. Do not ship one commit both ways: that is two builds of
one commit on each platform.

## What the app's tests actually cover

309 tests across 19 suites, and **every one of them tests a pure function** —
`lib/presence.ts`, `lib/roomButton.ts`, `lib/likes.ts`, `lib/onboarding.ts`,
`lib/city.ts` and the rest. Nothing renders a component.

That is worth stating plainly, because it sets what CI can and cannot catch.
Green means the *decisions* are right: who gets checked out of a room, what the
centre button offers, whether a like can be double-sent, which city a browse is
scoped to.

It says nothing about layout. Every visual bug that has reached a device on this
project — a `+` glyph sitting low, chips wrapping a row early, an illustration
flying off screen — is in a class these tests structurally cannot see, because
there is no layout engine in the test environment to be wrong. **That class
needs a device**, which is why device passes are part of the definition of done
and not a nicety.

## Why EAS Workflows and not GitHub Actions

The workflow YAML lives in `.eas/workflows/`. The build runs on Expo's
infrastructure and reads its environment from EAS. For `prod`, Expo's GitHub App
watches the branch push. For `stage`, GitHub Actions starts the workflow after
CI passes (above).

**`EXPO_TOKEN` is a GitHub secret again, for `stage` only.** Only the `ship`
job reads it, and that job runs only on a push to `stage`. Pull requests from
forks never receive repository secrets. The build still reads its own
environment from EAS; the token only starts the run and reads its status.

That file also triggered on `v*.*.*` tags with `--profile production`, so a tag
cut from `stage` would have pushed a staging build at the App Store record. Two
systems on one app is worse than either alone.

## How long a build actually takes, on the plan we are on

**We are on the EAS free tier**, which is 15 iOS and 15 Android builds a month,
one concurrency, and a **low-priority queue that can wait 90+ minutes at peak**.
The build itself is ~15 minutes; the queue is the variable.

That is worth stating plainly because it is why this pipeline exists at all.
Before it, iOS builds were made **locally in Xcode and uploaded by hand**,
precisely because somebody was sitting there watching the EAS queue and it was
faster to do it themselves.

**The queue stops mattering once nobody is waiting on it.** A merge that lands
in TestFlight 90 minutes later, unattended, beats a 20-minute build that costs a
person their afternoon. Wall-clock is cheap when it is not attached to a human;
attention is not.

Upgrade to **Starter ($19/mo — high-priority queue, $45 of build credit)** when
the wait or the build cap actually bites, and not before.

**The cap is fifteen merges a month, not seven.** An earlier version of this
paragraph halved it by treating 30 as a shared pool. The limits are **per
platform** — 15 iOS *and* 15 Android — and a merge to `stage` spends one of
each, so fifteen merges is the ceiling.

### Testing does not need EAS at all, and this is the part that protects the quota

```bash
npx expo run:ios --device      # compiles locally, installs on a plugged-in iPhone
npx expo run:android           # emulator, or a USB device
```

**Unlimited, free, and the same binary shape EAS produces** — the native
directories are committed, so nothing about a local build is a rehearsal.
Push notifications, GPS check-in and Google Sign-In all work on a locally-built
device install.

So the rule is:

| | |
|---|---|
| Verifying something yourself | `expo run:*` — costs nothing, do it freely |
| Getting a build to someone else | EAS — this is the only thing the quota buys |

**EAS builds are for distribution, not confidence.** Framed that way, fifteen a
month is generous: it is fifteen *tester-facing drops*, not fifteen chances to
check your own work.

> **Do not go back to hand-built Xcode uploads.** It is how the Android upload
> key was lost (below), and a build made on a laptop carries whatever that laptop
> had uncommitted. `npm run ship:local` is the exception, because it has neither
> problem: EAS holds the keys and lends them to the build, which runs in a
> temporary directory, and it refuses anything but a clean `origin/stage`.

## What decides which API a build talks to

The `environment` key on the build profile in `eas.json`, and nothing else.

| Profile | EAS environment | `EXPO_PUBLIC_API_BASE_URL` |
|---|---|---|
| `staging` | `preview` | `https://staging-api.blendn.app` |
| `production` | `production` | `https://api.blendn.app` |

The URL is **not** in `eas.json` and **not** in the workflow YAML. One value in
two places is a value that will eventually disagree with itself.

`autoIncrement` is on both profiles because App Store Connect refuses a build
number it has seen, and both profiles submit to the same app record
(`ascAppId 6757761059`). TestFlight and the App Store are the same app — a
TestFlight build is one that has not been released.

## Environment variables — the prefix decides everything

**`EXPO_PUBLIC_*` variables are compiled into the JavaScript bundle.** Anyone
who installs the app can unzip the `.ipa` and read every one. This is true of a
private repo, a public repo, and a repo that does not exist. **The repository
was never the exposure. The binary is.**

So the rule is not "hide them better", it is **never put a secret behind that
prefix**. Everything below is stored `plaintext` in EAS:

| | Secret? | |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | no | A hostname |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | no | Public by design |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | no | Already in `app.json` and `Info.plist` in the clear |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | **billable** | Restrict it — see below |
| `EXPO_PUBLIC_DISABLE_DEBUG_LOGS` | no | |
| `EXPO_PUBLIC_SENTRY_DSN` | no | A DSN only permits *writing* events; it is meant to ship in clients |
| `EXPO_PUBLIC_APP_ENV` | no | A label on Sentry events |
| `EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORMS_ENABLED` | no | Dead — the app has no Supabase dependency. Listed so it reads as a leftover, not a mystery |

Marking these `secret` in EAS would be worse than useless: it hides them from
you and your own CLI while leaving them fully readable in the shipped app, and
it breaks `expo start` locally.

### Three that have no prefix, and one of those is a real secret

Sentry needs more than the DSN. Uploading source maps happens on the **build
machine**, not in the app, so these deliberately lack `EXPO_PUBLIC_` and
therefore never enter the bundle:

| | Visibility | |
|---|---|---|
| `SENTRY_ORG` | plaintext | `matryx-social-labs-private-lim` |
| `SENTRY_PROJECT` | plaintext | `blendn` |
| `SENTRY_AUTH_TOKEN` | **`secret`** | Writes to the Sentry org. The one genuinely secret value in this setup |

`SENTRY_AUTH_TOKEN` is an **Organization Token** (Sentry → Settings → Developer
Settings → Organization Tokens), not a personal one. Org tokens carry only
CI-scoped permissions; a personal token carries everything its owner can do.
Stored `secret`, so it is unreadable in the dashboard and the CLI, and exists
only inside a build — which is exactly right, because unlike the `EXPO_PUBLIC_*`
values there is no copy of it in the shipped app to undermine the effort.

**Why org and project are needed as variables at all:** `ios/sentry.properties`
and `android/sentry.properties` carry them locally, and both are **gitignored**.
EAS checks out the repo, so those files are simply absent there. Without the
variables the upload step cannot resolve the project and fails quietly, leaving
crash reports full of minified stack traces — which is close to having no crash
reporting while looking like you do.

**Sentry is one project across both environments.** `lib/sentry.ts` tags each
event with `EXPO_PUBLIC_APP_ENV`, so staging and production separate inside
Sentry. A second project would split the issue history for nothing.

**Missing the DSN degrades cleanly** — `lib/sentry.ts` returns early and the app
runs fine, silently reporting nothing. That is the failure mode to watch for: it
looks identical to an app that simply is not crashing.

**The Maps key is the hardest of the eight to protect, and the reasons are
specific.** This section has been wrong twice; what follows is what was actually
checked in the console on 2026-08-12.

`EventDetailScreen.tsx:1580` calls `maps.googleapis.com/maps/api/staticmap`
directly from the device. That is a **web service**, not a mobile SDK.

**An iOS/Android app restriction is offered, and it is conditional.** The console
does present "iOS apps" and "Android apps" for this key — an earlier version of
this document claimed otherwise and was wrong. But per Google's
[API security best practices](https://developers.google.com/maps/api-security-best-practices),
a web service only honours it when the request carries the right header:

| Platform | Header the request must send |
|---|---|
| iOS | `X-Ios-Bundle-Identifier` |
| Android | `X-Android-Package` **and** `X-Android-Cert` |

**The app sends none of these today.** It builds a URL string and hands it to
`expo-image` as `{ uri }`. So applying the restriction before shipping the
headers takes the map from *grey* to *broken*.

Two further constraints, both found the hard way:

1. **One key restricts to one platform.** An app restriction is *either* iOS
   *or* Android, never both — so app-restricting means **two keys and two env
   vars**, with the app choosing by `Platform.OS`.
2. **`X-Android-Cert` is the signing certificate SHA-1, which differs between a
   debug build and a Play-distributed one** (`5E:8F:16…` vs `28:30:4F…`) — the
   same split that broke Google Sign-In. A hardcoded value breaks the map in
   whichever case it does not match. iOS has no equivalent problem.

**There is no daily quota cap.** Google removed them for Maps Platform APIs, so
the ceiling this document previously recommended does not exist. Check for a
**per-minute** limit, which does survive and at least throttles someone hammering
the key.

So what actually bounds the damage today:

- **API restriction** → *Maps Static API only*, so a lifted key cannot be spent
  on anything more expensive. **Applied.**
- **A billing budget alert**, low. Reactive — it reports the spend, it does not
  stop it.

**The verification that matters, if app restrictions are ever applied:** Google
says to *"verify that requests with **incorrect** application identifiers are
rejected"*, because *"application restrictions may not be fully supported on
older legacy Google Maps Platform services"* — and Static Maps is legacy. If the
endpoint ignores the header, the app keeps working and the restriction does
nothing, which looks exactly like success. The only honest test is a `curl` with
a **wrong** bundle id that must fail.

**The proper fix, not done here:** proxy the request through `blendn-admin`,
which already exists and can hold the key server-side. That is also Google's own
recommendation when the verification above fails. With no quota cap available,
this is worth more than it was.

The genuinely secret things never touch the repo either way — the App Store
Connect API key (`.p8`) and the iOS distribution certificate both live on EAS
servers, uploaded once through `npx eas-cli credentials`.

### Setting them

`eas` is not installed globally in this repo — it is `npx eas-cli`. And it is
`env:set`, not `env:create`: the latter is deprecated, and `env:set` upserts, so
re-running it is safe.

```bash
set -a; source .env; set +a     # the client ids, without retyping them

# The one value that differs between the two — the whole point of the split
npx eas-cli env:set --environment preview    --name EXPO_PUBLIC_API_BASE_URL --value https://staging-api.blendn.app --visibility plaintext
npx eas-cli env:set --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.blendn.app          --visibility plaintext

# Identical in both
for E in preview production; do
  npx eas-cli env:set --environment $E --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID" --visibility plaintext
  npx eas-cli env:set --environment $E --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "$EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID" --visibility plaintext
  npx eas-cli env:set --environment $E --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY  --value "$EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"  --visibility plaintext
  npx eas-cli env:set --environment $E --name EXPO_PUBLIC_DISABLE_DEBUG_LOGS   --value 1 --visibility plaintext
done

npx eas-cli env:set --environment preview    --name EXPO_PUBLIC_APP_ENV --value staging    --visibility plaintext
npx eas-cli env:set --environment production --name EXPO_PUBLIC_APP_ENV --value production --visibility plaintext
```

`.env.example` is the manifest — eight variables, cross-checked against the
source in both directions.

> **`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is currently unset everywhere**, including
> local `.env`. `EventDetailScreen` interpolates it straight into a Static Maps
> URL, so the request goes out as `key=undefined` and Google returns an error
> image. The map on event detail is broken today, and would be broken for
> testers. Because these bake in at build time, adding the key later needs a new
> build — so set it before the first one.

> A build with no `EXPO_PUBLIC_API_BASE_URL` **crashes before the first screen
> renders** — `lib/apiClient.ts` throws at module scope. It does not degrade, it
> does not show an error screen. If a TestFlight build dies instantly on launch,
> check this first.

## Android

Play's `internal` track is the TestFlight equivalent: testers you name, no
review, available in minutes.

**Production uploads as a `draft`.** Nothing rolls out until somebody opens
Play Console and releases it. This matters more on Android than on iOS: the App
Store has a review queue between a mistake and the public, and Play does not. A
merge to `prod` without `releaseStatus: draft` would reach every Android user
directly.

### ⚠️ The upload keystore, which is the one irreversible thing here

Android signing is not like iOS. An iOS distribution certificate can be revoked
and regenerated in a minute. **An Android upload key cannot** — if Play has ever
accepted a build signed with a key you no longer hold, uploads are rejected
(*"signed with the wrong key"*) and the only remedy is a reset request to Google
Play support, which takes days.

Because the Expo project moved accounts, the keystore from any previous Android
build lives in the **old** account (`@matrixsociallabs/blendn`), and a new
project generates a fresh one.

**Checked, 2026-08-12: an upload key IS registered, and we do not hold it.**

Play has `Blend'n` / `com.matryxsociallabs.blendn` with internal-testing release
**3 (1.0.0)**, live to testers since 15 Feb 2026. The old Expo account
(`@matrixsociallabs/blendn`) has no Android keystore at all — so that build was
made **locally**, and the keystore is on somebody's machine rather than in any
Expo account.

A first read of the Expo credentials suggested nothing had ever been built. That
was wrong, and the reason is worth keeping: **Expo only knows about builds EAS
made.** The store is the source of truth for what has shipped, not the build
service.

**This is recoverable.** Play App Signing has been mandatory for every app
created since August 2021, so Google holds the *app signing key* — the one that
can never be replaced — and we only need an *upload key*, which is just proof of
identity.

**Resolved, 2026-08-12: the original key is gone, so it was reset.**

The person who made the 15 Feb build had stopped using EAS entirely — free-tier
queues were slow, so iOS went out through Xcode by hand — and no longer knows
where the keystore is. There was nothing to import.

What was done instead, and what to repeat if it ever happens again:

```bash
KT="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool"

# 1. A fresh upload key. -validity 10000 matters: Google requires the key
#    stay valid past October 2033, and the default is far shorter.
"$KT" -genkeypair -v -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000

# 2. The certificate Google needs, in PEM.
"$KT" -export -rfc -keystore upload-keystore.jks -alias upload \
  -file upload_certificate.pem

# 3. Hand the keystore to EAS, so it lives in a service and not on a laptop.
npx eas-cli credentials --platform android
#   → production → Keystore → Set up a new keystore
#   → Generate a new Android Keystore? NO → path to upload-keystore.jks
#   → Key alias: upload   (not the CLI's "EAS Android" placeholder)
#   → Key password: the same one — PKCS#12 has no separate key password
```

Then **Play Console → Help → Contact support → upload key reset**, attaching the
PEM. Only the **Play account owner** can submit it; Google turns it round in a
day or two. Resetting the upload key does not touch the app signing key, so
nobody who already installed release 3 is affected, and Google Sign-In keeps
working — it is keyed to the *app signing* certificate Google holds, not this
one.

Android Studio ships the JDK, so `keytool` needs no separate install. The path
above is the bundled one; there is no `java` on the PATH of this machine.

**Back up the keystore and its password to a password manager**, then delete the
local `.jks` and `.pem`. EAS holds it, but a keystore existing in exactly one
place is what caused all of this.

The self-service form is the whole flow — **Test and release → App integrity →
Protected with Play → App signing → Request upload key reset**. No support ticket
is needed. The page then reads *"There is a pending request…"*, and the upload
key fingerprints shown on it swap to the new ones when Google completes it, which
is how you know without waiting for the email. 48–72 hours.

### ⚠️ Three certificates, and Google Sign-In only accepts one of them

Android has **three different signing certificates** in play here, and confusing
them breaks Google Sign-In in a way that is close to undebuggable.

| Certificate | SHA-1 | Signs |
|---|---|---|
| **App signing** (Google holds it) | `28:30:4F:51:91:BB:58:D7:5C:EC:D6:97:C3:2B:46:AE:F3:6C:56:D1` | **every build a user installs** |
| Upload key | ours, resettable | the AAB we hand to Play, and nothing else |
| Debug (`android/app/debug.keystore`) | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` | local and emulator builds |

**Google re-signs everything.** Whatever key we upload with, what lands on a
phone is signed with *Google's* app signing key — so that is the fingerprint an
Android OAuth client must carry. The upload key never signs anything a user runs
and is irrelevant to OAuth.

**Found 2026-08-12, and it had been broken the whole time.** The only Android
OAuth client (`Blendn-Android`) carried the **debug** fingerprint. So Google
Sign-In worked on every machine anyone would debug it on, and failed on
everything installed from Play — including release 3, live to internal testers
since 15 Feb 2026. The failure is `DEVELOPER_ERROR` / `code 10`, which names no
certificate and reads like a bug in the auth code.

**Two OAuth clients, one per certificate**, which is the intended design:

| Client | SHA-1 | For |
|---|---|---|
| `Blendn-Android` | debug `5E:8F:16…` | `expo run:android`, emulators |
| `Blendn-Android-Play` | app signing `28:30:4F…` | TestFlight-equivalent and production |

Neither client id appears in the app — Android signs in with the **web** client
id. The Android clients only need to *exist* and match, or Google refuses the
request. That is exactly why this is invisible in code review.

This is the Android twin of the iOS `$(EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)` bug
fixed in #72: different cause, same shape — **works locally, dead in a real
build, error message points nowhere near the truth**.

### Google Play service account

`eas submit` needs this to talk to Play, exactly as it needs the ASC API key for
Apple. **An existing app record and an existing build do not remove the need for
it** — those say the app exists, this is how a machine gets in.

**Google Cloud Console:**

1. **IAM & Admin → Service Accounts** → **Create service account**. Name it and
   **Create and close** — skip the "grant roles" step; it needs no project role.
2. Select it → **Keys → Add key → Create new key → JSON** → **Create**.
3. **APIs & Services → Library** → **Google Play Android Developer API** →
   **Enable**. Easy to miss, and without it every submit fails with a permission
   error that does not mention the API.

**Play Console — under Users and permissions, not API access:**

4. **Users and permissions → Invite new users**, with the service account's
   email from the JSON (`…@….iam.gserviceaccount.com`).
5. Grant, under **App access** and **Releases**: view app information
   (read-only) · edit and delete draft apps · release to production, exclude
   devices, and use Play App Signing · release apps to testing tracks · manage
   testing tracks and edit tester lists · manage store presence.

**Then:**

```bash
npx eas-cli credentials --platform android
# → production → Google Service Account → Upload a Google Service Account Key
```

Do **not** put the JSON path in `eas.json`. A path only works on the machine
holding the file, which is the opposite of what a workflow needs — and unlike
the `EXPO_PUBLIC_*` values, this one is a real secret.

### R8 is on for release builds, and it can break a build that compiles

Play Console scored bundle 15 **"DEX code optimisation: Low"**: 2% obfuscated,
no optimisation, no shrinking, 31.2 MB of uncompressed DEX. R8 had never run.
`android/app/build.gradle` reads `android.enableProguardInReleaseBuilds` and
`android.enableShrinkResourcesInReleaseBuilds`, nothing set either, and both
fell through to `false`. They are now set in `android/gradle.properties` (not
through `expo-build-properties`: see "The native directories are committed"),
and the release build type uses `proguard-android-optimize.txt`. Plain
`proguard-android.txt` carries `-dontoptimize`.

Play's figures for bundle 15, against a local R8 build of `dev` at 5390f5b
(`r8.json` in the bundle, below):

| | bundle 15 | R8 on |
|---|---|---|
| Uncompressed DEX | 31.2 MB | 8.4 MB |
| Obfuscated | 2% | 84% |
| Optimised | – | 83% |
| Shrunk | – | 83% |

On **SDK 57** (React Native 0.86, Expo modules 57) the same build is 13.8 MB of
DEX, about 82% obfuscated / optimised / shrunk: more Kotlin ships, the ratio holds.

**The first R8 build crashed before its first screen, and the error pointed at
the wrong thing.** The crash read:

```
TypeError: Cannot read property 'ErrorBoundary' of undefined
    at ContextNavigator … at ExpoRoot
```

That is expo-router finding `app/_layout.tsx` undefined. Metro reports a
module that throws while loading to the global error handler and hands back
`undefined`; Sentry's handler takes that first error, so it never reaches
logcat, and the `ErrorBoundary` line is only the aftermath. With the Sentry DSN
blanked the real error showed:

```
Call to function 'ExpoSplashScreen.setOptions' has been rejected.
→ The 1st argument cannot be cast to type expo.modules.splashscreen.SplashScreenOptions
→ java.lang.NullPointerException
```

Every JS object passed to an Expo module becomes a Kotlin `Record`, filled field
by field from each property's `@Field` annotation. No class in the app
implements `Field`, because the runtime supplies annotations as proxies. So R8's
optimiser decided a `Field` value could only be null, and compiled the per-field
loop to `throw null`. `dexdump` of the converter showed exactly that. This is
expo/expo#28010, whose answer was `-dontoptimize` for the whole app.
`android/app/proguard-rules.pro` keeps Expo's annotation types instead
(`-keep @interface expo.modules.**`), and everything stays optimised.

A first guess, keeping the optimiser off kotlin-reflect, built and changed
nothing: the next launch crashed the same way. Read the disassembly before
writing a keep rule.

**So an R8 change, or a new native dependency, is tested by launching a release
build, never by it compiling:**

```bash
cd android
SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew bundleRelease assembleRelease \
  -PreactNativeArchitectures=arm64-v8a      # one ABI: R8 does not care, and it is 4x faster
adb install -r app/build/outputs/apk/release/app-release.apk
```

Then drive it, because a class R8 broke fails only when something first calls
it. Two things a local release build cannot show, whatever R8 does. It is signed
with the debug keystore, so Google Maps logs `Authorization failure` and draws
an empty grid: the Android key only accepts the Play signing certificate. And it
has no Firebase config, so there is no push token. Check both on the Play
internal-track build.

**On SDK 57 the emulator cannot soak the Pulse.** Media3 1.9 decodes feed video
with the emulator's host-side decoder (`c2.goldfish.h264.decoder`; the host log
prints `[h264 @ …] no frame!`), and after a few minutes of it the emulator's
network and then the guest hang, and the emulator exits. The app is doing
what it should — one player at a time, released between clips, visible in logcat
as `ExoPlayerImpl Init` / `Release` pairs. Sign-in, the Pulse and navigation can
be driven on the emulator; leave long feed-video sessions to a phone. While a
video plays, `uiautomator dump` (and Maestro's view hierarchy) also stall, because
the screen never goes idle. If it crashes:

- **Build a control without R8** from the same checkout:
  `-Pandroid.enableProguardInReleaseBuilds=false -Pandroid.enableShrinkResourcesInReleaseBuilds=false`
  on the same command. It launches → R8 is the cause. It crashes too → R8 is not.
- **Blank `EXPO_PUBLIC_SENTRY_DSN`** in `.env.local` and delete
  `android/app/build/generated/assets/createBundleReleaseJsAndAssets` so the JS
  re-bundles without Sentry. The first error then reaches logcat. Put the DSN
  back afterwards.
- **Bisect** with `proguard-android.txt` (optimiser off). If that launches, the
  optimiser is the cause and a keep rule scoped to the affected package is the fix.
- **Read what R8 produced** before choosing that rule. Look up the class's
  obfuscated name in `app/build/outputs/mapping/release/mapping.txt`, then
  disassemble it:
  `unzip -o app/build/outputs/apk/release/app-release.apk classes.dex -d /tmp/r8 && "$(ls -d $ANDROID_HOME/build-tools/* | tail -1)/dexdump" -d /tmp/r8/classes.dex`.
  A `throw` where a call used to be means R8 proved something null that isn't.

**Checking a build without Play Console:**

```bash
AAB=android/app/build/outputs/bundle/release/app-release.aab
unzip -l $AAB | grep -E '\.dex$' | awk '{s+=$1} END {print s}'      # DEX bytes
unzip -p $AAB BUNDLE-METADATA/com.android.tools/r8.json              # the percentages Play shows
unzip -l $AAB | grep obfuscation/proguard.map                        # the mapping Play reads
```

**Resources.** The resource shrinker cannot see JS asking for an image or a font
by name, but React Native's bundle step writes `res/raw/keep.xml` listing every
JS asset, so none are removed. `mapping/release/resources.txt` ends with the
"Unused resources are:" list if that is ever in doubt.

**Crash reports.** Play reads the R8 mapping from inside the bundle, so Android
vitals stays readable with no upload. Sentry does not: a *native Java* crash in
Sentry shows obfuscated names. JS errors are unaffected (Hermes bytecode, not
R8). EAS keeps each store build's `mapping.txt` as a build artifact
(`buildArtifactPaths` in `eas.json`); download it from the build page and
retrace with it. Uploading it automatically needs the Sentry Android Gradle
plugin, which is not installed.

**Rollback** is both properties back to `false`. The next build is the old one.

**Not fixable here:** Play's "R8 configuration: upgrade to AGP 9.0" row. React
Native pins AGP (8.12.0 on SDK 57), so that row stays "–" until an SDK ships AGP 9. iOS has no
equivalent score; Xcode's Release defaults already optimise and strip.

## One-time setup

1. **App Store Connect API key.** Users and Access → Integrations → App Store
   Connect API → Team Keys → **+**, role **App Manager**. Download the `.p8`
   once — Apple never shows it again. Note the Key ID and Issuer ID.
2. **`npx eas-cli credentials --platform ios`** — upload that key, and let EAS create a
   distribution certificate. Apple caps you at 2; revoking one does **not**
   affect builds already on TestFlight or the App Store, but does break any
   other pipeline still signing with it.
3. **Connect GitHub to EAS** — dashboard → project → GitHub → install the Expo
   GitHub App on `Matryx-Social-Labs/Blendn`. **This is the step that is easy to
   skip**, and without it the workflow files sit there doing nothing.
4. **Environment variables**, above.
5. **Restrict the Maps key**, above.
6. **Android keystore and Play service account**, above.
7. **Set the remote version counters above what the stores already have** — see
   below. Skipping this makes the first automated build on each platform fail
   at submit, after it has already spent the build minutes.

## ⚠️ `eas credentials` writes to Apple from whichever branch you are standing in

**This cost a build on 2026-08-12 and will cost another one.**

`eas credentials` does not only read. It **syncs capabilities on the App ID** —
shared state at Apple, affecting every branch and every build — from the
`app.json` in your current working directory.

What happened: credentials were set up from `~/conductor/repos/blendn`, which
sits on `prod`. That branch has no `usesAppleSignIn` and no
`com.apple.developer.applesignin` entitlement, so EAS did as it was told:

```
✔ Synced capabilities: Disabled: Sign In with Apple
```

The build then ran from a `dev` worktree, where the native project **does**
declare that entitlement. The provisioning profile had been minted without it,
and fastlane refused to sign:

```
Provisioning profile "…" doesn't support the Sign in with Apple capability.
Provisioning profile "…" doesn't include the com.apple.developer.applesignin entitlement.
```

Nothing was wrong with the code. The credentials were simply configured from a
branch 61 commits behind the one being built.

**So: run `eas credentials` from a checkout of the branch you intend to
build**, and read the `Synced capabilities:` line rather than skimming past it.
It is the tool telling you what it just changed at Apple.

Recovering is straightforward once you know: re-run from the right branch (you
want `Enabled:` this time), then **regenerate the provisioning profile** —
answer *no* to "reuse the original profile", because a profile minted under the
old capability set does not acquire the new entitlement.

## ⚠️ Xcode 26 is required for TestFlight too, and `auto` will not pick it

Since **28 April 2026**, Apple refuses **any upload to App Store Connect** built
with anything older than Xcode 26. EAS's default `image: auto` chooses by Expo
SDK version; on **SDK 53** it resolved to `macos-sequoia-15.6-xcode-16.4`. Every build made that way carries:

> *This build can no longer be submitted to the App Store.*

**Read that warning as blocking TestFlight, not just the App Store.** It says
"App Store", the build succeeds, and `eas submit` reports success — then the
upload is rejected asynchronously and the failure arrives by email:

```
90725: SDK version issue. This app was built with the iOS 18.5 SDK.
All iOS and iPadOS apps must be built with the iOS 26 SDK or later,
included in Xcode 26 or later, in order to be uploaded to App Store
Connect or submitted for distribution.
```

Nothing in the CLI output tells you. Build 102 went through the whole pipeline —
built, submitted, "scheduled" — and died in App Store Connect afterwards.

**On SDK 57 the pin is `macos-tahoe-26.5-xcode-26.6`, on both profiles in
`eas.json`.** SDK 57 needs Xcode 26.4 or newer (`expo-doctor` checks
`>=26.4.0`), so the Xcode 26.0 image that carried SDK 53 through Apple's deadline
can no longer build it. This is the image Expo pairs with SDK 57.

```json
"ios": { "image": "macos-tahoe-26.5-xcode-26.6" }
```

**A build on a Mac does not read that pin.** `eas build --local` uses the Mac's
Xcode, which is how build 118 came out of Xcode 27 and crashed at launch on
iOS 27. `npm run ship:local` now finds the pinned Xcode itself: see
[Build 118, and the Xcode rule](#build-118-and-the-xcode-rule).

SDK 57 also raised the iOS deployment target to **16.4** (`ExpoModulesCore`
requires it), which is set in `project.pbxproj` and the Podfile. Do not pass
`IPHONEOS_DEPLOYMENT_TARGET=15.1` to a local `xcodebuild` any more: Swift pods
built for 16.4 will not link into a 15.1 target.

## The native directories are committed, and that has a cost

`ios/` and `android/` are in git, and they carry hand-fixes for real EAS build
failures (`DEFINES_MODULE=YES` for the Expo pod, among others). So `expo
prebuild` does **not** run on EAS.

**Changing `app.json` plugins, icons or `infoPlist` therefore has no effect on a
build.** Whoever changes them must run `expo prebuild` locally and commit the
regenerated native files — and check that the hand-fixes survived.

This is why `ios/blendn/Info.plist` holds the Google client id literally rather
than `$(EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)`. That placeholder is Xcode
build-setting interpolation, resolves against nothing on EAS, and would have
shipped a build where Google Sign-In failed with an error that reads like a code
bug.

## Building locally — encouraged. Uploading by hand — no.

**For anyone who has been building in Xcode or Android Studio and uploading by
hand.** That was the right call before this pipeline existed; free-tier EAS
queues are slow and it is faster to do it yourself than to watch one. It is the
wrong call now, and the reason is specific rather than a matter of taste.

### ⚠️ Register a new device on the web first, not in Xcode

**The first `expo run:ios --device` on any new phone fails**, and the error names
signing rather than the actual problem:

```
error: No profiles for 'com.matryxsociallabs.blendn' were found: Xcode couldn't
find any iOS App Development provisioning profiles matching ... Automatic
signing is disabled and unable to generate a profile.
```

Two separate things are missing, and only the second one is obvious:

1. **The device is not registered to the team.** EAS creates an *App Store
   distribution* profile; running on a connected phone needs a *Development*
   profile, which cannot exist until the device's UDID is on the team.
2. **`expo run:ios` does not pass `-allowProvisioningUpdates`**, so xcodebuild is
   not permitted to create one even when everything else is right.

Opening the project in Xcode gets further and then stops at:

> *Device X is not registered to your team. Devices must be registered in order
> to run your code, but you do not have permission to register them.*

**Register it on developer.apple.com instead.** *Certificates, Identifiers &
Profiles → Devices → +*, with the UDID that `expo run:ios --device` printed
(`› Using --device 00008110-…`). Then **Try Again** in Xcode's Signing &
Capabilities and it mints the profile itself.

**Signing out of Xcode and back in does not fix it** — tried, 2026-08-12.
Registering a device needs a right that reading the team and creating profiles
does not, so an account can be a full App Store Connect Admin, see the Devices
list on the portal, add a device there by hand, and still have Xcode refuse to
do it on their behalf. Go around it rather than at it.

Do this once per tester phone. There are 100 development device slots a year.

### Building locally still works, and nothing here changed that

```bash
npx eas-cli env:pull --environment preview      # staging  → .env.local
npx eas-cli env:pull --environment production   # production
npx expo run:ios      # or: open ios/blendn.xcworkspace
npx expo run:android
```

`env:pull` is the part people skip. The eight `EXPO_PUBLIC_*` variables are
gitignored and **`lib/apiClient.ts` throws at module scope without
`EXPO_PUBLIC_API_BASE_URL`** — no error screen, no degraded mode, the app dies
before the first frame. Without EAS org access, ask for `.env.example` filled
in; every value in it is public by construction, since they are compiled into
the bundle and readable from any installed build.

**Do not run `expo prebuild`.** `ios/` and `android/` are committed and carry
hand-fixes for real build failures (see the section above). Prebuild regenerates
over them.

### Uploading by hand breaks the pipeline — not your build, the pipeline

`appVersionSource: "remote"` means **EAS holds the build number** and
`autoIncrement` bumps *its own* counter. A manual upload raises the number the
store has seen without EAS knowing. The next automated build then picks a number
the store already has and is **rejected at submit — after the full build has
run**, which on the free tier is a queue slot plus fifteen minutes to learn
nothing.

This is the same failure that got `.github/workflows/deploy-ios.yml` deleted.
Two systems on one app record is worse than either alone.

`npm run ship:local` is not a hand upload in this sense. It builds with
`eas build --local`, which takes its number from the EAS counter and bumps it,
and uploads with `eas submit`. See [Shipping `stage` from a Mac](#shipping-stage-from-a-mac).

| | |
|---|---|
| Build locally to debug | **Yes.** Nothing conflicts |
| Upload to TestFlight or Play by hand | **No.** Desynchronises the counter |
| Had to anyway | Run `npx eas-cli build:version:set --platform ios` (or `android`) afterwards to resync — and knowing to do this is the fragile part |

### What a laptop build takes with it

A build made on one machine carries whatever that machine had uncommitted, and
this repo has already paid for that twice:

- `android/app/build.gradle` signs `release` with `signingConfigs.debug`, which
  Play rejects. So the 15 Feb release came from local changes that never reached
  the repo.
- The Android upload key went the same way — generated on one machine, never
  backed up, and eventually unrecoverable. It cost a reset request to Google.

**Before stopping local uploads, run `git status` and `git diff` and send
whatever is there.** Not to review it — to find out what has been keeping builds
working that nobody else has.

### What changed on the Apple account, and what it does to you

Setting up EAS credentials touched shared Apple state. None of it breaks a local
build:

| | Effect on a local builder |
|---|---|
| A second Apple Distribution certificate | None — additive. Yours stays in your Keychain and stays valid |
| A new provisioning profile | None — profiles coexist, and Xcode automatic signing manages its own |
| Sign In with Apple **disabled** on the App ID | None today — the app does not use it. It is a Guideline 4.8 risk for App Store review, tracked separately |

## The version counters start from zero, and the stores do not

`appVersionSource: "remote"` means EAS keeps the build number, and
`autoIncrement` bumps it. **A new EAS project starts that counter fresh**, while
the stores remember everything the old project uploaded:

| | Store already has | So the counter must start above |
|---|---|---|
| Play | `versionCode 3` (internal, 15 Feb 2026) | 3 |
| App Store Connect | the TestFlight builds shipped over the last 6 months | the highest of those |

Left alone, the first automated build submits a number the store has seen and is
rejected — *after* the build has run, so it costs the full build time to learn
nothing.

Set them once, before the first build:

```bash
npx eas-cli build:version:set --platform android   # e.g. 10
npx eas-cli build:version:set --platform ios       # above the highest in ASC
```

Round up rather than picking the exact next number. Version codes are free and a
gap costs nothing; a collision costs a build.

## Getting builds to testers

Both stores have the same three-rung ladder — a small trusted group with no
review, a larger invited group behind a review, and a public one. The names
differ and the limits differ; the shape does not.

```
            fast, private, no review        invited, reviewed        public
  iOS       Internal (100)             →    External (10,000)   →    App Store
  Android   Internal (100)             →    Closed              →    Open / Production
```

**Start on the left and stay there** until the app is worth a stranger's time.
The rungs exist so that the people who will forgive a broken build see it first.

### iOS — TestFlight

**Internal testers — up to 100, no review, minutes.** This is the round to run
now.

1. App Store Connect → **Users and Access** → add each person by Apple ID email.
   They must exist here first; TestFlight draws from this list.
2. **TestFlight → Internal Testing** → create a group → add them → attach the
   build.
3. They install **TestFlight** from the App Store and accept the invite.

Each tester can use up to 30 devices, and **builds expire after 90 days**, so a
round that runs long needs a fresh build rather than a nudge.

**External testers — up to 10,000, behind a Beta App Review.** The first build of
each version waits ~24h, and **Test Information is mandatory**: what to test, a
feedback email, a marketing URL and a privacy policy URL. A public link can be
generated once approved, which is how you invite people whose Apple ID you do
not know.

Export compliance is already handled — `ITSAppUsesNonExemptEncryption: false` is
in the Info.plist, so there is no per-build encryption questionnaire.

### Android — Play Console

**Internal testing — up to 100, no review, minutes.** The TestFlight-internal
equivalent, and where `submit.staging` already points (`track: internal`).

Play Console → **Testing → Internal testing** → **Testers** → create an email
list, or point it at a **Google Group**. A group is worth the two minutes: you
add and remove people in Google Groups afterwards without touching Play Console
at all.

Testers then use the **opt-in URL** on that page. Nothing installs until they
click it — a build sitting on the track is invisible to someone who never opted
in, which is the single most common "it didn't work" on Android.

**Closed testing** is the next rung, and on Android it is more than a
convenience:

> **Check whether your Play account is a personal or an organisation account.**
> Personal accounts created after 13 November 2023 must run a **closed test with
> at least 12 testers, opted in continuously for 14 days**, before they can
> apply for production access. Organisation accounts are not subject to it.
>
> This is a two-week wall or nothing at all, depending on an account setting, so
> it belongs in the plan before the launch date does. Matryx Social Labs is a
> company, so we expect to be exempt — **verify rather than assume**.

**Open testing** is public and requires production access first.

### What to give a tester

Two logins, because the product has two faces:

| | |
|---|---|
| The app | a seeded attendee — `roomseed-<handle>@blendn.invalid` |
| The dashboard | `roomseed-organiser@blendn.invalid` at `staging-dashboard.blendn.app` |

Both come from `blendn-admin` `npm run seed:room`, and the password is whatever
`SEED_ROOM_PASSWORD` was set to on that run. The organiser account is a verified
organisation owning the seeded event, so the dashboard is **editable**, not just
visible.

Point them at `docs/TESTING_CHECKLIST.md` rather than asking "does it work". It
names what to do, what correct looks like, **and what the bug looked like** — so
a failure is recognisable instead of a judgement call.

## Promoting a build to the App Store

1. Merge `stage` → `prod`.
2. Wait for the workflow. The build appears in App Store Connect.
3. In ASC: create the version, attach screenshots and release notes, answer App
   Privacy, set the age rating (**17+**, which dating features force), and add
   the review demo account (`npm run seed:review` in `blendn-admin`).
4. Submit for review.

Step 3 is manual on purpose. It is the one point where somebody should look at
what is about to reach the public.
