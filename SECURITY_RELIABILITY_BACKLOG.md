# Security & Reliability Backlog — 2026-08-04 Audit (Mobile)

Scope: `blendn/` findings from an end-to-end flow audit (auth guard, onboarding flow, session handling). See `blendn-admin/SECURITY_RELIABILITY_BACKLOG.md` for the backend half of this same audit. Separate from the general code-quality `BACKLOG.md` (if present in this repo).

---

## To Do

### High priority

- [ ] **Silent session death on refresh-token failure**
  - **File**: `lib/useAuth.ts:203-216`, `lib/apiClient.ts:777-827,1013-1015`
  - **Issue**: The 10-minute background `refreshSession()` call swallows failures — if the refresh token is actually invalid/revoked, it just returns `false` without clearing tokens or calling `markSessionExpired()`. `globalAuthState.user` stays populated; the UI keeps rendering as authenticated with a dead token until the user happens to trigger a real API call that 401s. No retry/backoff, no user-facing signal.
  - **Suggested fix**: On confirmed refresh failure (not network error, an actual invalid/expired token response), clear tokens and call `markSessionExpired()` so the UI routes back to login with a clear message.

### Medium priority

- [ ] **Onboarding always restarts from step 1, never resumes**
  - **File**: `app/_layout.tsx:157-163`, `app/onboarding/welcome.tsx`
  - **Issue**: Every onboarding step is saved server-side individually, but there's no "last completed step" tracking — a user who dies on step 6 of 8 restarts the whole flow and re-enters everything, silently overwriting already-saved values.
  - **Suggested fix**: Track furthest-completed step server-side (or derive it from which profile fields are populated) and resume there instead of always routing to `/onboarding/welcome`.

- [ ] **First-login network blip re-routes onboarded users back into onboarding**
  - **File**: `app/_layout.tsx:145-155`
  - **Issue**: On fresh install/first login (no local cache yet), a single `getProfile` call determines onboarding status. If that call fails (network blip/timeout), the catch sets `onboarded = false` and routes to onboarding even if the user is already onboarded.
  - **Suggested fix**: On fetch failure, fail safe (don't force onboarding) — retry, or show a loading/error state instead of assuming not-onboarded.

- [ ] **Background onboarding-status refresh can race the main navigation guard**
  - **File**: `app/_layout.tsx:135-144`
  - **Issue**: A background re-check of onboarding status calls `router.replace('/onboarding/welcome')` directly, bypassing the `isNavigatingRef`/`lastRedirectRef` dedupe guards the rest of the file uses — can produce a stale/duplicate navigation if it resolves mid-navigation.
  - **Suggested fix**: Route this navigation through the same `replaceIfNeeded` helper used elsewhere.

### Low priority

- [ ] **Stale per-user onboarding cache never cleaned up**
  - **File**: `lib/apiClient.ts` (`TokenStorage.clearAll()`), `app/_layout.tsx:26,131`
  - **Issue**: `user_onboarded_status_<userId>` AsyncStorage keys are written but never removed on sign-out or account deletion. Harmless (namespaced per user ID) but accumulates indefinitely.
  - **Suggested fix**: Clear this key in `TokenStorage.clearAll()` alongside the auth tokens.

- [ ] **Auth tokens can fall back to unencrypted AsyncStorage**
  - **File**: `lib/apiClient.ts:191-240`
  - **Issue**: On web, or whenever a SecureStore read/write/delete fails, tokens fall back to plain `AsyncStorage` instead of the keychain-backed SecureStore (logged via `Logger.warn` only). Intentional documented fallback, but weakens the "tokens only in SecureStore" invariant.
  - **Suggested fix**: Confirm this is acceptable for the web build target; consider failing loudly (force re-login) rather than silently downgrading storage on native.

### Informational / no action needed right now

- `AuthKey_68D5BD4R4Y.p8` confirmed not tracked in git — fine, just keep it that way.

---

## Verified clean (no bug found — do not re-audit unless code changes)

- Socket.io client (`lib/socketClient.ts`): rejoins rooms correctly on reconnect; server re-validates authorization on every join, so no stale-access risk after reconnect.
- No hardcoded secrets in the app bundle — anything sensitive here would be fully extractable by anyone who downloads the app, and none was found.
- Sentry configured with `sendDefaultPii: false`.
- Mutations (check-in, RSVP, interest toggle) correctly never auto-retry; have proper in-flight guards and optimistic-rollback on failure. Chat send has proper optimistic UI with failure rollback.
