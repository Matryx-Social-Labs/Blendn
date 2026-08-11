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

**The Maps key cannot be restricted the way the others could be, and that is a
real limitation rather than an oversight.**

`EventDetailScreen` calls `maps.googleapis.com/maps/api/staticmap` directly from
the device. **Maps Static API is a web service, not a mobile SDK**, so it accepts
only HTTP-referrer and IP restrictions — there is no iOS bundle or Android
package restriction to apply, and IP restriction is meaningless for phones.
Google's own guidance for this exact case is "use a secure proxy server".

So the key ships extractable and unrestrictable. What actually bounds the
damage:

- **API restriction** → *Maps Static API only*, so a lifted key cannot be spent
  on anything more expensive.
- **A daily quota cap** on that API (APIs & Services → Maps Static API →
  Quotas). This is the real control: a key with a 2,000/day ceiling is a
  nuisance rather than a bill.
- **A billing budget alert**, low.

**The proper fix, not done here:** proxy the request through `blendn-admin`,
which already exists and can hold the key server-side, or move to
`react-native-maps` whose SDK *does* support bundle restrictions. Either is real
work; the quota cap is what makes shipping without them acceptable in the
meantime.

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
identity. Two paths:

1. **Find the original keystore** (whoever ran the 15 Feb build) and import it:
   `npx eas-cli credentials --platform android`.
2. **Reset it.** Generate a fresh keystore in EAS, then Play Console →
   Protected with Play → App signing → *Request upload key reset*, supplying the
   new certificate. Google turns these round in a day or two.

Either way, **back up the keystore once it is settled** — not on one laptop and
not in one Expo account. That is how this situation arose.

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
