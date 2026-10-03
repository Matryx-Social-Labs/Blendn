# Blend'n redesign: the screens not yet designed (Flows 9–16)

The second part of [`SCREENS.md`](./SCREENS.md), written 2026-10-03 after Flows 1–8 were built in Claude Design. Same format, same authority ([`README.md`](./README.md)), same system ([`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md), plus its Round 2 additions in §21).

Where these screens touch flows that are already designed (the Room, the Banter, Me, Settings, the home top bar), the change is made by a **delta prompt** in that flow's project ([`PROMPTS.md`](./PROMPTS.md), "Round 2"), never by redrawing the flow.

**Sources.** Three kinds, marked on every flow:
- **Built, not designed:** the server serves it today. The API rules are quoted from `blendn-admin/docs/API.md` (admin `origin/dev` `3852f15`).
- **Planned:** the product-completion plan v2 (owner rulings of 2026-10-01). There is no server yet, so these are drawn as **proposal frames**: labelled, kept inside the rulings, and expected to move.
- **Research:** [`research/round2/`](./research/round2/).

| Flow | What | Status |
|---|---|---|
| 9 | Notifications: the bell, the screen, **push notification design**, the in-app banner, settings | Built, not designed |
| 10 | Crews: making one, arriving together, crews in the Room, Blends, the crew reveal | Built, not designed |
| 11 | Places live: venue detail, Go Live, the venue room, expiry, hand-offs | Built, not designed |
| 12 | Blend'n+: the paywall, Night Pass, manage | Planned (proposal frames) |
| 13 | Regulars: blind offers, the door pass, "let this venue know" | Planned (proposal frames) |
| 14 | Matching v2: overlap lines, new profile fields, badges | Planned, partly built |
| 15 | System states nobody has designed | Built, not designed |
| 16 | Sharing and link previews: share sheets, OG cards, Story cards, the public event and venue pages | Needs build (today an event shares as plain text with no link) |

---

## Flow 9 · Notifications: the bell, the screen, push, the in-app banner, settings

**Status:** built, not designed. The bell is a 30-row sheet with no paging. Three kinds (`crew_invite`, `crew_here`, `blend`) go nowhere when tapped. There's no in-app banner and no app-icon badge.

Sources:
- Server catalogue: [`research/round2/gap-sweep.md`](./research/round2/gap-sweep.md) Part 1 (19 kinds, exact copy, channels).
- Recommendations: [`research/round2/research-notifications.md`](./research/round2/research-notifications.md) §8.
- Rich push visuals: [`research/round2/research-sharing-og-push.md`](./research/round2/research-sharing-og-push.md).

### Rules
- **Messages are not in the bell.** DMs and room messages live in the Banter. The bell holds people events, crew events and event logistics.
- **A lock screen is not an authenticated surface.**
  - Pushes about people name **no person and no place**.
  - Pushes about events name the **event in the body**, never in the title (Android shows titles on a private lock screen, and some event names are sensitive).
  - A server row's body names nobody. The app may show a name **inside** the app only where the viewer is already allowed to see it (a friend, a revealed match).
- **There is never a "declined" anything.** The server sends a "Message request declined" push and keeps a bell row for it today. **Don't draw it.** That push is flagged for removal (open question 1).
- **Nothing unsolicited buzzes.** A notification arriving makes no haptic and no in-app sound.
- **Never put Accept or Decline on a push.** The push doesn't say who, so you'd be accepting someone you can't see. Actions live in the app.

### Screens

**9.1 · The bell** (home top bar and Banter header; glass 44pt icon button)
- **Badge:**
  - unseen rows only, shown as 1–9 then "9+" (the accessibility value is the true number);
  - a pending request does **not** keep it lit; that count lives in "Waiting on you · 3";
  - white pill, ink digits;
  - it appears with a `quick` fade + scale from 0.8, never a bounce.
- Tap → pushes the Notifications screen (not a sheet).

**9.2 · The Notifications screen** (full screen, pushed on the current tab's stack)
- **Top bar:** glass, ‹ back, "Notifications" (large title collapsing on scroll), ⋯ (Notification settings · Clear all).
- **"Push is off" row** (solid, when the OS blocks notifications **or** the master switch is off): "Push is off. These still land here, but your phone won't tell you." [Turn on]
- **Waiting on you · N:** live request state, not history. It holds friend requests, crew invites, message requests, replies to your board asks and reveal requests, with inline actions:
  - **Accept/Decline** (friend);
  - **Join/Decline** (crew, which opens the consent screen 10.3: joining is never one tap from a list);
  - **View** (message request, reveal request, board reply: you read before you decide).
  - Up to 3 rows show, then "See all N ›".
- **New**: rows unseen when the screen opened. An 8pt dot **and** a semibold title (two cues).
- **Earlier**: everything else, back 30 days.
- **Footer:** "That's everything we keep: read notifications for 30 days, unread for 90."
- **Live updates:**
  - at the top, new rows fade in;
  - scrolled down, a glass "↑ New" pill appears, and **content never moves under the finger**;
  - pull to refresh;
  - cursor paging, 30 per page.
- **Opening the screen marks everything seen:** the badge clears at once, and only rows up to the newest one fetched are marked.
- **Draw:**
  - loading (6 skeleton rows);
  - failed;
  - empty ("Quiet for now" / "Friend requests, matches, crew news and event changes land here. Messages are in Banter.");
  - push off;
  - populated;
  - a request going pending → accepting (spinner) → "You're friends now" (inline for 2s, then it leaves Waiting on you);
  - a stale request ("This request is no longer open");
  - Clear all confirm;
  - load more.

**9.3 · Row anatomy** (solid L1, one tap target)
- **Layout:** a 40pt leading visual · title (`bodyStrong`, ≤2 lines, what happened) · context line (`meta`: event · time) · trailing dot or actions.
- **Leading visual by who the actor is to you:**

| Actor | Visual |
|---|---|
| Named to you (friend, revealed, accepted request) | Round photo (initials if none) |
| Pseudonymous, met at an event | **That event's creature disc**, the same seed as in the room. Never blurred, never a silhouette |
| Nobody, by design ("We're here", "It's a Blend") | A rounded-square **glyph tile** with an outlined icon. Never person-shaped. Crew rows use the crew's emblem |
| An event | The cover as a 40pt rounded square with a 16pt outlined kind badge (clock, pin, megaphone, star). Cancelled: a desaturated cover **and** "Cancelled" in the title |
| Several pseudonymous people | Up to 3 overlapping creature discs at 28pt + "+N" |

- **Where a row's words come from.** A bell row carries no actor and little data (`{type, ids}`). A title that needs a name or a new time is filled in by fetching the target, and only where you may already see it; otherwise the row falls back to its stored title.
  - The five event-update kinds share `{type, eventId}` and differ only by body text, so telling them apart reliably needs a `data.reason` from the server (**needs server**).
  - A stored announcement body is "Posted an announcement".
- **Per kind:**

| Kind | Title (in-app) | Trailing | Tap → |
|---|---|---|---|
| friend_request | "{Name} wants to be friends" (a friend request always names the requester in the app) | Accept · Decline | the request |
| friend_accepted | "{Name} accepted your friend request" | dot | friend profile |
| match | "You matched with {pseudonym}" / "{n} new matches" | dot | the conversation |
| reveal_request | "{pseudonym} asked to know you" | View | the conversation (the reveal is decided there) |
| reveal | "{Name} revealed — you matched at {event}" | dot | the conversation |
| board_request | "{pseudonym} answered your post" / "{n} answered" | View | the Board post |
| board_request_accepted | "You're in: {post}" | dot | the conversation |
| message_request | "{Name} wants to message you" | View | Banter › requests |
| message_request accepted | "{Name} accepted your message request" | dot | the conversation |
| crew_invite | "Crew invite: {crew}" · "From {first name}" | Join · Decline | invite screen (10.3) |
| crew_here | "Someone from Nebula is here" (one row per crew per night: it counts taps, not presence) | dot | the crew chat |
| blend | "It's a Blend" | dot | the Blend room |
| event_update (changed) | "New start time: 9:30 pm" / "New venue: {venue}" | dot | the Scene |
| event_update (cancelled) | "Cancelled: {event}" | dot | the cancelled Scene |
| event_update (starts soon) | "Starts at 9:00 pm" | dot | the Scene |
| event_update (event took over a venue you were live at) | "An event started at {venue}" | dot | the Scene, ready to check in |
| event_update (no longer available) | "{event} is no longer available" | dot | the "No longer available" landing (Flow 15) |
| announcement | "From the organiser: {first line}" | dot | the event room |
| waitlist_promoted | "You're in: a place opened up" | dot | the Scene |
| rating_request | "How was {event}?" | dot | Rate |

- **Grouping:**
  - Aggregate low-stakes repeats per event night by count ("2 new matches").
  - **Never aggregate** requests, reveals, Blends, cancellations or announcements.
  - Event logistics collapse to **one row per event** showing the latest state ("Updated 2×"); cancelled always wins.

**9.4 · The in-app banner** (when a notification arrives with the app open)
- **No system banner and no sound in the foreground.** The app shows its own **glass capsule** at the top, inset 8pt: the 32pt leading visual, a 1-line title, a 1-line body (the in-app wording). There are no buttons.
  - On Android it's the same capsule.
- **Shown for:** DMs and room replies (not when that thread is on screen), friend and message requests, crew invites, matches, reveal requests and reveals, board replies, "We're here", Blends, and today's event changes.
- **Not shown for:** announcements, ratings, waitlist, accepted-request confirmations. Those go to the bell only.
- **Suppressed when:**
  - its destination is on screen;
  - you're mid-hold or mid-sheet;
  - you're on the Notifications screen (the row is inserted instead).
- **Behaviour:**
  - tap opens it and marks it read;
  - swipe up dismisses;
  - auto-dismiss after 5s, paused while touched, and **never while a screen reader is on**;
  - an accessibility **Dismiss** action alongside swipe-up;
  - one at a time; a same-kind banner within 4s merges ("2 new matches").
- **Motion:** 16pt down + fade on `base`; out on `quick`; Reduce Motion: a fade. **No haptic.**
- **Draw:** a person kind, a crew kind, an event kind, a merged one, the screen-reader version.

**9.5 · Push notifications: lock screen, banners, grouping** (draw them as phone frames: this is design work too)
- **Draw the lock screen and notification shade** on iOS (dark, stacked by thread) and Android (dark, grouped by channel) for **every kind**, including iOS with previews hidden. This proves no name leaks.
- **Visual spec:** 9.5b below.
- **Copy: the server's current copy, and the proposed fix.** Draw the proposed copy and label it; it needs a server change.

| Kind | Current (server) | Proposed |
|---|---|---|
| friend_request | "New friend request" / "Someone wants to be friends. Open Blend'n to see who." | "Friend request" / "Someone you've met wants to add you." |
| friend_accepted | "Friend request accepted" / "You're friends now." | keep |
| match | "You have a new match" / "Someone you liked has liked you back." | "It's a match" / "Someone you liked liked you back." |
| reveal_request | "A match wants to know you" / "Someone you matched with wants to see who you are." | "A match asked to know you" / "It's your call. Nothing changes unless you reveal." |
| reveal | "A match revealed" / "Someone you matched with showed you who they are." | keep the title / "They've shared who they are with you." |
| board_request | "Someone answered your post" / "Open the board to see who is asking." | "Reply to your post" / "Someone wants in on your board post." |
| message_request | "New message request" / "{real name} wants to connect" | "Message request" / "Someone wants to message you." (no name on a lock screen) |
| message_request declined | "Message request declined" / "Your message request was declined" | **no push** (open question 1) |
| crew_invite | "You're invited to a crew" / "A friend wants you in their crew. Open Blend'n to see." | "Crew invite" / "You've been asked to join a crew." |
| crew_here | {crew name} / "Someone from your crew is here 👋" | "Crew update" / "Someone from your crew is here." (no user-typed crew name on a lock screen; open question 2) |
| blend | "It's a Blend" / "Your crew and another matched tonight. Say hi in the Blend." | keep the title / "You're in a Blend tonight." (it reads right for the solo side too) |
| event_update (changed) | {event} / "Event updated: start time, venue" | "New start time" / "{event} now starts at 9:30 pm on Sat 4 Oct." (it says the new value) |
| event_update (cancelled) | {event} / "This event has been cancelled" | "Event cancelled" / "{event} on Sat 4 Oct won't go ahead." |
| event_update (reminder) | {event} / "Starting in ~60 minutes at {venue}" | "Starts at 9:00 pm" / "{event} at {venue}, {area}." (absolute time: notifications are read late) |
| event_update (took over a venue) | "Blend'n" / "An event just started here — tap to check in" | "An event started here" / "Check in to join the people there." (no "tap to") |
| announcement | "📢 {event}" / {text} | "From the organiser" / "{event}: {text}" (no emoji) |
| waitlist_promoted | "You're in" / "A place opened up at {event}." | keep |
| rating_request | {event} / with a mutual like: "The night's over. Rate the people you met — only you see what you say."; otherwise "How was it? Tap to rate the night." | Two variants, as today: "How was the night?" / "Rate the people you met at {event}. Only you see what you say." **or** "How was the night?" / "How was {event}? Only you see what you say." Delivered quietly (passive) |
| message_request accepted | "Message request accepted 🎉" / "{real name} accepted your message request" | "Request accepted" / "You can message them now." |
| board_request_accepted | "Your ask was accepted" / "You can message them now." | keep |
| event_update (no longer available) | {event} / "This event is no longer available." | "Event unavailable" / "{event} is no longer available." |
| DM | {thread name: the pseudonym until reveal, but **a real name** in friend and message-request conversations} / preview | **Open question 6.** Proposed: "New message" / "{n} new messages", with no name and no preview |
| room reply | {room name: user-typed for crew and Blend rooms} / "{pseudonym, or a first name in crew rooms} replied: {preview}" | **Open question 6.** Proposed: "Reply in your room" / "Someone replied to you." **Fix either way:** crew and Blend replies must open their own room screens, not the event-room screen |

- **Copy rules:**
  - titles ≤30 characters, one sentence body, meaning in the first 40 characters;
  - **no emoji, no app name, no "Tap to…" / "Open Blend'n to…"**;
  - absolute times;
  - each push stands alone.
- **Needs server:** the iOS interruption levels, the Android channels, images and per-category toggles below. The server's `deliveryFor` picks the channel today, and there are no per-kind preferences. Label these frames "Needs server".
- **iOS interruption levels:**
  - **Time Sensitive** only for now-or-within-an-hour kinds ("starts at", "We're here", a change ≤60 minutes out);
  - **Passive** for rating;
  - Active for the rest;
  - hidden-preview placeholders per category ("Friend request", "Event update", "Crew update").
- **Android channels** (the names the person sees in phone settings):
  - keep `messages` (rename "Messages"), `rooms` ("Room replies") and `events` ("Event updates");
  - add `people` ("Matches and friends"), `crew` ("Your crew") and `later` ("After the night", low importance);
  - rename `default` to "Other";
  - later, "Offers from venues" (Flow 13).
- **App-icon badge** (today: none on either platform): unseen bell rows + conversations with unread messages (open question 3).

**9.5b · Push visuals** (draw the assets and the phone frames)
- **The Android status-bar icon (a new asset):**
  - 96×96 px, white on transparent, alpha only;
  - the monogram **simplified**: either a filled silhouette or the monoline at ≥8px stroke (2dp), with the inner counters opened up.
  - Today's icon has a ~1.3dp stroke at 24dp and shimmers or disappears on low-dpi phones.
  - Check it at 24, 18 and 16px on dark and light.
- **Accent:** `#F05423` (the config says `#F05524` today; fix it with the splash and adaptive-icon colours).
- **Images:**
  - only on **"starts at"** and **"you're in"** (waitlist);
  - the event cover alone, with no text (2:1, ≤200KB);
  - never on private events, never on people pushes.
  - iOS needs a notification service extension; Android shows it as BigPicture.
- **Avatars:** none in v1. Later, DMs as iOS communication notifications use the **creature avatar, always**, even after a reveal, because a lock screen is public.
- **No action buttons on any push** (DESIGN-BRIEF §21.1). A tap opens the app. Directions and Check in were considered for "starts at" and dropped: check-in needs the hold and a GPS fix in the app.
- **Lock screen:** dark mode on both OSs. People and crew channels are private on Android lock screens.

**9.6 · Notification settings** (Settings › Notifications; also from the bell's ⋯)
- **Content:**
  - the OS-off row with **Turn on** (asks if it still can, otherwise opens the phone's settings);
  - **Push notifications** (master);
  - **Tell me about:** Messages · Room replies · Matches and friends · Your crew · Event updates · After the night. These match the Android channel names, so the same words appear in both places.
    - **Needs server:** per-kind push preferences don't exist yet.
    - **On Android, each row deep-links to that channel's system settings**, because apps can't switch their own channels.
  - **Muted rooms**: a line linking to the rooms you've muted (per-room mute exists);
  - **Sounds, pop-ups and lock screen ›** (opens the phone's settings for Blend'n).
- **Rules:**
  - The toggles stop the **push only**; the bell still fills (say so in one line).
  - No quiet hours (the phone's Focus does it, and Blend'n is used at night).
- **Draw:** all on, some off, the OS blocking, the master off.
- **Haptics:** `H.toggle`.

**9.7 · Asking for permission in context**
- Keep the onboarding step. Add one-button asks (**Continue**, which then opens the system dialog) at the moments a push obviously pays off:
  - after RSVP "Going": "Want a heads-up if the time or venue changes?";
  - after your first like or friend request;
  - on joining a crew.
- **Never ask again after a denial.** The bell's "Push is off" row and Settings are the only ways back.

### Open questions for the owner
1. **Declines:** drop the "Message request declined" push and bell row? (The brief's rule says yes; the server sends one today.)
2. **The crew name as a lock-screen title** ("We're here"): keep it, or a generic "Your crew's here"? The takeover push deliberately avoids user-typed text.
3. **App-icon badge:** the bell plus unread conversations, or the bell only?
4. **Is a message request the reveal?** The server names the sender in the push today. The proposal keeps the name in-app and drops it from the push.
5. **Title case or sentence case** for push titles? (Proposed: sentence case, Blend'n's voice.)
6. **Names on the lock screen for DMs and room replies.** Today the server puts a real name on friend and message-request DMs, first names on crew-room replies, and user-typed crew and Blend names as titles. Keep that as an explicit exception to the rule, or go nameless?

---

---

## Flow 10 · Crews: making one, arriving together, matching as a crew

**Status:** built, not designed. Sources:
- API: `docs/API.md` "Crews" and "Blends".
- Plan v2 §6 and §8.7.
- Research: [`research/round2/research-crews.md`](./research/round2/research-crews.md).

**There is no group check-in, by the owner's ruling (2026-10-01).** Nobody checks in for anyone else: each member holds the pass on their own phone, by their own GPS.
- A crew is **here** when two or more of its members are checked in at the same event.
- **"We're here"** posts a line in the crew chat and pings the rest of the crew. It checks nobody in.

The design's job is to make arriving *feel* like a group without breaking that rule.

### Where crews live (decided)
- **Me:** a **Crews** row beside Friends ("Crews · 2", with a dot for an invite). It holds your crews, open invites and "Make a crew".
- **Banter:**
  - crew chats sit with your conversations;
  - a **crew invite** is a request row ("Aisha invited you to Crew Nebula");
  - an open Blend room sits under **Live now**, then as a normal row until it closes ("closes 4 am").
- **The Room:** a **Crews** view next to people, once crews are here.
- **No new tab.**

### Rules that hold on every crew screen (from the API; breaking one is a privacy bug)
- **Made from friends only.** Every invitee is a friend of whoever invites them. Inviting can never reveal who uses the app, so there is no search and no strangers.
- **2–12 members.** You can own 3 crews, be in 10, and make 3 a day. An invite lapses after 14 days. A decline is told to nobody and isn't re-asked for 30 days. A crew below 2 active members **dissolves**.
- **Joining is consent.** The join screen says, beside the button: *"Anyone in this crew can reveal the crew — your name and photos — to people you match with."* It offers **"Keep me anonymous even when my crew reveals"**, which can be changed later and applies from then on.
- **Inside a crew, people are named:** first name and one photo, never the full name.
- **A crew card shown to strangers carries counts, never people:**
  - emblem, name, bio, "Crew of N", "N here now", tags, intent;
  - **no name, photo or pseudonym** of any member. The API rules this out, because a list of pseudonyms beside a crew that later reveals would single out the members who stayed anonymous.
  - This overrides plan v2's "menagerie" of tonight's animals on the card. **Do not draw pseudonyms on a crew card.**
- **No voting.** Any present member likes on the crew's behalf, and the crew chat shows it ("Rohan liked Crew Nebula for the crew"). Nobody else is told.
- **Crew ↔ person has guardrails:**
  - the solo person turned on **"Open to joining a crew tonight"** (it lasts until the end of that night);
  - the crew has **"Room for one more"** and **6 or fewer** members;
  - dating only if both sides chose it.
- **A Blend reveal is scoped to that one Blend.** It is never shown in the event's room, a DM or another Blend. Members who chose "keep me anonymous" stay pseudonyms. The display reads "N revealed · M keep it private".
- **Push copy names nobody.** Quote the server's copy; don't invent new copy:
  - invite: "You're invited to a crew" / "A friend wants you in their crew. Open Blend'n to see." (no crew name);
  - "We're here": titled with the crew's name, "Someone from your crew is here 👋", with no person and no place;
  - Blend: "It's a Blend" / "Your crew and another matched tonight. Say hi in the Blend."
  
  The crew-name title on a lock screen, and Blend copy that assumes two crews (it reads wrong for a crew ↔ person Blend), are open copy questions (Flow 9).
- **Hosts can switch crews off for an event.** Then the Crews view is absent and "We're here" is refused.

### Emblems and identity
- **A crew is a square; a person is round.** This follows Banter's existing rule: a person is round and a room is a square cover.
- **The emblem is the crew's face that isn't a face:**
  - a **squircle** (continuous corners);
  - one of **12 crew palettes** (a deep base plus a mid tone, all at a similar luminance so no crew looks louder);
  - one of **12 night motifs** (crescent, sunburst, dance-floor tiles, stacked rings, tide lines, star cluster, bolt, arch, chevrons, orbit, spark grid, wave stack), drawn as flat geometry;
  - **no text** on it.
- **Seeded from the server's random `emblemSeed` only.** It never changes on a rename or as people join or leave; if it did, a stranger watching could tell the membership changed.
- **Never** a creature (that's a person), a face, initials, or the brand gradient (that's the primary action's).
- **Count ticks** (cards only): a row of N identical ticks (crew size), with the "here now" ones filled. It reads "Crew of 5 · 3 here now": counts that never point at a person. When a count rises, one tick fills (~220ms); nothing else moves.
- **Sizes:** 24 (chat chip, "Liking as" chip), 40 (list row), 56 (Banter row), 96 (card), 160 (crew detail, Blend moment).
- **Revealed** (inside a Blend only, and only for that Blend's people):
  - the emblem at 56, then a row of 36pt photo tiles, one per revealed person, ending in a neutral "+1 private" tile;
  - that tile is **not** the private person's creature;
  - the header reads "3 revealed · 1 keeps it private";
  - the people list orders revealed first, then private, both alphabetical, so **the order never encodes who revealed**.
- **Crew extras** (Blend'n+, Flow 12; proposal, locked):
  - a crew photo, shown **only inside the crew** (crew detail and crew chat), never on a card or anywhere a stranger sees it. Otherwise it would be a paid way round the reveal;
  - your choice of emblem colours **from the same 12 palettes**, never louder ones (no paid prominence).

### Screens

**10.1 · Crews on Me**

> **Server dependency:** today a crew of one with open invites is **dissolved by the 15-minute sweeper**. `repairCrews` counts members, not invites, so a new crew dies before a friend can accept. Draw the **forming** state ("Nebula · you + 3 invited · starts when someone joins"), and treat it as blocked on the server fix.
- **Content:**
  - your crews as rows: emblem, name, "Crew of N". **No presence here:** the server serves crew presence only to someone checked in at that event (`GET /events/:id/crews` → `myCrews`), never on `GET /crews`;
  - open invites ("Aisha invited you to The Usual Suspects": the inviting friend's first name);
  - **Make a crew**.
- **Draw:**
  - no crews (an empty state that sells the idea in one line: "Go out together. Meet other crews.");
  - one crew; several;
  - an invite waiting;
  - an invite that lapsed;
  - the caps reached (409 / 429 with the server's sentence: "You can own up to 3 crews at a time.", "You can be in up to 10 crews at a time.", "That's enough new crews for today — try again tomorrow.");
  - the profile gate (403 "Crews are for people 18 and over who have finished setting up.").

**10.2 · Make a crew** (a sheet, 3 steps)
1. **Name and vibe.** The name (2–32 characters), a bio (≤140), intent, and up to 3 tags from the curated list (quiz team, run club, techno heads, office gang, birthday crew, foodies, board gamers, gig goers, book club, dance floor), plus **"Room for one more"**.
   - Refusals show inline in the server's words:
     - "A crew name is 2–32 characters";
     - "This can't be a crew's name.";
     - "‹hint› A crew card is shown to people you haven't met, so contact details can't go on it."
   - A live preview shows the crew card as strangers will see it.
2. **Invite friends.** A multi-select friend list. The count reads "N invited", never who was skipped: the server answers the same whether a friend was invited, already in the crew, or kept apart.
3. **Consent.** The consent sentence, "Keep me anonymous even when my crew reveals", and **Make the crew** (the primary).
- **Draw:** each step, validation, the caps refusal, success (the emblem appears and the crew chat opens).
- **Haptics:** `H.select` on tags, `H.toggle` on switches, `H.success` on creation.

**10.3 · An invite received** (from the bell, a push, or Crews on Me)
- **Content:** what an invitee is given: emblem, name, bio, tags, "Crew of N", "Aisha invited you" (the inviter's first name). **No member names or photos**: you see those after joining, because `GET /crews/:id` is members-only. Then the consent sentence and the keep-anonymous switch, with **Join** (primary) and Not now.
- **Draw:**
  - valid;
  - **one** "This invite isn't open any more" (lapsed, withdrawn, the inviter left, or a block all answer the same 404; the app may label a row it still holds "Expired" from `invitedAt` + 14 days);
  - the crew is full ("A crew has at most 12 people.");
  - joined (the crew chat opens).
- **Keep:** declining tells nobody.

**10.4 · Crew detail** (from Me, or the crew chat's header)
- **Content:** emblem, name, bio, tags; members (first name + photo; "You"); **Invite friends**; **your settings** (keep me anonymous, mute the crew chat); **Leave crew**.
- **The owner also gets:** edit name, bio, vibe and "Room for one more"; remove a member (confirm).
- **History:** not served, and a count badge would break the "never a count" rule. Leave it out.
- **Draw:** owner view, member view, a member kept apart from you (not listed), the crew about to dissolve ("Leaving will close the crew — there'll be one of you left"), dissolved, report a crew (from outside), moderated/hidden.

**10.5 · Crew chat**
- A Banter thread of kind crew. It reuses the room chat's components, but people are **named** here (first name + photo).
- **System lines.** The server writes only two kinds:
  - "We're here 👋" (`crew_here`, with the event);
  - "Rohan liked Crew Nebula for the crew" (`crew_like`).
  
  A Blend is announced by the push and the like response, not in the crew chat. Don't draw join, leave or Blend lines.
- **Draw:** active, quiet, muted, archived (the crew dissolved), a member blocked by you.

**10.6 · Arriving together** (the "group check-in" feel, without proxy check-in)
- **After your own check-in**, in the Room and on the VenuePass's success: a **crew strip**, e.g. "Crew Nebula · 2 of 4 in". It comes from `myCrews[].presentCount`, which the server gives only to someone checked in.
  - **Never before you check in** (crew presence isn't served then).
  - **Never "going"**: crewmates' RSVPs aren't served.
  - Re-read on focus and pull-to-refresh; presence isn't pushed by socket.
- Each person still **holds their own pass**. The strip never offers to check anyone else in.
- **After your own check-in succeeds**, if you're in a crew and crews are on at this event, offer **"Tell your crew — We're here"** (secondary), one row per crew.
  - It sends once per person per night. A second tap shows "Your crew already knows" (`repeated`).
- **The crew's view:** the "We're here" push, then the crew chat line, then the event, with **Check in when you arrive** (it opens the Scene, not a check-in).
- **When the crew becomes "here"** (2+ checked in): the strip reads "Crew Nebula is here" the next time it's read. There is no live moment, because the server sends no event for it.
- **Draw:**
  - you alone in;
  - 2 of 4 in;
  - everyone in;
  - "We're here" sent / already sent;
  - crews switched off at this event ("Crews are off at this event": the strip hides and "We're here" is refused);
  - you're in two crews at the same event.

**10.7 · Crews in the Room** (Flow 4's Room gains a view; delta prompt R2-D1)
- **Placement:** a segmented control on the Room, **People | Crews**, shown when at least one crew is here or you're in a crew. It is visible only to people checked in.
- **Section header:**
  - "Crews here · 6";
  - a persistent **"Liking as" chip** (emblem 24 + "Nebula ▾"). It appears only when you have more than one valid identity: two crews here, or a crew plus "Just me" if you opted in. The choice is remembered for the night.
- **Crew card** (solid L1, "most here first"):
  - emblem 96 with its ticks, name, "Crew of N · M here now", bio (2 lines), tags as outlined chips, intent as text;
  - **one sentence of overlap** when matching v2 lands, **from the crew's own tags and intent only**. A member's interests or IPL team are people data and never reach a card strangers see (Flow 14);
  - ⋯ → Report this crew's name or bio.
  - **Like for Nebula** is the repeating primary. After a like it becomes a neutral "Liked for Nebula ✓" (it never shows whether they liked you).
- **The first crew like** shows a one-time explainer instead of a confirm: "Likes count for the whole crew. Anyone here from Nebula can like a crew for all of you. Nebula's chat shows who liked." [Got it]
- **Only you from your crew is checked in:** "You're the first from Nebula. Your crew shows up here once two of you are in."
- **What crews see of a solo person who turned it on: nothing different.** Nobody learns you turned it on; the server tells crews nothing. A crew with room for one more just gets "Like for Nebula" on person cards, and a like that can't stand looks exactly like one that did.
- **Solo people:** a card at the top of the Crews view, "Open to joining a crew tonight?", with a switch and a one-line explainer ("Crews with room for one more can see you; nobody else learns you turned this on"). Until it's on, a solo person sees no crews.
- **Liking a person on your crew's behalf:** in the PersonCard, when you're in a present crew with room for one more, the Like becomes "Like for Crew Nebula" / "Like as yourself".
- **Draw:**
  - no crews here;
  - several;
  - you're in a crew / you're solo (opted in or not);
  - liked (a neutral "Liked for the crew");
  - a crew that is too big to like a person (no option shown);
  - crews off at this event;
  - the guardrail refusals (same 404 → "This crew isn't here any more").
- **Haptics:** `H.like` on a like; `H.toggle` on "Open to joining".

**10.8 · It's a Blend** (the group match moment; L4)
- **Different from the 1:1 Match (Flow 4):**
  - two **emblems** (160) slide in and stop, overlapping by ~12% (or an emblem and one creature avatar);
  - "**It's a Blend**" · "Nebula + Orbit · 3 + 4 people" (or "Nebula + one more");
  - "Nobody's named yet. Everyone's on tonight's names until your crew chooses to reveal.";
  - an optional shared-facet line from the public card fields only ("You both: Dance floor · Friendship");
  - **Open the Blend** (primary) / Later.
- The person whose like made it sees the sheet; everyone else gets the push and sees the sheet on next open.
- **It names nobody and doesn't say who liked first.**
- **Motion:** like the Match (DESIGN-BRIEF §9.3 #11, ≤1.2s, skippable), but the emblems **interlock** rather than faces sliding. `H.match` on landing **for the person whose like made it only**; people who see the sheet on next open get no haptic (it's unsolicited).
- **Draw:** crew ↔ crew, crew ↔ person (seen from the crew side and from the person's side), Reduce Motion, arriving by push while the app was closed.

**10.9 · The Blend room**
- A temporary room (kind blend), in Banter under **Live now**. Everyone from both sides who was **checked in when it matched**, speaking in **tonight's pseudonyms**.
- **Header:**
  - both emblems;
  - "Closes in 9h", from the server's clock: it closes 12h after the event ends;
  - **Reveal my crew** (or **Reveal myself** for the solo side).
- **First open:** a context card (WhatsApp's group-safety pattern): "Blend with Crew Orbit · 7 people · made at Bassment · closes 4 am. Everyone here is on tonight's names until they reveal." [Got it] [Leave]
- **Reveal** (L3 sheet; **the only confirmed action in crews**):
  - "Reveal Nebula to this Blend?";
  - "Everyone from Nebula in this Blend who hasn't chosen to stay anonymous will be shown by first name and one photo to the **7 people in this Blend** — and nobody else. Not the Room, not your DMs, not another Blend.";
    - **No names before the reveal.** The server doesn't give them (before a reveal, `name` is null and Blend handles can't be mapped to crew members), and naming the people revealed would let the revealer work out who kept private;
  - "You can't undo a reveal.";
  - **Reveal Nebula** (the gradient primary; the button names the outcome, not "OK") / Not now;
  - after the call, the server's `revealed` and `keptPrivate` counts give "3 revealed · 1 keeps it private";
  - not destructive styling, because it's a deliberate choice;
  - `H.success` on confirm.
- **A solo person in a crew ↔ person Blend** sees "Reveal me".
- **After a reveal:** each side's line reads "N revealed · M keep it private". Revealed members show the collage tile; the others keep pseudonym tiles.
- **After a reveal:** each revealed creature disc cross-fades to the photo in place (`base`, 40ms stagger, no flip, no confetti), and a toast reads "3 revealed · 1 keeps it private".
- **Draw:**
  - fresh, active;
  - someone left (**silently**: no "left" line);
  - a pair blocked (they simply aren't there for each other; nothing is said);
  - revealed on one side / both;
  - "This Blend closes at 4 am" (a quiet line at T-60);
  - closed;
  - closed early ("This Blend has closed.", no reason);
  - a crewmate who arrived after the match: draw nothing for them; the Blend simply isn't listed.
- **Keep:** anyone may leave on their own, and the room goes on.

### Edge-state copy
The full table (caps, full, invites past 12, invite not open, decline, "Done. Nobody's told.", crews off, "We're here" twice, target gone, Blend closed, crew dissolved, removed by the owner) is in [`research/round2/research-crews.md`](./research/round2/research-crews.md) §7.11. **Use the server's sentence where one exists** (gap sweep §2.1). **Never show "X declined", "X hasn't arrived", per-member presence dots, or a "check in your friend" control.**

### Open questions for the owner (before drawing 10.7–10.9)
1. Should the crew chat get a line when someone reveals the crew? (Recommended for accountability; it needs a server line.)
2. Is a moderator-hidden crew told?
3. Are 1:1 DMs or friend requests out of a Blend allowed? The server's friend routes refuse Blend handles today, and either would sidestep the Blend-scoped reveal.
4. Do archived crew chats and closed Blends stay readable?
5. "Blend" is also Spotify's word for a shared playlist. Keep it?

### Fix and watch
- **"Crews view in the Grid"** in plan §6 means the Room's Crews view (10.7). There is no separate Grid screen.
- Crew invites arrive in the bell (Flow 9) as their own row kind. **Join opens the consent screen 10.3**; it is never a one-tap accept.

---

## Flow 11 · Places live: venue detail, Go Live, the venue room

**Status:** built, not designed. Sources:
- API: `docs/API.md` "Venues", "POST /venues/:venueId/live".
- Plan v2 §3 and step 5.
- `docs/PLACEHOLDER_SCREENS.md` §8–§10.
- Research: [`research/round2/research-plus-pass-live.md`](./research/round2/research-plus-pass-live.md).

**What it is.** Every venue has a live room every day (a hidden "venue day"), claimed or not. At a venue without an event, you **Go Live** for 20, 45 or 60 minutes, or **Stay**:
- Stay is 60 minutes, then each presence ping inside the venue's area carries it 20 minutes further, up to 4 hours.
- While live, you're in the venue's room, which works like an event's Room.
- Pseudonyms reset at 06:00.

### Rules (from the API and the owner)
- **Live is a bucket, never a number:** "Under 5 live", "5–9 live", "10–19 live", "20+ live". **Never who.**
- **No check-in boundary is ever drawn.** A refusal says "You're not at ‹venue› yet.", **never a distance**.
- **An event takes over its venue.**
  - From an hour before a public event at the venue until it ends, the venue drops out of Places, and Go Live answers "an event is on here". **Hand off to that event's check-in.**
  - When an event starts while you're live, you're checked out and pushed "An event just started here — tap to check in". The words are ours, never the event's.
- **Going live again while live extends, never shortens**, and the room isn't told. Going live elsewhere, or checking in to an event, ends it as a switch.
- **When it ends, it ends at that second.** The room closes to you: "You're not live here any more. Go live at the venue to join today's room."
- **Never sold** (plan §9.3): seeing a venue's room without going live. "Stay" may later need Blend'n+, but it's free today.

### Screens

**11.1 · Venue detail** (`/venue/[id]`; replaces the placeholder)
- **Content:**
  1. hero: venues have no photo, so use tonight's event cover if there is one, else **type-based art** (bar, café, club, brewery…) in the brand language
  2. name, type, area
  3. the **live bucket**
  4. tonight's event at the venue (it opens the event)
  5. a small static map, with no boundary
  6. **Go Live** (primary, docked)
  7. "Own this place? Claim it" (a quiet link to the dashboard host; never a button, never in the dock)
- **The state you see depends on where you are:**
  - not here: Go Live is enabled, and the refusal comes from the server;
  - here and live: the dock shows the live pill + countdown, **Open the room**, and Leave.
- **Draw:**
  - not live / live / live with "Stay";
  - an event on here ("Friday session is on here" + **Check in to it instead**);
  - out of range;
  - under age;
  - a venue taken over (`closedReason: event_live_here`: it doesn't appear in Places, but a deep link still lands here with the event's card + **Check in to it**);
  - no check-in area (`closedReason: no_check_in_area`: "You can't go live here yet");
  - the live bucket hidden (`liveNow: null`);
  - closed or unknown venue;
  - loading / failed.

**11.2 · The Go Live sheet** (L3)
- **Copy:** "Go live at Toit". Then: "People in Toit's room tonight see you by your nickname for today. Outside the room, Toit only shows how busy it is — never who."
- **Choices:** 20 min · 45 min · 1 hour · **Stay while I'm here** ("Keeps you live as long as you're at Toit, up to 4 hours"). If Plus gating is on, Stay is locked with the server's sentence: "Staying live is part of Blendn+."
  - This is the same shape as WhatsApp's and Find My's sharing choices: three fixed durations plus one open-ended.
  - Default: 20 minutes the first time (the privacy-protective choice), then the last one used.
  - "You can end it anytime." under the button.
- The primary is **Go Live**. It reuses the check-in **hold**: Go Live puts you in a room other people can see, so it takes the same deliberate act. A screen-reader activation goes straight through.
- **Draw:** the default choice, Stay selected, Stay locked behind Blend'n+ (a proposal frame for when Plus gating turns on), busy, and each refusal.

**11.3 · Live: the pill, the countdown, the centre button**
- **The centre Blend'n button** shows **live** (state d) for a venue too. The Room header says "Live at Toit · 32 min left".
  - **Variant to show (research §C7):** the disc's **fill level is the time left**: a still level, stepped once a minute, never animated between steps. It's "the pour" in reverse; Extend refills it with the rise from DESIGN-BRIEF §11.4. Show it next to the plain full disc and let the owner pick.
  - Nothing ticks at rest: no per-second countdown on the tab bar.
  - **(c′) "Go live · Toit"** (the disc inviting Go Live when you're inside a venue with no event): a proposal. The button computes its state from events today, and needs venue check-in-area data first.
- **The live pill** (glass, in the venue Room header, on venue detail and on the home map):
  - "● Live · Toit · 32 min", **minutes only, updated once a minute**;
  - in the **last 5 minutes**: mm:ss in Geist Mono ("4:59") plus an **Extend** chip. Seconds only matter when an action is due;
  - with Stay: "● Live · Toit · staying";
  - tap opens a small session sheet with the time left, plus:
    - **Extend**, offered in the last 5 minutes and labelled with the new end ("Live until 22:10"; going live again extends, never shortens);
    - **End**, which confirms (check-out always confirms).
- **Outside the app** (**sketch, for later**: DESIGN-BRIEF §11.6):
  - **Android:** an ongoing notification, "Live at Toit", with a chronometer counting down. **No action buttons**; a tap opens the session sheet. On Android 16 QPR1+ it's promoted to a Live Update chip (icon + "32m").
  - **iOS:** a Live Activity (compact: the disc glyph + "32m"; expanded: venue, time left), with no buttons.
  - **Never an offer, perk or upsell there.** Both platforms forbid promotions in these surfaces.
- **Draw:** live, under 5 minutes, Stay, extended, End confirm. The Android ongoing notification and the iOS Live Activity (compact and expanded) are labelled "Sketch — later".

**11.4 · Expiry**
- **5 minutes before the end:** a **local** notification scheduled by the app from `expiresAt` (the server sends no pre-expiry push), plus the pill's last-5-minutes state (it stays monochrome glass, with mm:ss and a solid warning chip, "Ending"): "Your time at Toit ends in 5 min" → **Extend** (opens the sheet). Proposal for later: "Stay with Blend'n+".
- **At the end** (a sheet if the app is open, else a notification that opens it):
  - "Your live time at Toit is up" / "Still here?";
  - **Extend 20 min — free** (the gradient primary);
  - **Stay while you're here with Blend'n+ · up to 4 h · from ₹49** (a full-width **solid** secondary button, since glass inside a sheet is glass on glass. Shown at most once per venue day, never on someone's first Go Live; a proposal frame until Plus gating turns on);
  - **Done for now**.
  
  The free option gets the gradient on purpose: India's dark-patterns guidelines name a bold paid "Yes" beside a faint free "No" as interface interference.
- **After it ends:** the room shows the NOT_LIVE state ("You're not live here any more. Go live at the venue to join today's room.") with **Go live again**.
- **Draw:** the warning, extended, ended, ended at the 06:00 reset ("Today's room has closed. Tomorrow's opens at 6").

**11.5 · An event started here** (the hand-off)
- **The push:** "An event just started here — tap to check in" → the event's Scene, with the CTA ready to **Blend in** (the hold).
- **In the app:** the venue Room closes with a calm notice, "An event just started at Toit" + **Check in to {event}**. Data note: the `live:ended` socket carries the venue day's id, so the app re-reads the venue to get the event.
- **Every other `live:ended` reason gets its own calm state:** expired, the 06:00 reset, switched to another place or event, left the area, left by you.

**11.6 · The venue room**
- The Room (Flow 4) with a **venue header** instead of an event header: the venue, the live pill, **Leave**.
- The roster, Meet next, crews and chat behave as at an event. The chat is the venue day's room, with pseudonyms reset daily.
- **Draw:** the differences from an event Room only, as a delta in the Flow 4 project.

**11.7 · The home map, lit** (the next map; delta prompt R2-D4)
- **Event buildings** in the ember/orange ramp (brighter when live). **Open venue buildings** in the violet/rose ramp.
- A soft **glow** where no building exists, with intensity in steps (a few / busy / packed), **never a number**.
- **Never a boundary polygon.**
- Map art is content-layer. No UI control on the map glows.
- **Draw:** dark base styled in the Ember palette, pitched at 45–60°; tap a lit building to open its card in the drawer.

---

## Flow 12 · Blend'n+: the paywall, Night Pass, manage (proposal frames)

**Status:** planned. There is no server yet: no entitlements and no store webhook. The only thing served is `PLUS_REQUIRED` on Go Live's Stay ("Staying live is part of Blendn+."), and that gate is off today. Draw these as **proposal frames**, labelled.

Sources:
- Plan v2 §9.3 and step 11.
- Client `ROADMAP.md` "Validated — not doing".
- Research: [`research/round2/research-plus-pass-live.md`](./research/round2/research-plus-pass-live.md) §A.

### Rules (owner rulings + store rules + Indian law)
- **Prices:** ₹199/month · ₹499/quarter · ₹1,499/year · **Night Pass ₹49** (one night, until 06:00, doesn't renew).
  - **Apple and Google in-app purchase only. Never Razorpay inside the app.**
  - Every price goes through the `Price` component (Geist Mono, ₹).
- **What it buys:**
  - staying live while you're there (Stay, past the free window);
  - partner perks;
  - full night history (beyond the last 3 nights);
  - cosmetics;
  - crew extras (a crew photo seen only inside the crew; your pick of the 12 emblem palettes).
- **Never sold, at any price** (quote): "seeing who liked you; more asks or board requests than the caps allow; seeing a venue's room without going live there; a way round the reveal; boosting yourself in someone's Grid … **A paywall screen that offers any of them is wrong, however it converts.**"
- **The billed price is always the biggest number.** "₹1,499 / year" is large; "About ₹125 a month · Save 37%" is small. Google Play counts it as a violation when an annual plan shows its monthly-equivalent price most prominently.
  - Savings are computed at runtime from the store's localized prices.
  - No "Most popular" badge until data supports it.
- **Night Pass is a separate row, never a plan card:** "Just tonight · ₹49 · doesn't renew". It is a different product type on both stores, and Apple won't sell it as an auto-renewing subscription.
- **No dark patterns** (India CCPA 2023 guidelines):
  - the free path always gets a full-weight button;
  - "Not now" is plain text with no guilt (never "No thanks, I'll leave early");
  - the CTA carries the price ("Continue — ₹49"), so nothing is hidden;
  - cancelling is one tap from Settings into the store;
  - a reminder before a trial converts.
- **No paywall in onboarding**, during the event hand-off, inside a Live Activity or Live Update, or on someone's first Go Live.
- **Cooldowns:**
  - a system-initiated upsell at most once per night per trigger, and 2 per 7 days;
  - 3 dismissals in 30 days stops them for 30 days;
  - a person's own tap on a locked item always opens the sheet.
- **Launch season:** while a city is in launch season, everything is unlocked and the sheet is skipped. A one-line toast replaces it: "Free during launch in Bengaluru — until 30 Nov."

### Screens

**12.1 · The "Tonight" sheet** (L3, contextual)
- **Opens from:** a Stay tap, a locked perk, a locked night, a crew extra, or the Plus row of the expiry prompt (Flow 11).
- **Content:**
  - an outlined icon (a disc with a level line), the headline of what was tapped ("Stay live while you're here") and one line;
  - **Just tonight · ₹49** (preselected) and **Blend'n+ monthly · ₹199/month**;
  - **Continue — ₹49** (the gradient primary; its label follows the selection);
  - **The free path is always a full-weight button.** For a Stay tap it's **Go live for 1 hour — free**; for any other trigger it's **Not now** as a secondary button, not a text link;
  - "See all plans";
  - a footer: "Prices include GST. Terms · Privacy · Restore purchases".
- **Draw:**
  - each trigger's headline;
  - purchasing (the store sheet over it);
  - success (the locked thing simply works, with a one-line confirmation);
  - cancelled by the store;
  - failed;
  - pending (Android);
  - launch-season (skipped).

**12.2 · The Blend'n+ page** (full screen; from Me, Settings, "See all plans")
- **One scrolling page, not a multi-step flow.** Google lists multi-screen flows that lead to accidental subscribes as a violation.
- **Content, top to bottom:**
  1. The gradient mark + "Blend'n+". One line, e.g. "More of the night, none of the creepy stuff."
  2. **What you get:** outlined rows, benefit first.
  3. **"Never for sale, on any plan"**: a quiet hairline panel listing the five never-sold things in plain words. **This is the page's memorable detail.**
  4. **Plans** (monthly preselected), then the Night Pass row set apart by a divider.
  5. The trial timeline (only when eligible): "Today: everything, free · Day 12: we'll remind you · Day 14: ₹199/month starts — cancel before then and you pay nothing".
  6. **Start Blend'n+ — ₹199/month** (the gradient primary) or **Start free trial**.
  7. The legal footer, with platform-specific renewal wording.
  8. "Not now" always visible top-right, with no delay timer.
- **Draw:** iOS and Android footers, trial-eligible and not, a launch-season city, already subscribed (it becomes Manage).

**12.3 · Manage** (Settings › Blend'n+)

One state per subscription status, each with its copy:
- launch season
- trial ("₹199/month starts 17 Oct. We'll remind you on 15 Oct.")
- active ("renews 3 Nov · ₹199 · Google Play")
- cancelled but still active
- **grace period** (payment failed, still active: "Fix it in Google Play to keep Blend'n+ after 6 Nov.")
- **account hold** (paused until fixed)
- paused
- expired
- **refunded** (off immediately; no blame)
- Night Pass active ("until 6 am")
- referral month

Actions: **Manage in Google Play / App Store** (one tap) and **Restore purchases**.

**12.4 · Locked states elsewhere** (deltas)
- **Going → Past** beyond the last 3 nights: a single "Your earlier nights are in Blend'n+" row, not a blur.
- **Crew extras** (crew detail): locked options.
- **Stay** in the Go Live sheet: a small "Plus" mark.
- **Plus lapses during Stay:** inline only, "Your Blend'n+ ended, so you're live for 20 more minutes." Not a paywall.

---

## Flow 13 · Regulars: blind offers, the door pass, "let this venue know" (proposal frames)

**Status:** planned (plan v2 §2, step 12). No server yet. Draw as **proposal frames**.

Sources: plan v2 §2; [`research/round2/research-plus-pass-live.md`](./research/round2/research-plus-pass-live.md) §B and §D.

### Rules (owner rulings + DPDP Act)
- **Blind targeting.** A venue picks *who* by a rule (regulars: 3+ nights in 30 days; lapsed: none in 30 days; first-timers; everyone live) and Blend'n delivers the offer. **The venue never sees which people**, only sent / opened / redeemed counts.
  - **An audience under 5 is refused**, so no one can be singled out.
  - Only visits after the venue's claim count.
- **An offer must read as Blend'n telling you about a venue, never as the venue knowing about you.** Every offer explains itself ("Why you got this").
- **Visible regular is opt-in, per venue, and revocable in one tap.**
  - Withdrawal must be as easy as consent (DPDP s.6(4)).
  - The switch is never pre-ticked.
- **Offer pushes need an explicit opt-in** (Apple 4.5.4) and their own Android channel ("Offers from venues"). Offers still appear in the app without it.
- **Nothing in the app lists "regulars"** or shows anyone a score a venue could see.

### Screens

**13.1 · Passes & offers** (Me › Passes & offers; a quiet line "You have an offer here" on the venue page)
- **Offer card:** venue, the offer ("First drink on the house"), the window ("Thu–Sun, before 10 pm"), validity ("until Sun"), **Use at the door**, and **Why you got this ▸**.
- **"Why you got this"** expands inline, with one sentence per audience. For regulars: "Toit sent this to everyone who's been there 3 or more nights this month. **Blend'n picked who — Toit never sees the list.** Toit only sees how many were sent, opened and used."
- The footer is the same on every offer: "Offers only go to groups of 5 or more, so no one can be singled out. Turn off offers from Toit · Turn off all offers".
- Keep **offers** (given) visually separate from Blend'n+ **perks** (bought).
- **Draw:** none, one, several, used, expired, offers from a venue turned off.

**13.2 · The door pass ("the pour")** (full screen, dark)

The pass reuses the centre button's disc. The brand gradient sits inside it as a **liquid whose surface stays level when the phone tilts**, so staff can say "tilt it" and see it respond. It can't be screenshotted into working; this is the transit-ticket anti-fraud pattern.

- **Content, top to bottom:**
  1. venue name (large), the offer, "Today only";
  2. the disc: a slow surface wave, small bubbles that always rise toward real "up", the ink mark at the centre;
  3. a **live clock** in Geist Mono with ticking seconds: `21:42:07 · FRI 3 OCT`;
  4. optional **tonight's word** plus a tint shift, from a daily server seed;
  5. a staff zone: "**Staff:** press and hold to redeem", a full-width button that fills like a pour (~1s).
     - Accessible path: a screen-reader or Switch Control activation redeems directly, with the label "Redeem — staff only. Works once today."
- **On redeem:** `H.success`. The liquid settles to a **solid fill** and stamps "Redeemed 21:43".
- **Behaviour:**
  - brightness raised to ~85% while open;
  - screenshots blocked on this screen only;
  - it works offline (the redeem queues and syncs);
  - **Reduce Motion, and the in-app "Ambient motion" setting, stop the wave and bubbles but keep the tilt response and the ticking seconds.** Those are the security function, and WCAG 2.2.2 exempts essential motion.
  - The pass's gradient liquid is a listed exception to the gradient rule (DESIGN-BRIEF §21).
- **Draw:** not yet valid ("Valid from 7 pm", empty disc), live, redeemed, offline redeemed ("will sync"), already used today, expired, the first-time explainer ("Show this to the staff. They'll hold the button to mark it used — it works once, today.").
- **Open for the owner:** the ruling says staff *tap* "Redeemed"; the research recommends a 1-second *hold* (so a pocket or guest mis-tap can't spend a single-use pass). Also whether to keep tonight's word.

**13.3 · Offer notifications consent** (asked in context, the first time an offer exists for you; never in onboarding)
- "Offers from places you go. Venues on Blend'n can send offers to their regulars and newcomers. They never learn who got them."
- **Turn on offer notifications** / Not now.
- "You can turn this off anytime in Settings › Notifications › Offers."
- **The offer push itself:** the "Offers from venues" channel, private on Android lock screens, and **no venue name on the lock screen** ("An offer from a place you go"). The venue shows inside the app.

**13.4 · "Let Toit know you're a regular"** (on the venue page, only to people who qualify)
- **An itemised notice:**
  - "Toit will see: your first name and profile photo · how many nights you've been to Toit since it joined Blend'n";
  - "Toit won't see: your chats, who you met, or anywhere else you go";
  - "Why: so the staff can say hi or look after you".
- **Let Toit know** / Not now.
- **Once on:** "**Toit knows you're a regular** · Turn off". It turns off in one tap, with no confirmation sheet. Afterwards: "Done — Toit no longer sees you as a regular. Offers to regulars still reach you without your name."
- **Draw:** offer, on, turned off, not eligible (nothing shown).
- **The "Regular here" badge** (Flow 14) is shown only at that venue.

---

## Flow 14 · Matching v2: overlap lines, new profile fields, badges

**Status:**
- **Built, not designed:** expertise (`GET /work-fields` → `expertiseByField`, max 3) and the owner-only matching fields.
- **Planned (proposal frames):** everything else.

Sources: plan v2 §8; `docs/API.md` "Matching inputs on the profile", "Expertise"; gap sweep §2.7, §3.3, §4.3–4.4.

### Rules (owner rulings, plan v2 §8)
- **"Rank on what people chose and did. Display what they are."**
  - **Positive only.** At most two labels per card. **Never a mismatch, never a number or percentage.**
- **Privacy tiers for every label:**
  - **A, chosen tastes** (interests, IPL team, this-or-that, artists, intent): always.
  - **B, origin-like** (languages, home state, sign, work field): only in rooms of 8 or more, and **one Tier B label per card** before reveal.
  - **C, identity** (college, neighbourhood, employer, usual spots, prompts, photos): after reveal only, and never computed as an overlap.
- **Sign:**
  - opt-in and off by default; the person **picks** it (prefilled from date of birth, labelled "Western");
  - "My rashi instead" offers Mesha…Meena;
  - never "incompatible", never birth time or place.
- **Never build:** caste, community, religion, gotra, surname, kundli, skin tone, veg/non-veg, height, education level, income, college or neighbourhood before reveal.
- **Badges can't be bought.** They come from GPS check-ins:
  - "Regular here" (3+ visits in 60 days, shown only at that venue);
  - "Shows up" (≥80% of RSVPs, minimum 3, opt-in);
  - "5+ nights this month" (a tier, never a count);
  - **no daily streaks.**

### Screens

**14.1 · One sentence of overlap** (PersonCard, Meet next, crew cards; deltas in Flow 4)
- One line, the strongest overlap: "Both CSK — in RCB country 💛", "You both picked filter coffee over chai ☕", "Both at 3 nights before".
- Then the chips (intent, IPL, one this-or-that, sign if opted in, artist), and an icebreaker from the top overlap ("Ask: best Anuv Jain gig you've been to?").
- **Draw:** strong overlap, weak, nothing shared ("Both here to make friends", never empty), a room under 8 (no Tier B label), a crew card's overlap from crew tags and intent only ("Both crews: Techno heads · out for friendship").

**14.2 · New profile fields** (Edit profile; delta in Flow 6)
- Languages (+ "Learning Kannada"), home state, sign (Western or rashi), this-or-that (12 Bengaluru questions, answered as a quick two-choice deck), IPL team, artists (3, curated). (Not cuisine: "cuisine loves" is a veg/non-veg proxy, on the never-build list.)
- **Each field says who sees it and when:** "Shown to people you match with in rooms of 8+".
- **Draw:** empty, answering this-or-that, filled, sign off/on, the "who sees this" line for each tier.

**14.3 · Expertise** (served today; delta in Flow 6 and onboarding "journey")
- The second step of the field-of-work picker: **up to 3** expertise chips for the chosen field. They are pruned silently if the field changes.
- On the card, a "Core expertise" row.

**14.4 · How you match** (Settings; new)
- One home for the owner-only matching inputs:
  - intent default;
  - **only while Dating is chosen** (a networking user is never asked their gender): gender, interested-in (**nobody but you sees these**), and orientations + "show on profile" (max three);
  - work field + expertise.
- **Dating fields appear only while Dating is chosen, and only 18+.**
- Every field says who can see it.

**14.5 · Badges** (Me, cards)
- "Shows up" (an opt-in switch), "5+ nights this month", and "Regular here" (only at that venue).
- **Draw:** earned, not yet (no locked badge grid: badges simply appear), opt-in off.

**14.6 · The match band** (proposal; not served)
- **Strong / Good / Some**, never a number:
  - **Strong:** two or more shared interests, at least one rare in that room;
  - **Good:** one or more shared;
  - **Some:** nothing shared, compatible intent.
- It degrades honestly: a room sharing nothing shows "Some", not a fabricated 34%.

**14.7 · Blend'n Wrapped** (proposal)
- A private monthly recap ("You keep matching with chai people"). **Shared only if the person chooses** (Flow 16's Story card).

---

## Flow 15 · System states nobody has designed

**Status:** built, not designed. Most of these are states the server **already sends** and the app mishandles today (P0 in the gap sweep, [`research/round2/gap-sweep.md`](./research/round2/gap-sweep.md) Part 3).

| # | State | Today | Design |
|---|---|---|---|
| 1 | **Account suspended** ("This account has been suspended. Contact support@blendn.app if you think that's a mistake.") | One red line under the sign-in buttons, which stay offered | A full screen: the sentence, a tappable support email, the appeal path, **no sign-in buttons** |
| 2 | **Staff account** ("This app is for attendees. Organisers, venue owners and sponsors sign in at the dashboard.") | Inline line; on a cold start the sentence is lost | A screen with a link to the dashboard |
| 3 | **Deleted account** (the server never confirms deletion) | "Couldn't sign in with Google. Please try again." forever | Neutral copy that stops inviting retries: "We couldn't sign you in with that account" + Support |
| 4 | **Signed out mid-use** | "Session expired…", then a small notice | A reason-aware notice on the landing (signed out elsewhere / password reset / suspended) |
| 5 | **Removed from a room** (`USER_BANNED`) / **Go Live ended** (`NOT_LIVE`) / **room gone** (404) | All show "Couldn't load this chat / Check your connection" | Three full-room states with the right action (none / **Go live again** / back) |
| 6 | **Banned composer**; **mute arriving live** (`chat:memberMuted`, unhandled today) | A toast; the composer stays enabled | The composer flips to banned or muted as it happens, and back at expiry |
| 7 | **Every composer reason**, including `not_open_yet` ("This chat opens 24 hours before the event starts"), `not_live`, `hidden`, `archived` | Two reasons share one line | One state each (extends Flow 5) |
| 8 | **Pre-event room** (served: opens 24h before, for going/saved) | Not shown anywhere | A countdown header ("Opens in 3h 20m") and its two refusals |
| 9 | **Event links refused**: age-gated, unfinished profile, broken link | "Check your connection" | **Age-gated** (with "Add your age" when unknown: the one fixable refusal), **Finish your profile**, **This link is broken** |
| 10 | **Event no longer available** (the organiser was suspended) and **cancelled** | "Event not found" / a plain Scene | A calm "No longer available" landing; a designed Cancelled Scene |
| 11 | **"This isn't here any more"**: a crew dissolved, a Blend closed, a conversation ended (**remove its composer**), a venue gone, rating unavailable | Assorted raw errors | One pattern, with per-object copy |
| 12 | **Unknown links**; **links tapped while signed out** | The built-in "Unmatched Route"; links dropped | A branded not-found screen; "Sign in to open this", holding the link through sign-in |
| 13 | **Can't reach Blend'n / maintenance** (5xx on a cold start with a stored session) | The app opens to tabs where everything fails | A full screen that keeps the session and retries |
| 14 | **Update required** (needs a server field first) | Nothing on either side | A screen with a store button. Design it now |
| 15 | **Rate-limited reads**; **field validation errors** (`VALIDATION_FAILED` shows raw) | "Check your connection"; "Validation failed" | "Slow down — try again in a minute"; inline field errors |
| 16 | **Offline** on the screens without a banner (profile, friends, settings, venue, rate, board) | Nothing | The offline banner everywhere it applies |
| 17 | **Polls in a room** (served; no component) | Not rendered | A poll bubble: open, voted, closed. **Withheld counts**: "Fewer than 5" and "Results when it closes" (`null` means withheld, never zero). The 409 sentences |
| 18 | **Waved** (`WAVE_TOO_SOON`) | A disabled button, no text | A still "Waved" state on the card |
| 19 | **Friend link refused** (unfinished profile, rate limit) | "This link didn't open" | "Finish your profile to add friends"; a rate-limit state |
| 20 | **Live Activity / Android ongoing notification** while checked in or live (**sketch, later**) | — | Counts only, never names, never organiser text, never promotions, no action buttons (Flow 11.3) |
| 21 | **Realtime cut by the server** (a refused socket join, or eviction on deletion or suspension) | Logged only; later "Live updates paused." | A reasoned state, not "paused" |
| 22 | **Check-in refusals with a fix** (unfinished profile, unknown age) | A tray with no action | Tray actions: **Finish profile**, **Add your age** |

**Don't design these (the server never sends them, or the product cut them):** "event full" at the door (capacity never refuses), `ALREADY_CHECKED_IN`, a profile-strength meter, phone OTP, "Create", "Circles", friends-here faces, a `@handle`, a "who's interested" list.

**Decide, then draw or delete:** organiser tools on the Scene (Edit / Announce / Delete, reachable by an attendee who also organises); the `/preview` screens being reachable in production; `goals` / `looking_for` (edited, read by nothing); conversation pinning (no rail exists).

---

## Flow 16 · Sharing and link previews: share sheets, OG cards, Story cards, public pages

**Status:** needs build. **Today an event shares as plain text (title, venue, address) with no link**, so there's no preview in WhatsApp and no way back into the app. Only friend invites have a link (`www.blendn.app/f/<token>`, with a static, light card). Events and venues have no public pages.

Sources: [`research/round2/research-sharing-og-push.md`](./research/round2/research-sharing-og-push.md) (with measured preview behaviour and competitor cards).

### Rules
- **Shareable:**
  - an event (public or unlisted, published, not past);
  - a venue;
  - your friend invite;
  - your own monthly recap (an image, with no link to any person).
- **Never shareable. Hide the share control entirely; don't disable it:**
  - people and profiles (including your own);
  - matches, reveals, crews, crew presence;
  - rooms and messages, Board posts;
  - check-ins, live presence, live buckets;
  - who's going;
  - private events.
- **Never generate "I'm here" content.** No share prompt after check-in.
  - The Story card says nothing like "I'm going" unless the person turns on a "Say I'm going" toggle (default off).
- **A card is a frozen snapshot.** WhatsApp and iMessage build the preview on the sender's phone at the moment of sending.
  - So a card never carries counts, live data, who's going, or **the sharer's identity**. A creature or handle on a card would tie a pseudonym to a phone number for everyone it's forwarded to.
- **No user identifier in any URL.** Links use the event's or venue's UUID, never the slug: the slug is the title, guessable and leaky.
- **No event price.** The product shows none; the public page doesn't either.
- **Public pages carry no live data at all, not even buckets.** An unauthenticated page could be polled to build a venue's occupancy timeline.
- **Public pages carry no tracking pixels and no cookies.** The visitors aren't users and may be minors.

### Screens

**16.1 · The share tray** (one custom tray, both platforms; opens from Share on an event, a venue, or your invite)
- **Content, top to bottom:**
  1. **the actual card preview** ("This is what they'll see": the privacy feature);
  2. title + date line;
  3. four actions: **WhatsApp** (one tap, the biggest channel in India) · **Instagram Story** · **Copy link** · **More…** (the real system share sheet).
- **The message text sent with a link:** "Neon Nights · Sat 4 Oct, 9 PM / Toit, Indiranagar / https://www.blendn.app/e/…"
- **Instagram Story:**
  - shares the 1080×1920 card as an image;
  - before Instagram opens, the link is copied with a toast: "Link copied — add it with the Link sticker" (a Story can't carry a tappable link otherwise).
- **Entry points:**
  - the Scene header's share icon;
  - after RSVP "Going", a "Bring someone?" row (WhatsApp first: the highest-intent moment);
  - a Going row's overflow;
  - venue detail;
  - Friends › Invite.
- **Draw:** event, venue, invite, copy confirmed, WhatsApp not installed (falls back to More…), an unlisted event (area only, no street address).
- **Haptics:** `H.primary` on the share action; none on the tray opening.

**16.2 · Link preview cards (OG images)** (1200×630, JPEG ≤200KB, dark `#0D0C0C`)
- **Shared grid:**
  - **everything that must survive lives in the centre 630×630**, because WhatsApp sometimes crops to a square;
  - 56px margins;
  - minimum text 48px;
  - Satoshi for words, Geist Mono for dates and "18+";
  - the title lives in `og:title`, **not** burned into a covered card.
- **E1 · Event with a cover:**
  - left wing: the date stack (day, a big date numeral, month, time) in Geist Mono;
  - centre: the cover square. A non-square flyer is **contained on a blurred, darkened copy of itself**, never cropped (DICE's card crops its own artist name);
  - right wing: the gradient monogram and an "18+" chip (orange, dark text).
  - **Cancelled:** a "CANCELLED" band across the date, with the date struck through.
- **E2 · Event without a cover:** typographic. The date line in orange Geist Mono, the title (Satoshi Bold, ≤3 lines), venue · area, and a giant monogram outline at 8% bleeding off the edge.
- **V1 · Venue:** typographic (venues have no photos). A "VENUE" eyebrow, name, type · area. **No live bucket, no counts, no "open now".**
- **F1 · Friend invite:** a dark redesign of today's light card. The monogram, "You're invited to Blend'n", "A friend wants to add you." **The same file for every token, with no inviter.**
- **A1 · App default:** the same layout as F1, with the tagline.
- **Draw:**
  - each template, at full size **and** as it appears in a WhatsApp bubble (dark and light chat themes), an iMessage rich link, and a square crop;
  - long titles;
  - non-square flyers;
  - cancelled.

**16.3 · Square and Story cards**
- **Square 1080×1080** (share-as-image): the cover on top (contain + blur), then a band with the date, title (2 lines) and venue.
- **Story 1080×1920:**
  - keep the top 250px and bottom 340px clear (Instagram UI and the Link sticker);
  - a 952×952 cover card (radius 40) over a faint orange→violet bloom;
  - date, title, venue;
  - a small `blendn.app/e/…` line for people who don't add the sticker.
- **Monthly recap Story** (Flow 14.7):
  - "Your September";
  - 2–3 stat tiles (nights out, venues, neighbourhoods) with big Geist Mono numerals.
  - **No people, no venue names by default** (a "Show top venue" toggle, off by default), **no dates.**
  - Only complete past months.

**16.4 · The public event page** (`www.blendn.app/e/<uuid>`, rendered server-side, mobile-first, dark)
- **Content, in order:**
  1. the cover, contained (up to 4:5)
  2. title
  3. date and time in Geist Mono ("SAT 04 OCT · 9:00 PM IST")
  4. venue name and area (linking to `/v/<uuid>`)
  5. an "18+" chip
  6. the organiser (confirm against the "labels-only hosts" ruling)
  7. the short description
  8. **Open in Blend'n** (primary)
  9. **Get it on Google Play**, then the App Store (Play first: ~93% of traffic is Android)
  10. one line: "Meet who's there on the night." **No numbers.**
- **States:**
  - public;
  - unlisted (area only, no street address, not indexed);
  - cancelled (a ribbon);
  - ended ("This event has ended" + the venue's upcoming public events);
  - private / draft / deleted / suspended / unknown: **one identical "This event isn't available" page** (with the app CTA), so the page can't be used to test whether an id exists or is private.
- **Draw:** each state on a phone browser, plus the Android "Open in app" bar and the iOS Smart App Banner.

**16.5 · The public venue page** (`/v/<uuid>`)
- Name, type, area and city, address, upcoming public events as cards (linking to `/e/…`), and Open in Blend'n.
- **No live data.**
- **Draw:** with events, without, unknown venue.

**16.6 · The friend invite page** (`/f/<token>`, exists)
- Keep today's copy, dark-redesigned.
- **No inviter identity, and no token check on the web**: the app validates, so the page can't be used as a token oracle.

**16.7 · Arriving from a link**
- Installed: the link opens the event or venue in the app.
- Not installed:
  - Android routes through Play with an install referrer, so after onboarding the app opens that event;
  - iOS lands on the Pulse in v1.
- **Draw:** "You were sent Neon Nights" as a one-time banner on the Pulse after onboarding (Android), and a link to an event that is no longer available (Flow 15 #10).

### Open questions for the owner
1. Show the organiser's name on public pages, given the "labels-only hosts" ruling?
2. Are the store listings public yet? That decides whether the Smart App Banner and store badges can ship.
3. Is there a Meta developer app? Native Instagram Story sharing (with a sticker) needs one. Until then, the Story card is shared as an image.

---
