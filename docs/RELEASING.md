# Releasing

Push to `stage` → TestFlight, against the staging API.
Push to `prod` → App Store Connect, against production, waiting for a human.

Nobody downloads an `.ipa` and nobody opens Transporter.

```
  stage ──► eas build (staging)  ──► eas submit ──► TestFlight        (staging-api.blendn.app)
  prod  ──► eas build (production) ─► eas submit ──► App Store Connect (api.blendn.app)
                                                     └─ you press Submit for Review
```

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
prefix**. All five are stored `plaintext` in EAS:

| | Secret? | |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | no | A hostname |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | no | Public by design |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | no | Already in `app.json` and `Info.plist` in the clear |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | **billable** | Restrict it — see below |
| `EXPO_PUBLIC_DISABLE_DEBUG_LOGS` | no | |

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
servers, uploaded once through `eas credentials`.

### Setting them

```bash
eas env:create --environment preview    --name EXPO_PUBLIC_API_BASE_URL --value https://staging-api.blendn.app --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.blendn.app          --visibility plaintext
```

…and the other four in **both** environments. `.env.example` is the manifest.

> A build with no `EXPO_PUBLIC_API_BASE_URL` **crashes before the first screen
> renders** — `lib/apiClient.ts` throws at module scope. It does not degrade, it
> does not show an error screen. If a TestFlight build dies instantly on launch,
> check this first.

## One-time setup

1. **App Store Connect API key.** Users and Access → Integrations → App Store
   Connect API → Team Keys → **+**, role **App Manager**. Download the `.p8`
   once — Apple never shows it again. Note the Key ID and Issuer ID.
2. **`eas credentials --platform ios`** — upload that key, and let EAS create a
   distribution certificate. Apple caps you at 2; revoking one does **not**
   affect builds already on TestFlight or the App Store, but does break any
   other pipeline still signing with it.
3. **Connect GitHub to EAS** — dashboard → project → GitHub → install the Expo
   GitHub App on `Matryx-Social-Labs/Blendn`. **This is the step that is easy to
   skip**, and without it the workflow files sit there doing nothing.
4. **Environment variables**, above.
5. **Restrict the Maps key**, above.

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
