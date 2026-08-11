# Testing checklist — what only a device can prove

Everything the API can verify on its own has been verified against **staging**
(`staging-api.blendn.app`) and is recorded at the bottom of this file. What is
left here needs a phone, a simulator, or a human watching a screen.

Each item names **what to do**, **what correct looks like**, and **what the bug
looked like**, so a failure is recognisable rather than a judgement call.

Sign in as any seeded attendee: `roomseed-<handle>@blendn.invalid`
(`aisha`, `rohan`, `vikram`, `priya`, `meera`, `karthik`, …). The password is in
`SEED_ROOM_PASSWORD` in the environment of whoever last ran `npm run seed:room`;
re-run that script to set a fresh one — it re-asserts passwords by design.

---

## A. Stage 1 — the six bugs (app #70)

### A1. The match page resolves, always
1. Open the Matches tab on a cold start.
2. **Correct:** it lands on one of four states — the room, "no room yet", a
   sign-in prompt, or an error with a **Try again** button.
3. **The bug:** a spinner that never stops.

### A2. A dead network errors instead of hanging
1. Open Matches, then put the phone in airplane mode mid-load.
2. **Correct:** within ~15s you get "This is taking too long" **or** "No internet
   connection" — the two are different messages on purpose.
3. **The bug:** the spinner stays forever, and every other screen stops loading
   too (six hung requests deadlocked the whole queue).

### A3. Realtime comes back on its own — the important one
1. Sign in, open the app, leave it **foregrounded and idle for 20+ minutes**
   (longer than the 15-minute access token).
2. Come back and do something live: have another account check in, or send a
   room message from a second device.
3. **Correct:** it arrives without you touching Retry.
4. **The bug:** nothing arrives until you manually retry, and after five failures
   it never recovers for the rest of the session.

> **This one is invisible without the wait.** The fix is not "the socket
> reconnects" — it is that the reconnect carries a *fresh* token. A build that
> re-reads the expired token looks identical for the first 15 minutes.

### A4. "Not Checked In Yet" is never shown to someone who is
1. Check in to the seeded room, force-quit, reopen, go to Matches.
2. **Correct:** the room, or an honest error. Never "Not Checked In Yet".

### A5. Dating cannot be chosen without an orientation
1. New account → `about-you` → tick **Dating**, leave gender/orientation empty →
   Continue.
2. **Correct:** refused, naming what is missing.
3. **The bug:** it continued, and dating silently never worked afterwards with
   nothing on screen to explain why.

### A6. #67 debris
- Reveal in a room: the chip reads **"You're visible as \<your name\>"**, not
  "You're visible here".
- The "Also Here" list shows a plain count, and **Load More** has no
  "(-20 remaining)".

---

## B. Push notifications (API #196, #202)

Needs a real device — simulators do not receive push.

### B1. The switch actually works
1. Settings → turn notifications **off**.
2. Have another account message you.
3. **Correct:** nothing arrives.
4. **The bug:** it arrived anyway. The switch had never suppressed anything.

### B2. No name on the lock screen
1. Turn notifications back on. Lock the phone.
2. Trigger each of the three: a mutual like, a reveal request, a reveal.
3. **Correct**, on the lock screen:
   - "You have a new match" / "Someone you liked has liked you back."
   - "A match wants to know you" / "Someone you matched with wants to see who you are."
   - "A match revealed" / "Someone you matched with showed you who they are."
4. **Wrong:** any name or pseudonym visible. A lock screen is not an
   authenticated surface.
5. Tap one — it should open that conversation.

### B3. Only the person who does not know yet
1. From device A, like someone who has already liked you.
2. **Correct:** device A gets the match **in the response** and **no push**.
   The other device gets the push.

---

## C. Not built yet — do not test

These have no UI. The server is ready and waiting for them.

| | Blocked on |
|---|---|
| Revealing from inside a DM | **T2b** — no reveal button exists |
| The leaving sheet (unmatch / block / report) | **T21** |
| Blurred photos for anonymous people | **T4c** |
| "Make primary" on a photo | **T4b** |

> ⚠️ **Deploy gate.** API #201 makes the server return **pseudonyms** for DMs
> opened by a mutual like. The shipped app has no reveal button, so on staging a
> tester will see a pseudonymous DM they cannot un-anonymise. That is expected.
> **#201 must not reach production until T2b ships**, or real users are stuck.

---

## Already verified on staging — no need to repeat

Run against `staging-api.blendn.app` with seeded accounts, 2026-08-11.

| What | Result |
|---|---|
| Room renders: revealed users named + photo, others pseudonymous | ✅ 26 cards, correct per person |
| Dating tag only on compatible pairs | ✅ |
| Mutual like opens a conversation | ✅ |
| **Asymmetric seeding** — public-in-room side starts revealed | ✅ Rohan saw "Aisha Menon"; she saw "rohan-ohan" |
| Asking someone already revealed | ✅ refused |
| Asking twice cannot nag | ✅ idempotent |
| Revealing with no photo | ✅ refused, "Add a photo to your profile first" |
| Revealing with a photo | ✅ name and photo appear to the other side |
| Outsider reporting a DM they are not in | ✅ refused (404, not 403) |
| Leave + report in one call | ✅ `{closed, blocked, reported}` |
| Close reaches **both** inboxes, detail, messages, send, reveal | ✅ all 404 for both people |
| **Evidence survives the close** | ✅ report filed, message text intact, **author resolvable** so an admin can suspend |
| Reveal flags, pseudonyms and origin event retained after close | ✅ |
| Identity withdrawn despite mutual likes still existing | ✅ `GET /users/:id` → "Attendee" |
| Leaving is permanent — re-liking cannot reopen | ✅ refused, gone from the pool |
| Block hides room history, both directions of matching | ✅ |
| Block does not over-reach (unblocked people still visible) | ✅ control passed |

**One real gap found while testing**, and it is what **T4** exists to fix:
`User.image` and `profiles.photos` are two columns and the surfaces disagree.
The match card reads `photos[0] ?? user.image`; conversations read `user.image`.
A profile written by the seed script (which writes `photos` directly) therefore
shows a photo on the card and none in the DM. Writing through
`PUT /profiles` sets both, so the app is unaffected today — but the split is
real, and T4 makes `User.image` a mirror of the chosen primary.
