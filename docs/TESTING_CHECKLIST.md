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

### A3. Realtime comes back on its own — ✅ **VERIFIED on device, 2026-08-12**

> Confirmed on a TestFlight build: left foregrounded past the 15-minute access
> token, and realtime returned **without a Retry tap** — the offline banner
> cleared by itself after about a second.
>
> That is the whole fix, and it is the one that could not be proved any other
> way. Making socket.io's `auth` function-valued changes nothing on its own:
> `TokenStorage.getAccessToken()` is a bare SecureStore read with no expiry
> awareness, so a callback that merely re-reads hands back *the same expired
> token* and the bug survives looking fixed. The banner clearing on its own is
> the observable proof that the callback refreshed first.

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

## C. Identity in a DM (app #71)

The deploy gate is closed — the reveal UI now exists, so pseudonymous DMs are
usable rather than a dead end.

### C1. The header shows what the server says, not what the last screen knew
1. Match with somebody, open the DM.
2. **Correct:** the header shows **the same pseudonym the match card showed**,
   with "You're both anonymous here" underneath.
3. **The bug:** it rendered `otherUserName` straight off the navigation params,
   so it showed whatever the screen that pushed it happened to know.

### C2. One control, never two
1. Look at the bar under the header in each state.
2. **Correct:** exactly one — "Show them who you are" while you are anonymous,
   "Ask X to reveal" once you have revealed and they have not, and **nothing**
   once you both have.
3. **Wrong:** both buttons at once, or an "Ask" button on somebody who has
   already revealed (the server answers that with a 400).

### C3. Revealing says it cannot be undone, before the tap
1. Tap **Show them who you are**.
2. **Correct:** "This can't be undone — you can block them, but you can't take
   it back." Confirm, and your name and photos appear to them.
3. This is the one sentence that must not be softened. There is no path back to
   `false` on the server.

### C4. Revealing with no photo is refused, usefully
1. On an account with no photo, tap Reveal.
2. **Correct:** "Add a photo to your profile first" — the one missing input,
   named at the moment it is reached for. Not a percentage, not a checklist.

### C5. Asking cannot nag
1. Reveal, then tap **Ask X to reveal**. Do it again.
2. **Correct:** the same quiet confirmation both times. No counter, no "asked
   2 times", and **no way for them to decline** — silence is the only answer
   they can give, by design.

### C6. The asymmetric case
1. Reveal in a room *before* matching, then match with an anonymous person.
2. **Correct:** they see your real name immediately (you were public on the
   card — nothing left to reveal); you see their pseudonym; only *you* get the
   Ask button.

### C7. Leaving, and the copy that changes
1. Options → the sheet offers **Unmatch**, **Unmatch and report**, **Block and
   report**.
2. **Before revealing:** "They never saw your name."
3. **After revealing:** "They already know your name and photos — unmatching
   doesn't undo that." Both say it closes **for both of you**.
4. Leave, and confirm the thread is gone from **both** inboxes.

### C8. Photos
- **Make main** appears on every non-primary tile; tapping it promotes that
  photo, and the match card and DM avatar follow.
- Signing up with Google gives you **no** photo until you choose one. That is
  correct: an avatar is not a choice, and it had never been moderated.

---

## D. Not built yet — do not test

| | Blocked on |
|---|---|
| Blurred photos rendering for anonymous people | The client makes the 40px derivative; the server does not yet serve it in place of the full URL |
| Interests as 13 parents | Stage 2 |
| A settings home for the five matching fields | Stage 3 |

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

### Second round — the photo pipeline (API #204), 2026-08-11

| What | Result |
|---|---|
| A real 37 KB photo in our bucket and folder | ✅ accepted |
| A 900-byte file, same folder | ✅ `too_small` |
| Our bucket, object does not exist | ✅ `too_small` (proves the ownership check *passed* it) |
| Someone else's folder | ✅ `not_ours` |
| `chat/` folder (different trust class) | ✅ `not_ours` |
| Host *ending* with our bucket name | ✅ `not_ours` |
| AWS metadata endpoint | ✅ `not_ours` |
| `User.image` mirrors `photos[0]` | ✅ |
| Deleting every photo clears it | ✅ |
| `photo_checks` row written | ✅ `checked: true` |
| Users with an image but no photos, post-migration | ✅ 0 |

> **A note on how this was verified.** The first run of that matrix was
> worthless: staging's bucket is `blendn-media-staging`, not `blendn-media`, so
> every URL failed on the hostname before reaching any interesting check — seven
> "refused" lines that a completely broken guard would also have produced. What
> makes the second run meaningful is that the outcomes **differ**, and that a
> nonexistent object in the right folder returns `too_small`, which proves the
> ownership check passed it through.
>
> The same trap produced the `rohan-ohan` pseudonym bug. **First question of any
> negative-test suite: did any input succeed?**

### Third round — reveal lifecycle + `just_here` (API #201, #202, #205), 2026-08-11

Run end to end on a fresh pair (`meera` / `arjun`) against staging.

| What | Result |
|---|---|
| Both anonymous at the start | ✅ "Twilight Coyote" / "Clever Canyon" |
| Asking sets the flag on the *other* side | ✅ |
| Asking twice cannot nag | ✅ same response, one flag |
| Reveal with no photo | ✅ refused — "Add a photo to your profile first" |
| Reveal with a photo | ✅ name **and** photo appear to the other side |
| The revealer still sees *their* pseudonym | ✅ per-side, not a mutual switch |
| Asking somebody already revealed | ✅ refused |
| All four intents at once | ✅ refused |
| `just_here` alone / `dating`+`networking` | ✅ both accepted |

> **Leaving is permanent, confirmed by accident.** A re-like on the pair closed
> in the previous round returned `mutual: false` with no conversation id — the
> close survived a full re-seed of the room, which is what "no path back" is
> supposed to mean.

**One real gap found while testing**, and it is what **T4** exists to fix:
`User.image` and `profiles.photos` are two columns and the surfaces disagree.
The match card reads `photos[0] ?? user.image`; conversations read `user.image`.
A profile written by the seed script (which writes `photos` directly) therefore
shows a photo on the card and none in the DM. Writing through
`PUT /profiles` sets both, so the app is unaffected today — but the split is
real, and T4 makes `User.image` a mirror of the chosen primary.
