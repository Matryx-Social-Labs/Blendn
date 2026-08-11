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

## Environment variables, and why none of them are secret

**`EXPO_PUBLIC_*` variables are compiled into the JavaScript bundle.** Anyone
who installs the app can unzip the `.ipa` and read every one. This is true of a
private repo, a public repo, and a repo that does not exist. **The repository
was never the exposure. The binary is.**

So the rule is not "hide them better", it is **never put a secret behind that
prefix**. All eight are stored `plaintext` in EAS:

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

**The Maps key is the one real action item, and it has nothing to do with the
repo.** It will be readable inside every build forever, so the mitigation is a
Google Cloud Console restriction: application → iOS bundle
`com.matryxsociallabs.blendn` and the matching Android package; API → only the
Maps SDKs. Do this before the first TestFlight build, because afterwards the
unrestricted key is already in other people's hands.

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

**Checked, 2026-08-12: there is nothing to inherit.** The old account
(`@matrixsociallabs/blendn`) has Apple distribution certificates and an empty
Google Service Account Keys section, and no Android keystore at all — so no
Android build was ever made through EAS and nothing was ever submitted to Play
from it.

So this project generates a fresh keystore, which is clean. **From the moment it
exists it becomes the only key that can ever update the app on Play** — back it
up somewhere that is not one laptop and not one Expo account:

```bash
npx eas-cli credentials --platform android    # → Keystore → Download
```

If you are reading this after a future account move, redo the check above before
generating anything. The rule that made it safe this time was that nothing had
shipped yet, not that Android keystores are replaceable.

### Google Play service account

`eas submit` needs a service account to talk to Play, the way it needs the ASC
API key for Apple:

1. **Play Console** → Setup → API access → link a Google Cloud project.
2. In Google Cloud, create a **service account**; grant it no project roles.
3. Back in Play Console, grant that account **Release manager** on this app.
4. Create a **JSON key** for the service account and download it.
5. `npx eas-cli credentials --platform android` → upload it under Google
   Service Account. It is then stored on EAS, exactly like the `.p8`.

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
6. **Android keystore and Play service account**, above. Check the old Expo
   account for an existing keystore *first*.

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

## Testers

**Internal** — up to 100, added by Apple ID in App Store Connect → TestFlight.
Builds arrive in minutes with **no review**. This is what you want for a live
testing round.

**External** — up to 10,000, but the first build needs a Beta App Review (~24h)
and a filled-in Test Information section.

Export compliance is already handled: `ITSAppUsesNonExemptEncryption: false` is
in the Info.plist, so there is no per-build encryption questionnaire.

Give testers two logins: a seeded attendee for the app, and the demo organiser
for `staging-dashboard.blendn.app` — see `blendn-admin` `npm run seed:room`.

## Promoting a build to the App Store

1. Merge `stage` → `prod`.
2. Wait for the workflow. The build appears in App Store Connect.
3. In ASC: create the version, attach screenshots and release notes, answer App
   Privacy, set the age rating (**17+**, which dating features force), and add
   the review demo account (`npm run seed:review` in `blendn-admin`).
4. Submit for review.

Step 3 is manual on purpose. It is the one point where somebody should look at
what is about to reach the public.
