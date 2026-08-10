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

---

## Dependency audit — 2026-08-11

`npm audit` reported 42 advisories. It now reports 25, and the number matters
much less than the classification.

**Every remaining advisory is build or CLI tooling. None reaches the app
bundle.** Traced by walking each advisory's effect chain to a top-level package:

| Reached via | What it is |
|---|---|
| `metro`, `metro-config`, `metro-transform-worker`, `image-size` | the bundler |
| `@expo/cli`, `@expo/config`, `@expo/prebuild-config`, `xcode` | build and prebuild tooling |
| `@react-native/community-cli-plugin` | the RN CLI, not the runtime |
| `postcss`, `ajv`, `uuid` | transitive deps of the above |
| `jest-expo` | the test runner |

`expo-notifications`, `expo-linking` and `react-native` appear in the list only
because they depend on those — `expo-constants` → `@expo/config`, which reads
`app.json` at build time. Nothing flagged is imported by anything in `app/`,
`lib/` or `components/`.

So the threat model is **a compromised build**, not a compromised phone. That is
still worth fixing; it is not worth breaking the SDK for.

### Why `npm audit fix --force` is not the answer

Its dry run proposes:

- Expo **53 → 57** (four SDK majors)
- React Native **0.79.6 → 0.72.17** — a *downgrade*, incoherent with Expo 57
- a React peer conflict (`react@19.0.0` against a required `^19.2.3`)

That does not fix 25 advisories, it replaces a working app with a broken one.
`npx expo install --check` reports dependencies correctly aligned to SDK 53, and
that alignment is the constraint the audit tool does not model.

### The SDK upgrade was tried, measured, and rolled back

Not deferred on a hunch — actually performed, on 2026-08-11, and reverted
because the data said to.

SDK 53 → 54 (`expo@^54`, `expo install --fix`, `@types/react` bumped to satisfy
a peer) completed and left the tree correctly aligned. The result:

| | SDK 53 | SDK 54 |
|---|---|---|
| advisories | 25 | **29** |
| of which high | 7 | **14** |

**The upgrade made the audit worse.** Newer SDKs pull newer tooling, and that
tooling has its own fresh advisories — `@expo/metro`, `@react-native/metro-config`,
`react-native-worklets` and `react-native-reanimated` all appear at 54 and do
not exist in the 53 tree. Every one of them is still build tooling, which is the
point: the number moves around, the actual exposure does not.

It also breaks code. Reanimated 4 (which SDK 54 ships) **removed
`sharedTransitionTag`** — six usages across `EventCard.tsx` and
`EventDetailScreen.tsx` stop typechecking, and the shared-element transitions
they implement would need rewriting against a different API.

So the trade on offer was: a native rebuild, an animation migration, and a
fresh regression surface, in exchange for **four more advisories**. Declined.

This is worth revisiting when there is a reason other than the audit number —
a platform requirement, an SDK 53 deprecation deadline, or a feature only newer
Expo has. Doing it *for* the audit is the wrong reason, and now there is a
measurement saying so rather than an opinion.

### Deprecation warnings

Three (`abab`, `domexception`, `whatwg-encoding`) came from `jest-environment-jsdom`,
pulled in by the `jest-expo` preset and shimming browser APIs that exist
natively now. The suites here are pure functions over data and never touch a
DOM, so `testEnvironment: "node"` removes the whole chain. Component tests will
need jsdom back — add it per-file with a docblock rather than globally.

The rest (`glob@7`, `inflight`, `rimraf@3`, `uuid@7`) are pinned inside Expo and
React Native tooling and cannot be moved without the SDK upgrade above.

---

## Client security sweep — 2026-08-11

Run after both repositories were made public. Findings are recorded whether or
not they turned up anything, because "we looked and it was clean" is only worth
something if it says what was looked at.

| Checked | Result |
|---|---|
| **Token storage** | `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — Keychain/Keystore, not readable while locked, not synced to iCloud. Web falls back to AsyncStorage with an explicit `Logger.warn`; web is not a shipping target |
| **Sensitive data in logs** | Clean. The only token logged is the **push** token, truncated to 20 chars — an address for delivering notifications, not a credential for the account. No access or refresh token, no password, ever reaches `Logger` |
| **Hardcoded secrets** | None. `EXPO_PUBLIC_API_BASE_URL` comes from the environment and the client **throws** if it is unset rather than defaulting to something |
| **TLS** | Enforced. `NSAllowsArbitraryLoads` is **false**; `NSAllowsLocalNetworking` is true, which is for a dev machine on the LAN. Android `usesCleartextTraffic` exists only in the **debug** manifest and never ships |
| **WebView** | None in the app. No `postMessage` bridge, no remote JS execution surface |
| **Sentry** | `sendDefaultPii: false`, and the user context is `{ id }` — no email, no IP |
| **Undeclared imports** | One found and fixed: `expo-asset`, imported by `app/_layout.tsx` and never declared. It resolved by hoisting accident and broke on a clean install |

### Verified against the live API, not just read

`gender`, `orientation`, `interested_in`, `intent_default` and
`reveal_by_default` were added to `profiles` this week, and all five are
supposed to be owner-only. Signed in as one seeded account and fetched another
account's profile through `staging-api.blendn.app`:

    LEAKED to another user: none
    work_field present (intended, public): True

Which is the allow-list in `app/api/mobile/profiles/[userId]/route.ts` doing its
job — it is an allow-list precisely because a deny-list once leaked
`gender` and `interested_in` to any authenticated caller.

### Not checked, and worth knowing

- **No certificate pinning.** A user who installs a custom CA and proxies their
  own traffic can read their own API calls. That is their data, and pinning
  mainly buys protection against a compromised device, at the cost of breaking
  the app whenever a certificate rotates. Deliberate, not an oversight.
- **No jailbreak/root detection.** Same reasoning: it is defeatable, and it
  punishes legitimate users on modified devices.
- **Screenshot and clipboard** of a revealed name are not restricted. A room is
  a social space; somebody who has seen your name can already write it down.
