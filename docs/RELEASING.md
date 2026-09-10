# Releasing

Push to `stage` → TestFlight and Play internal, against the staging API.
Push to `prod` → both stores, against production, waiting for a human.

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

Both EAS workflows start with a `verify` job — typecheck against the baseline,
then the full test suite — and both `build_ios` and `build_android` declare
`needs: [verify]`. A red suite stops the build before an EAS credit is spent,
and long before anything reaches a tester.

That gap was real and quiet. `ci.yml` fires on pull requests into `dev` and
pushes to `dev`; a push to `stage` or `prod` matched neither, so **the two
branches that actually ship were the two nothing checked.** They are on the
GitHub triggers now as well.

**Why the gate lives in the EAS workflow rather than reading a GitHub check.** A
green check is a fact about *a commit*. Gating on one means trusting that the
commit it describes is the commit about to be built — across two systems, one of
which can be down or slow. The `verify` job runs on the same machine, against
the same checkout, moments before the build. The GitHub run still happens; its
job is to report in the pull request, before the merge rather than after.

**The two platform chains stay independent of each other.** Both wait on
`verify` and neither waits on the other, so an iOS signing problem still cannot
stop Android testers getting a build.

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

The workflow YAML lives in `.eas/workflows/`, and Expo's GitHub App watches
branch pushes. The build runs on Expo's infrastructure and reads its
environment from EAS.

**No secret is stored in GitHub — not even `EXPO_TOKEN`.** The previous setup
(`.github/workflows/deploy-ios.yml`, now deleted) needed one. This repository is
public today and may go private later; neither changes anything here.

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
> had uncommitted.

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
SDK version, and this project is on **SDK 53**, so `auto` resolves to
`macos-sequoia-15.6-xcode-16.4`. Every build made that way carries:

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

**Upgrading the SDK is not the fix here.** SDK 54 was tried on 2026-08-11 and
rolled back with reasons — it raised the advisory count from 25 to 29 and
Reanimated 4 removed `sharedTransitionTag`, which six components use. See
`SECURITY_RELIABILITY_BACKLOG.md`.

Pin the image instead, on both profiles in `eas.json`:

```json
"ios": { "image": "macos-sequoia-15.6-xcode-26.0" }
```

**The lowest Xcode 26 image, deliberately.** Newer ones exist —
`macos-tahoe-26.5-xcode-26.6` is paired with SDK 57 — and the further the jump
from SDK 53, the likelier some native module fails to compile. Take the smallest
step that satisfies Apple.

**Confirmed working, 2026-08-12.** SDK 53 / React Native 0.79.6 compiles cleanly
under Xcode 26.0, submits without 90725, and reaches TestFlight. The pairing was
an open question when the pin was made (#79) and is not one any more — so an SDK
upgrade is not required to satisfy Apple's deadline, and the rollback recorded in
`SECURITY_RELIABILITY_BACKLOG.md` stands.

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
