# App Store Launch Checklist

Tracks what's required to submit Blendn (iOS) to the Apple App Store. Status is updated in place as work happens — each item has a checkbox and a `Status:` line. Do not start work on these items until explicitly told to; this file is for tracking only.

Last audited: 2026-06-28

## How to use this file
- `[ ]` not started · `[~]` in progress · `[x]` done
- Update the `Status:` line with date + one-line note whenever a task's state changes
- Add new findings as they surface during work (e.g. "found X is also broken")

---

## Critical blockers (App Store will reject without these)

### 1. Sign in with Apple
- [x] Implemented, needs device/build verification
- **Why it's required:** App Store Guideline 4.8 — apps offering third-party login (we offer Google Sign-In) must offer Sign in with Apple as an equivalent option.
- **Scope:** Add `expo-apple-authentication`, implement Apple credential flow alongside existing Google flow in `app/index.tsx`, add corresponding backend auth handling in blendn-admin (`lib/mobile-auth.ts` currently only handles Google).
- Status: 2026-06-28 — implemented end-to-end and verified via `tsc`/`eslint`/admin test suite (40 passed). Mobile: `expo-apple-authentication` installed, `app.json` has `ios.usesAppleSignIn: true`, Apple button added to `app/index.tsx` (rendered only when `AppleAuthentication.isAvailableAsync()` is true, iOS only), `signInWithApple` added to `lib/apiClient.ts` and `lib/useAuth.ts` mirroring the Google flow. Backend: added `verifyAppleIdToken`/`findOrCreateAppleUser` to `lib/mobile-auth.ts` (verifies Apple's JWKS via `jose`, audience = bundle ID `com.matryxsociallabs.blendn`), new route `app/api/mobile/auth/apple/route.ts`, new `apple` rate-limit bucket in `lib/rate-limit.ts` (reuses Google's window/limits). Schema already had `provider: 'google'|'apple'` anticipated in `user_oauth_accounts`, no migration needed.
  - **Still needs:** a real device test (simulator can't fully test Sign in with Apple — needs a physical device or at minimum a development build signed with the real bundle ID), and confirmation the Apple Developer account has the "Sign In with Apple" capability enabled for `com.matryxsociallabs.blendn` (Apple Developer portal, not just app.json).

### 2. In-app account deletion
- [x] Implemented, needs migration deploy + device verification
- **Why it's required:** App Store Guideline 5.1.1(v) — apps must let users delete their account from within the app, not just sign out.
- **Scope:** Add a `DELETE /api/mobile/users/me` (or similar) endpoint in blendn-admin handling data cleanup/anonymization, add a "Delete Account" action in `app/settings.tsx` with confirmation flow.
- Status: 2026-06-28 — implemented as anonymization rather than a hard delete (several relations like `organized_events` cascade-delete on `User` removal, which would destroy other users' event/chat history — anonymizing avoids that entirely). Backend: added `User.deletedAt` field + migration `20260628_account_deletion`, new `DELETE /api/mobile/account` route that scrubs PII (name/email/image/password → null or anonymized email, profile fields cleared) and revokes all auth (refresh tokens, push tokens, OAuth links, NextAuth sessions/accounts) in one transaction. Added `deletedAt` guards to `/api/mobile/auth/session` and `/api/mobile/auth/refresh` so any still-valid token is cut off immediately. Re-auth via Google/Apple after deletion creates a fresh account (OAuth links are deleted, email is anonymized, so the old account can't be matched back into — this is intentional). Mobile: `deleteAccount()` in `lib/apiClient.ts`/`lib/useAuth.ts`, "Delete account" row in `app/settings.tsx` with a double-confirmation flow (Apple-review-friendly pattern). Verified via `tsc`/`eslint`/admin test suite (40 passed).
  - **Still needs:** the migration (`prisma/migrations/20260628_account_deletion`) needs to actually run against the production DB — it will run automatically on next Railway deploy via `railway.json`'s `preDeployCommand: npm run db:migrate`, but hasn't deployed yet. Also needs a real-device test of the full deletion flow.

### 3. Working report mechanism (user + message reporting)
- [x] Implemented, needs migration deploy + device verification
- **Why it's required:** App Store Guideline 1.2 (UGC apps) — must have a functioning mechanism for users to report objectionable content/users, not just a block feature.
- **Scope:** Design `user_reports`/`message_reports` Prisma model(s) in blendn-admin, add report endpoints, wire `lib/safetyUtils.ts`'s `reportUser`/`reportMessage` (currently return "temporarily unavailable") to call them.
- Status: 2026-06-28 — implemented. Backend: added `user_reports` and `message_reports` Prisma models (migration `20260628_user_message_reports`, reusing the existing `report_status` enum from `event_reports`), new routes `POST /api/mobile/users/[userId]/report` and `POST /api/mobile/messages/[messageId]/report` (message endpoint validates the message exists in either `chat_messages` or `private_messages` depending on `messageType` before recording the report). Mobile: `apiClient.reportUser`/`reportMessage` added, `lib/safetyUtils.ts`'s `reportUser`/`reportMessage` now call them instead of returning "temporarily unavailable". Verified via `tsc`/`eslint`/admin test suite (40 passed).
  - **Deliberately out of scope:** an admin dashboard UI to review/action reports. Reports are persisted with `status: pending` and can be queried/reviewed directly for now — Apple's requirement is a functioning *report mechanism* for users, not a polished moderation dashboard. Worth building before scale, not before submission.
  - **Still needs:** the migration (`prisma/migrations/20260628_user_message_reports`) needs to run against production via the next Railway deploy (same as #2), and a real-device test of the report flow end-to-end.

---

## Should-fix before submission (high risk of rejection or poor review)

### 4. Missing iOS permission usage descriptions
- [ ] Not started
- **Why it matters:** iOS requires an `NSxxxUsageDescription` string in `Info.plist` for every permission the app requests, or Apple rejects the build / it crashes on permission prompt.
- **Scope:** Add to `app.json`'s `ios.infoPlist`:
  - `NSCameraUsageDescription` (used via `expo-image-picker` camera capture in `lib/photoUtils.ts`)
  - `NSPhotoLibraryUsageDescription` (used via `expo-image-picker` library picker)
  - `NSPhotoLibraryAddUsageDescription` (used when saving/writing photos)
  - Confirm whether `NSMicrophoneUsageDescription` is actually needed (check real `expo-av` usage — may be unused and removable instead)
- Status: Not started — confirmed only `NSLocationWhenInUseUsageDescription` is currently present.

### 5. EAS submit credentials completeness
- [ ] Not started
- **Why it matters:** `eas submit` will fail without complete Apple credentials.
- **Scope:** Confirm `appleId` and `appleTeamId` are set (via EAS secrets or `eas.json`) alongside the existing `ascAppId` in `eas.json`'s `submit.production.ios`.
- Status: Not started — `ascAppId` present, `appleId`/`appleTeamId` not found in repo (may already be set as EAS account-level secrets — needs verification, not necessarily missing).

---

## Verify / confirm (likely fine, needs a final check)

### 6. App icon & splash screen assets
- [x] Confirmed present
- Status: 2026-06-28 — `assets/logo/ios-dark.png` (4096×4096) and `assets/images/splash-icon.png` (1024×1024) both exist and are referenced correctly in `app.json`. Worth a final visual QA pass (no transparency in icon, correct corner radius handling) but not a blocker.

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
- **3 critical blockers — all implemented** (2026-06-28): Sign in with Apple, account deletion, working report mechanism. All still need: production DB migration deploy (account deletion + reports need their migrations applied via Railway), and real-device verification (none of this has run outside `tsc`/`eslint`/unit tests yet).
- **2 should-fix items**: missing permission strings, EAS credential verification.
- **4 items confirmed fine** as of 2026-06-28 audit.
- **4 items not yet investigated**, mostly App Store Connect-side (metadata, privacy disclosure, age rating) plus one engineering item (real production build verification).
