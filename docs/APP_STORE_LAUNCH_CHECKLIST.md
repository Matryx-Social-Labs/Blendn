# App Store Launch Checklist

Tracks what's required to submit Blendn (iOS) to the Apple App Store. Status is updated in place as work happens — each item has a checkbox and a `Status:` line. Do not start work on these items until explicitly told to; this file is for tracking only.

Last audited: 2026-06-28

## How to use this file
- `[ ]` not started · `[~]` in progress · `[x]` done
- Update the `Status:` line with date + one-line note whenever a task's state changes
- Add new findings as they surface during work (e.g. "found X is also broken")

---

## Critical blockers (App Store will reject without these)

### 0. App Store Connect agreement missing/expired
- [x] Resolved
- **Why it mattered:** discovered 2026-06-28 while checking TestFlight/build status via the App Store Connect API — every API call returned `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`.
- Status: 2026-06-28 — confirmed resolved. Re-ran the same API check: `GET /v1/apps/6757761059` and `GET /v1/apps/6757761059/builds` both succeed now. Found 16 existing builds (versions 18, 19, 25, 26, 27...), all from March 2026 and now `expired: true` (TestFlight builds expire after 90 days) — so while the account is unblocked, there's no current non-expired build. A fresh `eas build` + `eas submit` is needed to get our recent changes (Apple Sign-In, account deletion, reporting) into TestFlight.

### 1. Sign in with Apple
- [x] Implemented, needs device/build verification
- **Why it's required:** App Store Guideline 4.8 — apps offering third-party login (we offer Google Sign-In) must offer Sign in with Apple as an equivalent option.
- **Scope:** Add `expo-apple-authentication`, implement Apple credential flow alongside existing Google flow in `app/index.tsx`, add corresponding backend auth handling in blendn-admin (`lib/mobile-auth.ts` currently only handles Google).
- Status: 2026-06-28 — implemented end-to-end and verified via `tsc`/`eslint`/admin test suite (40 passed). Mobile: `expo-apple-authentication` installed, `app.json` has `ios.usesAppleSignIn: true`, Apple button added to `app/index.tsx` (rendered only when `AppleAuthentication.isAvailableAsync()` is true, iOS only), `signInWithApple` added to `lib/apiClient.ts` and `lib/useAuth.ts` mirroring the Google flow. Backend: added `verifyAppleIdToken`/`findOrCreateAppleUser` to `lib/mobile-auth.ts` (verifies Apple's JWKS via `jose`, audience = bundle ID `com.matryxsociallabs.blendn`), new route `app/api/mobile/auth/apple/route.ts`, new `apple` rate-limit bucket in `lib/rate-limit.ts` (reuses Google's window/limits). Schema already had `provider: 'google'|'apple'` anticipated in `user_oauth_accounts`, no migration needed.
  - **Still needs:** a real device test (simulator can't fully test Sign in with Apple — needs a physical device or at minimum a development build signed with the real bundle ID), and confirmation the Apple Developer account has the "Sign In with Apple" capability enabled for `com.matryxsociallabs.blendn` (Apple Developer portal, not just app.json).

### 2. In-app account deletion
- [x] Implemented and deployed to production, needs device verification
- **Why it's required:** App Store Guideline 5.1.1(v) — apps must let users delete their account from within the app, not just sign out.
- **Scope:** Add a `DELETE /api/mobile/users/me` (or similar) endpoint in blendn-admin handling data cleanup/anonymization, add a "Delete Account" action in `app/settings.tsx` with confirmation flow.
- Status: 2026-06-28 — implemented as anonymization rather than a hard delete (several relations like `organized_events` cascade-delete on `User` removal, which would destroy other users' event/chat history — anonymizing avoids that entirely). Backend: added `User.deletedAt` field + migration `20260628_account_deletion`, new `DELETE /api/mobile/account` route that scrubs PII (name/email/image/password → null or anonymized email, profile fields cleared) and revokes all auth (refresh tokens, push tokens, OAuth links, NextAuth sessions/accounts) in one transaction. Added `deletedAt` guards to `/api/mobile/auth/session` and `/api/mobile/auth/refresh` so any still-valid token is cut off immediately. Re-auth via Google/Apple after deletion creates a fresh account (OAuth links are deleted, email is anonymized, so the old account can't be matched back into — this is intentional). Mobile: `deleteAccount()` in `lib/apiClient.ts`/`lib/useAuth.ts`, "Delete account" row in `app/settings.tsx` with a double-confirmation flow (Apple-review-friendly pattern). Verified via `tsc`/`eslint`/admin test suite (40 passed).
  - **Deployed:** 2026-06-28 — [Blendn-Admin PR #38](https://github.com/Matryx-Social-Labs/Blendn-Admin/pull/38) merged to `prod`, Railway deploy approved and succeeded, `prisma migrate status` confirms the migration applied to production. Live smoke test: `DELETE /api/mobile/account` returns 401 (auth required, not 404) — route is live.
  - **Still needs:** a real-device test of the full deletion flow (UI confirm flow, server actually anonymizing, re-auth creating a fresh account).

### 3. Working report mechanism (user + message reporting)
- [x] Implemented and deployed to production, needs device verification
- **Why it's required:** App Store Guideline 1.2 (UGC apps) — must have a functioning mechanism for users to report objectionable content/users, not just a block feature.
- **Scope:** Design `user_reports`/`message_reports` Prisma model(s) in blendn-admin, add report endpoints, wire `lib/safetyUtils.ts`'s `reportUser`/`reportMessage` (currently return "temporarily unavailable") to call them.
- Status: 2026-06-28 — implemented. Backend: added `user_reports` and `message_reports` Prisma models (migration `20260628_user_message_reports`, reusing the existing `report_status` enum from `event_reports`), new routes `POST /api/mobile/users/[userId]/report` and `POST /api/mobile/messages/[messageId]/report` (message endpoint validates the message exists in either `chat_messages` or `private_messages` depending on `messageType` before recording the report). Mobile: `apiClient.reportUser`/`reportMessage` added, `lib/safetyUtils.ts`'s `reportUser`/`reportMessage` now call them instead of returning "temporarily unavailable". Verified via `tsc`/`eslint`/admin test suite (40 passed).
  - **Deliberately out of scope:** an admin dashboard UI to review/action reports. Reports are persisted with `status: pending` and can be queried/reviewed directly for now — Apple's requirement is a functioning *report mechanism* for users, not a polished moderation dashboard. Worth building before scale, not before submission.
  - **Deployed:** 2026-06-28 — same PR/deploy as #2. Live smoke test: `GET /api/mobile/users/blocked` returns 401 (not 404) and `POST /api/mobile/auth/apple` returns 400 on empty body (not 404) — confirms the new routes are live on `api.blendn.app`.
  - **Still needs:** a real-device test of the report flow end-to-end (report submission UI → persisted row with `status: pending`).

---

## Should-fix before submission (high risk of rejection or poor review)

### 4. Missing iOS permission usage descriptions
- [x] Done
- **Why it matters:** iOS requires an `NSxxxUsageDescription` string in `Info.plist` for every permission the app requests, or Apple rejects the build / it crashes on permission prompt.
- Status: 2026-06-28 — added `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` to `app.json`'s `ios.infoPlist` (the only two permissions actually used — `lib/photoUtils.ts` calls `ImagePicker.requestCameraPermissionsAsync()` and `requestMediaLibraryPermissionsAsync()`, both read-only). Confirmed `NSPhotoLibraryAddUsageDescription` isn't needed — no `MediaLibrary.saveToLibraryAsync` or any write-back call exists anywhere in the codebase. Confirmed `expo-av` (which would need `NSMicrophoneUsageDescription`) was an unused dependency — no imports anywhere — so removed it via `npm uninstall expo-av` instead of adding an unnecessary permission string.

### 5. EAS submit credentials completeness
- [x] Done
- **Why it matters:** `eas submit` will fail without complete Apple credentials.
- Status: 2026-06-28 — `eas.json`'s `submit.production.ios` now has `ascAppId`, `appleTeamId` (`S4PDH4SY2R`, from the Xcode project), and an App Store Connect API key (`ascApiKeyPath`/`ascApiKeyId`/`ascApiKeyIssuerId`) generated by the user in App Store Connect. `eas submit` should now run non-interactively with no Apple ID/2FA prompt. The `.p8` key file lives at `blendn/AuthKey_68D5BD4R4Y.p8`, covered by `.gitignore`'s `*.p8` rule — confirmed untracked via `git check-ignore`.
  - **Note:** the API key file only exists on this machine. If builds/submits run from CI or another machine, the `.p8` file needs to be provisioned there too (e.g. as a CI secret) — it won't travel with the git repo by design.

---

## Verify / confirm (likely fine, needs a final check)

### 6. App icon & splash screen assets
- [x] Confirmed present
- Status: 2026-06-28 — `assets/logo/icon-ios.png` (1024×1024, opaque) is the app icon and `assets/images/splash-icon.png` (1024×1024) the splash. Replaced 2026-08-12: the previous `ios-dark.png` carried an alpha channel, which iOS forbids, and sat the mark off-centre on a grey matching nothing in the brand.

### 7. Privacy Policy / Terms of Service links
- [x] Confirmed present
- Status: 2026-06-28 — `app/settings.tsx` links to `https://blendn.app/privacy`, `/terms`, `/help`, `/safety`, `/community-guidelines`. Need to confirm these URLs are actually live/published (not just referenced in code) before submission — App Store Connect also requires a privacy policy URL in the listing metadata itself, separate from in-app links.

### 8. App Tracking Transparency
- [x] Confirmed not needed
- Status: 2026-06-28 — no ad SDKs or cross-app tracking detected (Sentry doesn't require ATT). No action needed unless an ad/analytics SDK is added later.

### 9. Bundle ID / version / build number config
- [x] Confirmed configured
- Status: 2026-06-28 — `com.matryxsociallabs.blendn`, version `1.0.0`, `appVersionSource: "remote"`, `autoIncrement: true` for production builds. Fine as-is.

---

## Not yet investigated (need a pass before submission)

### 10. App Store Connect listing metadata
- [ ] Not started
- **Scope:** Screenshots (per device size), app preview video (optional), description, keywords, support URL, marketing URL, age rating questionnaire (relevant given chat + photos + location — likely needs 17+ or similar given user-generated content and meeting-strangers risk), export compliance (encryption usage declaration).
- Status: Not started — out of codebase scope, needs to be done directly in App Store Connect.

### 11. Data collection / App Privacy ("nutrition label") disclosure
- [ ] Not started
- **Why it matters:** App Store Connect requires declaring exactly what data is collected (location, photos, contact info, user content) and how it's used — must match actual app behavior or risk rejection/removal.
- Status: Not started — needs an audit of what's actually collected (location for check-ins, photos, profile data, push tokens) and a matching declaration in App Store Connect.

### 12. Age rating / sensitive content review
- [ ] Not started
- **Why it matters:** App facilitates real-world meetups between strangers with chat and photo sharing — Apple's age rating questionnaire and review process scrutinize this category closely (similar to dating apps). Combined with blocker #3 (no working report mechanism), this is a likely rejection point on first submission.
- Status: Not started.

### 13. Crash-free / stability check on a real production-profile build
- [ ] Not started
- **Why it matters:** Sentry was integrated and verified via a synthetic test event, but no real EAS build (`preview`/`production` profile) has been run end-to-end yet to confirm source maps upload correctly and the app doesn't crash on a real device.
- Status: Not started — flagged as outstanding in the 2026-06-27 session, still pending.

---

## Summary
- **App Store Connect agreement issue (item #0) — resolved 2026-06-28.** All existing TestFlight builds (16 total, March 2026) are expired; need a fresh build to get our recent changes into TestFlight.
- **3 critical blockers — all implemented and deployed to production** (2026-06-28): Sign in with Apple, account deletion, working report mechanism. Backend confirmed live via migration status + smoke tests.
- **Device/UI testing held off for now** (2026-06-28) — no iOS simulator runtime installed locally (Xcode present, no downloaded runtime), and Sign in with Apple fundamentally can't be verified in a simulator anyway (needs a real Apple ID session on a physical device). User chose to pause testing rather than install a runtime or set up a device build right now — resume when ready to dedicate device time.
- **2 should-fix items — both done**: permission strings added, EAS submit credentials complete (App Store Connect API key configured).
- **4 items confirmed fine** as of 2026-06-28 audit.
- **4 items not yet investigated**, mostly App Store Connect-side (metadata, privacy disclosure, age rating) plus one engineering item (real production build verification).
