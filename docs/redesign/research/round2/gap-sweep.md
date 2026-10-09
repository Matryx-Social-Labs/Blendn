# Round 2 gap sweep: what the product needs on screen that has never been designed

> **Note (2026-10-03):** the drafting problems in §3.4 ("another session is writing SCREENS-ADDITIONS.md") were this pack's own draft. Every fix in that table has been applied to `SCREENS-ADDITIONS.md` Flows 10–11.


Read-only inventory for extending the Claude Design brief (`blendn/docs/redesign/DESIGN-BRIEF.md` + `SCREENS.md`).
Sources: admin `origin/dev` @ `3852f15` (read with `git show`), client worktree `redesign-brief` @ `393ab46` + the design-pack commit `b46688d`. Written 2026-10-03.

Conventions: `API.md:N` = `blendn-admin/docs/API.md` on origin/dev. `admin:path:N` = a file on admin origin/dev. `client:path:N` = a file in the client worktree. "Plan v2" = `seville/.context/plans/product-completion-plan-v2.md` (local, not in git; it is the source the ROADMAPs cite as "plan §n"). Where the plan and the shipped server disagree, **the server wins** and it is flagged.

---

## PART 1 — Notification catalogue

### 1.1 How a notification is made (applies to every row below)

- **One writer.** Every push goes through `sendPushNotification` / `sendBulkPushNotifications` (`admin:lib/push-notifications.ts:334`, `:416`). Each writes the bell row **before** the token lookup, so the bell holds what was *sent*, not what was delivered: push off, no device, or an expired token still produce a bell row (`:217-239`, `:421-453`; `API.md:2623-2629`).
- **Not in the bell:** `private_message`, `group_message`, `event_checkin` (`NOT_IN_THE_BELL`, `:115-119`). Messages have their own inbox (Banter list + room badge).
- **Stored body ≠ pushed body** for the three content-bearing kinds (`storedBodyFor`, `:270-280`): DM → "Sent you a message", room → "New message in the room", announcement → "Posted an announcement". Every other kind is stored verbatim (fixed copy).
- **Delivery** is chosen by `deliveryFor(data.type)` (`:70-99`), never by the caller:

| Kind(s) | Android `channelId` | iOS `threadId` / `collapseId` / Android `tag` |
|---|---|---|
| `private_message` | `messages` | `dm:{conversationId}` — **replaced in place** |
| `group_message` | `rooms` | `room:{chatGroupId}` — replaced in place |
| `event_update` | `events` | `event:{eventId}` — replaced in place ("only the latest state is true") |
| `rating_request` | `events` | `rate:{eventId}` — replaced in place |
| `announcement`, `waitlist_promoted` | `events` | `threadId: event:{eventId}` only — **stacked, never replaced** |
| everything else (match, reveal_request, reveal, board_*, friend_*, message_request*, crew_invite, crew_here, blend) | `messages` | none — one notification each |
| payload with no type | `default` | none |

- The app creates the channels (`client:lib/notifications.ts:80-102`): `messages` "Messages and people" (HIGH, "Direct messages, friend requests and matches"), `events` "Events" (HIGH, "Changes to events you are going to, reminders and organiser announcements"), `rooms` "Room replies" (DEFAULT, "Someone replied to you in an event room"), plus legacy `default` (MAX). **Gap:** no channel description mentions crews, "We're here", Blends or ratings, though `crew_*`/`blend` ride `messages` and `rating_request` rides `events`.
- `badge` is never set by any caller and the client sets `shouldSetBadge: false` (`client:lib/notifications.ts:62`) → **the app icon never shows a count** on either platform.
- Notification icon/colour: `assets/logo/monogram-white.png`, `#F05524` (`client:app.json:117-121`).

### 1.2 Every kind the server can send

Identity rule for all of them: **a lock screen is not an authenticated surface** (`admin:lib/push-notifications.ts:530-553`; `API.md:1193-1210`). "Names nobody" below means neither real name nor pseudonym.

| # | Kind · trigger (writer) | Recipient | Title / body as written (exact) | `data` | Bell? | Client on tap today (`notificationTarget`, `client:lib/notifications.ts:315-518`) | Gaps |
|---|---|---|---|---|---|---|---|
| 1 | `private_message` · DM sent (`notifyPrivateMessage`, `push-notifications.ts:659`; caller `app/api/mobile/conversations/[conversationId]/messages/route.ts:415-436`) | Recipient, when the conversation goes read→unread; while unread, at most once per 5 min (`DM_PUSH_WINDOW_MS`, `:129`) | **Title** = `displayNameInConversation(...)` — the **pseudonym until that side reveals**; real name for a message-request or friend conversation. **Body** = message text clipped to 100 (`…`), or `"📷 Photo"` / `"🎥 Video"`, or `"${unread} new messages"` on a burst | `type, conversationId` | No | `/private-chat/[conversationId]`; banner suppressed while that thread is on screen (`claimThread`, `:21-65`) | none for routing. Lock-screen body carries the words (a product decision the server flags as open, `:652-653`) |
| 2 | `group_message` · a **reply** to your room message (`notifyRoomReply`, `:693`; caller `admin:lib/room-delivery.ts:104-149`). A plain room message pushes **nobody** (`API.md:2648`) | The replied-to author, if still `active`/`muted`, admitted by the room's owner, live in a venue day, not blocked, room not muted; ≤1 per room per 3 min (`:132`) | **Title** = the room's `chat_groups.name` (event room: its name; **crew room: the crew's name; Blend room: "Crew A × Crew B" or "Crew A + 1"**, `admin:lib/crews/like.ts:296`). **Body** = `"${senderName} replied: ${preview≤80}"` — `senderName` is the room pseudonym (event/Blend) or **first name** (crew room, `API.md:863-866`) | `type, chatGroupId, senderId` (= sender's **room handle**, never an id, SCRUM-371) | No | `/chat/[id]` — the **event-room** screen | **G10**: crew and Blend reply pushes open the event-room screen, whose header is read from `GET /chat/groups` (event rooms only, `API.md:856-857`; `client:app/chat/[id].tsx:471-472`) → no header data for those kinds |
| 3 | `event_update` · **material change** (`notifyEventDetailsChanged`, `admin:lib/services/event-notifications.service.ts:58`; dashboard edit `app/api/events/[id]/route.ts:548`) | going + maybe + waitlisted + saved, deduped (`:35-50`) | Title = event title. Body = `"Event updated: start time, end time, venue, address"` (only the changed labels, `materialEventChanges`, `:89-109`) | `type, eventId` | Yes | `/event/[id]` | — |
| 3b | `event_update` · **reminder**, ~60 min before start, once per event (`sendEventReminders(60)`, `:115`; `lib/reminder-sweeper.ts:39`, cron `app/api/cron/event-reminders`) | same audience | Title = event title. Body = `"Starting in ~60 minutes at ${venue_name}"` (or without " at …") | `type, eventId` | Yes | `/event/[id]` | — |
| 3c | `event_update` · **cancelled** (`notifyEventCancelled`, `:191`; dashboard, `lib/admin-role-actions.ts:272`, `app/api/mobile/events/[eventId]/route.ts:513`) | same audience | Title = event title. Body = `"This event has been cancelled"` | `type, eventId` | Yes | `/event/[id]` | Cancelled Scene state must exist (SCREENS lists none explicitly) |
| 3d | `event_update` · **organiser suspended** → its future events hidden (`admin:lib/onboarding-actions.ts:566-582`) | going/maybe/waitlisted | Title = event title. Body = `"This event is no longer available."` | `type, eventId` | Yes | `/event/[id]` → the event is now a draft → **404** | **G11**: needs a "no longer available" landing, not a load error (see Part 3) |
| 3e | `event_update` · **an event takes a venue over** — everyone live there is checked out (`ended`) (`admin:lib/presence-sweeper.ts:345-430`) | each person closed out, ≤1 per person per event per 6 h (`TAKEOVER_PUSH_WINDOW_MS`, `:433`); not someone below the event's `min_age` | Title = `"Blend'n"`. Body = `"An event just started here — tap to check in"` (`TAKEOVER_PUSH_BODY`, `:430`) — **fixed words, never the event's or venue's name** (D-x3) | `type, eventId` (the real event) | Yes | `/event/[id]` (the Scene → check in) | The hand-off moment has no design (Part 2.5). `docs/SOCKET_EVENTS.md:183` says "the push names it" — **it does not**; the doc is wrong, the code is right |
| 4 | `announcement` · organiser announces **from the dashboard** (`notifyAnnouncement`, `:718`; `app/api/events/[id]/announcements/route.ts:181`) | Active room members, minus muted-room, minus sender (`:725-735`) | Title = `"📢 ${eventTitle}"`. Body = announcement text clipped to 100 | `type, chatGroupId, eventId` | Yes (stored body "Posted an announcement") | `/chat/[chatGroupId]` | **The mobile announce route sends no push at all** (`app/api/mobile/events/[eventId]/announce/route.ts` never calls `notifyAnnouncement`). Server gap, not design; noted so nobody designs around it |
| 5 | `message_request` · request sent (`app/api/mobile/message-requests/route.ts:240-252`) | Recipient | Title `"New message request"`. Body = `"${senderName} wants to connect"` — **`senderName` is `user.name`, the real name** (`:219-223`). Deliberate: the request is the documented crossing to real names (`API.md:871-885`) | `type, requestId` | Yes | `/(tabs)/chat` (requests are listed in the Banter) | Comment above it says "Deliberately generic" while the body names the sender; designers should treat the name as intended |
| 6 | `message_request_response` · accept / decline (`app/api/mobile/message-requests/[requestId]/respond/route.ts:202-221`) | Original sender | Accept: `"Message request accepted 🎉"` / `"${responderName} accepted your message request"` (real name). **Decline: `"Message request declined"` / `"Your message request was declined"`** | `type, requestId, conversationId?` | Yes | `/(tabs)/chat` | **G6 — contradicts a non-negotiable rule.** DESIGN-BRIEF §16: "There is no 'declined' state, ever, anywhere. A declined ask is never shown or inferable." The server pushes and stores a decline. Do not design a declined row; raise it as a server fix (drop the decline push), or get an explicit owner exception for message requests |
| 7 | `waitlist_promoted` · a seat frees (`admin:lib/waitlist.ts:139-150`) | Each promoted person | Title `"You're in"`. Body `"A place opened up at ${event.title}."` | `type, eventId` | Yes | `/event/[id]` | — |
| 8 | `match` · mutual like (`notifyMatch`, `:556`; `lib/matches.ts:617`) | The **earlier** liker only (the tapper gets it in the response + `room:match` socket) | `"You have a new match"` / `"Someone you liked has liked you back."` | `type, conversationId` | Yes | `/private-chat/[conversationId]` | — |
| 9 | `reveal_request` (`:569`; `conversations/[id]/reveal/route.ts:128`) | The other side | `"A match wants to know you"` / `"Someone you matched with wants to see who you are."` | `type, conversationId` | Yes | DM | — (no decline exists to send back, `API.md:1173-1177`) |
| 10 | `reveal` (`:582`; `…/reveal/route.ts:165`) | The other side | `"A match revealed"` / `"Someone you matched with showed you who they are."` | `type, conversationId` | Yes | DM | — |
| 11 | `board_request` (`:608`; `events/[eventId]/board/[postId]/requests/route.ts:178`) | Post author | `"Someone answered your post"` / `"Open the board to see who is asking."` | `type, eventId, requestId` | Yes | `/(tabs)/chat` | — |
| 12 | `board_request_accepted` (`:622`; `board/requests/[requestId]/route.ts:278`) | Asker | `"Your ask was accepted"` / `"You can message them now."` | `type, conversationId` | Yes | DM | (A board **decline is never delivered**, `API.md:2419-2430` — correct) |
| 13 | `friend_request` (`admin:lib/friends.ts:372-379`) | Recipient | `"New friend request"` / `"Someone wants to be friends. Open Blend'n to see who."` | `type, requestId` | Yes | `/friends/add` | — ("Not now" never delivered, `API.md:1315-1318`) |
| 14 | `friend_accepted` (`lib/friends.ts:381-388`) | Requester | `"Friend request accepted"` / `"You're friends now."` | `type` only | Yes | `/friends` | — |
| 15 | `rating_request` · an event you checked in to ended, once per event, ≤~5 min after the end, only events that ended in the last 6 h; not venue days (`sendRatingRequests`, `event-notifications.service.ts:264-356`) | Everyone with a check-in row (not deleted/suspended); skipped if already rated and nobody to rate | Title = event title. Body: with a mutual like (blocks excluded) `"The night's over. Rate the people you met — only you see what you say."`; otherwise `"How was it? Tap to rate the night."` (`RATING_REQUEST_COPY`, `:225-230`) | `type, eventId` | Yes | `/rate/[eventId]` | — |
| 16 | `crew_invite` · a friend invites you (`notifyCrewInvite`, `admin:lib/crews/crews.ts:686-693`) | Each invitee, ≤1 per inviter→invitee per 24 h across crews (`CREW.INVITE_PUSH_WINDOW_MS`); skipped silently for the cases in Part 2.1 | `"You're invited to a crew"` / `"A friend wants you in their crew. Open Blend'n to see."` — names nobody | `type, crewId` | Yes (only when pushed — a suppressed push writes no bell row either, `crews.ts:671-681`) | **Nothing** — falls through the switch | **G1**: needs a destination (the invite + consent screen) |
| 17 | `crew_here` · "We're here" tapped (`crewHere`, `admin:lib/crews/presence.ts:283-370`) | Every other active crew member, minus muted-crew-chat, minus anyone in a block with the tapper; once per person per crew per occurrence | Title = **the crew's name** (`crew.name`, user-typed). Body = `"Someone from your crew is here 👋"` — no person, no place | `type, crewId, chatGroupId` | Yes | **Nothing** | **G1**. Also: the title puts user-typed text (the crew name) on a lock screen, which the venue takeover push deliberately avoids (D-x3) — confirm with the owner |
| 18 | `blend` · a crew↔crew or crew↔person mutual like creates a Blend (`announceBlend`, `admin:lib/crews/like.ts:343-360`) | Everyone the Blend room admits **except** the person whose like made it (they get it in the response) | `"It's a Blend"` / `"Your crew and another matched tonight. Say hi in the Blend."` — names nobody, says nothing about who liked first | `type, blendId, chatGroupId` | Yes | **Nothing** | **G1**. Body says "Your crew and another" even when the other side is one person (crew↔person Blend) — copy needs a person variant or neutral wording |
| — | `event_checkin` | — | Nothing writes it any more (`:110-113`; `API.md:2650`) | — | No (filtered) | `/event/[id]` | dead |

`client:lib/notificationFormat.ts:15-33` (`NotificationKind`) still lists 16 kinds and **lacks `crew_invite`, `crew_here`, `blend`**; the admin OpenAPI enum has all 19 (`admin:lib/openapi/paths/mobile-misc.ts:521-540`).

### 1.3 The bell (notifications centre)

| | Server | Client today |
|---|---|---|
| List | `GET /notifications?cursor=<uuid>&limit=&unread=true` → `{ notifications: [{ id, kind, title, body, data, readAt, createdAt }], unreadCount, pagination: { limit, hasMore, nextCursor } }`. Newest first, cursor (not page), default limit **50**, max 100 (`admin:app/api/mobile/notifications/route.ts:36-111`; `lib/pagination.ts:83`; `API.md:2612-2621`) | `NotificationBell` loads `limit: 30` and **never pages** — row 31+ is unreachable (`client:components/pulse/NotificationBell.tsx:65`) |
| Mark read | `POST /notifications/read { ids?: uuid[] ≤200 }` — no ids = all; already-read rows untouched → `{ marked, unreadCount }` (`read/route.ts:24-77`) | Opening the sheet marks **all** read (optimistic badge 0), rows keep their dot for the session (`:107-126`) |
| Clear | `DELETE /notifications` → `{ deleted }` — deletes, does not mark (`route.ts:113-134`). **No single-row delete endpoint** | "CLEAR" → tray "Clear all notifications?" / "This removes them for good." Keep · Clear all (`:279-301`) |
| Live badge | Socket `notification:new { kind }` to `user:{id}` on every bell row (`push-notifications.ts:293-297`; `SOCKET_EVENTS.md:182`) | Re-reads the count on the socket event and on every focus (`:92-105`) |
| Retention | Read rows deleted after **30 days**, unread after **90** (`admin:lib/notification-retention.ts:31-32`) | Not explained anywhere |
| Rate limits | `write` bucket 30/min on read + clear (`lib/rate-limit.ts:197`) | — |
| Row anatomy | `title`, `body`, `kind`, `data`, timestamps — **no image, no actor** (every body names nobody) | Dot + title (1 line) + body (2 lines) + age ("now", "4h", "3d"); **no per-kind glyph** |
| States | — | Loading spinner; error "Couldn't load notifications" / "Check your connection and try again." + Try again; empty "Nothing yet" / "Friend requests, matches and event updates land here." (`:211-238`) |

SCREENS.md asks only for "notifications sheet (bell): empty and populated" (`SCREENS.md:205`).

### 1.4 Foreground, permission and the Settings switch

- **Foreground:** `setNotificationHandler` shows the **OS banner** for every push while the app is open, except a DM/room whose thread is on screen (`client:lib/notifications.ts:53-65`). There is **no in-app banner or toast** for pushes; `setupNotificationListener()` is registered with no callback and only logs (`client:app/_layout.tsx:164-173`, `lib/notifications.ts:297-306`). In-app moments exist only via sockets: `room:match` (match landing) and `room:wave` (toast).
- **Tap routing:** cold start via `getLastNotificationResponseAsync`, warm via the response listener → `navigateFromNotificationData` → `openWhenReady` (waits for the session) (`:521-552`). Unknown kinds do nothing — the sheet just closes (bell) or the app opens where it was (push).
- **Settings switch** "Push notifications" (`client:app/settings.tsx:398`): writes `push_enabled` (`API.md:2131-2150`). Off → also deletes this device's token (`DELETE /notifications/token`). On → clears the onboarding "Maybe later" flag and registers (may show the OS prompt). Server semantics: `push_enabled = false` stops pushes to **every** device, but **bell rows are still written** (`push-notifications.ts:147-171`; `API.md:2620-2629`). Preferences are returned only to the owner.
- **OS-blocked:** `readOsPush()` → `granted | askable | blocked` (`settings.tsx:53-71`). Blocked → switch shows off with hint "Off in your phone's settings."; tapping opens a tray "Notifications are off" / "Your phone is blocking notifications from Blend'n. Turn them on in Settings, then come back." Not now · Open Settings (`:450-456`, `:627-640`).
- **Onboarding step 2:** "Never miss …" / "Know when someone at your event wants to connect, or when a match sends you a message."; Settings hint "Blend'n uses notifications to know when someone nearby wants to connect." (`client:app/onboarding/notifications.tsx:14,88-90`). Decline is remembered per account so the OS dialog is not shown straight after (`client:lib/pushDecline.ts`).
- **Per-room mute** (`POST /chat/groups/:id/mute { until? }`) silences reply pushes and announcements (and their bell rows) from that room only (`API.md:1021-1027`). There is **no per-kind preference** on the server; Android's three channels are the only per-category control.
- **Tokens:** ≤3 per platform kept per account; ≤5 most recent used per send (`notifications/token/route.ts:69-88`; `push-notifications.ts:173-182`).

### 1.5 Notification gaps, in one list

1. **G1** `crew_invite`, `crew_here`, `blend` route nowhere (push or bell) and are missing from the client's kind type. Destinations needed: invite+consent screen, crew chat, Blend room.
2. **G2** Bell rows have no per-kind visual language. Needs a glyph per kind (never a face or name: every body names nobody), unread/read, a grouped "Today / Earlier" or similar, and the kinds' tap targets.
3. **G3** Bell pagination: load-more at the bottom (server cursor is ready).
4. **G4** No in-app foreground treatment: decide OS banner vs an in-app banner per kind (and which kinds stay silent in-app, e.g. the thread on screen).
5. **G5** No app-icon badge on either platform (server never sends `badge`). Decide: bell unread, chat unread, both, or none (SCREENS.md:563 already asks "where the total chat unread lives").
6. **G6** The message-request **decline** push and bell row contradict "no declined state, ever". Don't draw it; flag the server.
7. **G7** Tapping a notification whose target is gone (event hidden/cancelled, crew dissolved, Blend closed, conversation closed) needs a landing state — see Part 3.
8. **G8** Copy: `blend` body assumes two crews; `crew_here` title is a user-typed crew name on a lock screen; SOCKET_EVENTS.md claims the takeover push names the event (it doesn't).
9. **G9** Android channel names/descriptions should be re-written to cover crews, Blends and ratings (they are fixed at channel creation; changing them needs new channel ids).
10. **G10** Crew/Blend room reply pushes open the event-room screen.
11. **G11** Notification retention (30 d read / 90 d unread) and "push off still fills the bell" are invisible to the person; consider one line in the bell's empty/footer or Settings hint.

---

## PART 2 — Server capabilities with no client UI

`client:lib/apiClient.ts` has **no method at all** for: `/crews/**` (7 routes), `/blends/**` (2), `/events/:eventId/crews`, `/events/:eventId/crews/:crewId/like`, `/venues/:venueId/live`, `/events/search`. It has methods but no screen for polls (`apiClient.ts:2364-2384`). `GET /venues/:venueId` is called only by the placeholder `client:app/venue/[id].tsx`.

### 2.1 Crews (`API.md:1344-1477`; `admin:lib/crews/crews.ts`, `views.ts`, `presence.ts`, `sweep.ts`, `blocks.ts`)

**Endpoints (`API.md:1350-1363`)**

| Method | Endpoint | Request → response (fields that matter for design) |
|---|---|---|
| GET | `/crews` | → `{ crews: [crewView], invites: [{ crewId, name, bio, emblemSeed, tags, size, invitedBy (first name), invitedAt }] }` (`views.ts:97-139`) |
| POST | `/crews` | `{ name, bio?, intent?, tags?, openToSolo?, inviteUserIds?, revealConsent: true, keepMeAnonymous? }` → 201 `{ crewId, chatGroupId, invited }` |
| GET | `/crews/:crewId` | crewView: `{ crewId, name, bio, intent[], tags[{slug,label}], emblemSeed, openToSolo, createdAt, chatGroupId, size, you: { role, keepMeAnonymous }, members: [{ userId (crew-room handle; yours = your id), name (first name), photo (first photo or null), role, joinedAt }] }` (`views.ts:70-95`) |
| PATCH | `/crews/:crewId` | Owner only: `name, bio, intent, tags, openToSolo` (a non-owner gets the same 404, `crews.ts:578`) |
| POST | `/crews/:crewId/invites` | Any member: `{ userIds }` (friends only) → `{ invited }` = how many you asked, never who was skipped |
| POST | `/crews/:crewId/join` | `{ revealConsent: true, keepMeAnonymous? }` → `{ chatGroupId }` |
| DELETE | `/crews/:crewId/join` | Decline — "told to nobody" |
| PATCH | `/crews/:crewId/members/:me` | `{ keepMeAnonymous }` |
| DELETE | `/crews/:crewId/members/:handle` | Leave (own id) or owner removes (their handle) → `{ dissolved }` |
| POST | `/crews/:crewId/here` | `{ eventId }` → `{ notified, repeated }` |
| POST | `/crews/:crewId/report` | `{ reason: spam\|offensive\|contact_details\|impersonation\|other, description? }` → 201 |
| GET | `/events/:eventId/crews?limit=&offset=` | → `{ crewsEnabled, crews: [card], myCrews: [{ crewId, name, presentCount }], total, hasMore }`; card = `{ crewId, name, bio, emblemSeed, size, presentCount (≥2), tags, intent, youLiked }` (`presence.ts:119-157`) |

**Every refusal and its sentence** (all answered verbatim as `error`; `crews.ts:151-162`, `presence.ts:255-257`, `like.ts:68-85`)

| Status | Sentence | When |
|---|---|---|
| 404 | "Crew not found" | No crew, not a member, dissolved, not the owner on PATCH/remove, an invite that is closed/lapsed/from someone who left or unfriended you, anybody in the crew kept apart from you (`API.md:1383-1386`) |
| 404 | "You can only invite your friends into a crew." | Any invitee who is not your friend — stranger, erased, unknown id: one answer so inviting can't probe who uses the app |
| 403 | "Crews are for people 18 and over who have finished setting up." | No known adult age or unfinished profile |
| 409 | "A crew has at most 12 people." | members + open invites would pass 12; or the last seat went to a concurrent accept |
| 409 | "You can own up to 3 crews at a time." / "You can be in up to 10 crews at a time." | Caps |
| 429 | "That's enough new crews for today — try again tomorrow." | >3 created in 24 h |
| 400 | "A crew name can't contain invisible characters" / "A crew name is 2–32 characters" / "A crew bio is at most 140 characters" | Validation (`crews.ts:83-95`) |
| 400 | "This can't be a crew's name." / "This can't be a crew's bio." | Keyword filter or OpenAI hide (no reason given, by design) |
| 400 | "‹hint(s)› A crew card is shown to people you haven't met, so contact details can't go on it." | Contact details found (phone, @handle, email, URL, spelled-out) (`crews.ts:181-201`) |
| 400 | "Joining a crew means agreeing that anyone in it can reveal the crew to people you match with" | `revealConsent` not `true` |
| 403 | "Check in first — \"We're here\" is for when you're in." | "We're here" without a live check-in |
| 403 | "The host has turned crews off for this event." | `events.crews_enabled = false` ("We're here", likes) |
| 403 `NOT_CHECKED_IN` | "Check in to see the crews here." | `GET /events/:id/crews` while not checked in |
| 404 | "Event not found" | — |

**Limits and timers** (`admin:lib/constants.ts:201-241`): 2–12 members; ≤3 owned, ≤10 joined; ≤3 created / 24 h; name 2–32 chars (not unique), bio ≤140, ≤3 tags from 10 curated (`quiz-team` Quiz team, `run-club` Run club, `techno-heads` Techno heads, `office-gang` Office gang, `birthday-crew` Birthday crew, `foodies`, `board-gamers`, `gig-goers`, `book-club`, `dance-floor`); intent = person intents (`dating, networking, friendship, just_here`); invite lapses after **14 days**; a decline is not re-asked/re-pushed for **30 days**; an owner's removal sticks until an owner re-invites; one invite push per inviter→invitee per day; cards 30 per page (max 50); crew ↔ person only with `openToSolo` and **≤6 active members**; below 2 active members the crew **dissolves** (chat archived, 404 thereafter); ownership passes to the longest-standing active member; the sweeper repairs every 15 min.

**Rules a designer must not break (quote)**
- "**Made from friends.** Every invitee must be a friend of whoever invites them … Anybody else … is the **same 404** and nothing is written" (`API.md:1365-1368`). There is **no crew invite link** on the server (plan v2 §6 mentions one; not built).
- "**Joining is consent.** … The app shows, beside it: *'Anyone in this crew can reveal the crew — your name and photos — to people you match with.'* `keepMeAnonymous` is the personal override ('Keep me anonymous even when my crew reveals'); changing it later applies from then on — a reveal already made can't be unseen (D-10)" (`API.md:1402-1406`).
- "**Inside a crew people are named** — first name and one photo, never the full name" (`API.md:1430`). Two members kept apart are not listed to each other; `size` still counts both (`:1433-1436`).
- "A card is … **counts, never people**: no name, photo, id or pseudonym of anybody on it (a list of pseudonyms beside a crew that later reveals would single out the ones who stayed anonymous)" (`API.md:1456-1459`). **This overrides plan v2 §8.7's "menagerie" of pseudonym animals and the "revealed collage" on a card** — and DESIGN-BRIEF §20 step 9 still says "crew cards (an anonymous menagerie, then a revealed collage)". The card can show emblem, name, bio, "Crew of N", "N here", tags, intent, `youLiked`. Nothing else.
- "**Presence is derived, never stored.** A crew is *here* when two or more of its active members are checked in at the same occurrence now" (`:1451-1453`) — at an event or a venue day while live. "We're here" "checks **nobody else** in: every member checks in by their own GPS" (`:1438-1439`).
- Crews you see are never your own (`myCrews` is what you like *as*). Hidden from you: a moderator-hidden crew, any crew with a member kept apart from you or from any member of your crews here. **Solo**: crews are visible only after "Open to joining a crew tonight", and only crews with "room for one more" of ≤6 (`:1461-1467`).
- A report "is told to nobody in the crew" (`:1423-1428`). A decline is told to nobody (`:1358`).
- Suspended members are on no crew surface; erasure removes you from every crew; your crew-chat messages stay (`:1470-1477`).
- **Sockets:** none crew-specific. The crew chat is an ordinary `chat:{chatGroupId}` room (`SOCKET_EVENTS.md:18,32`); presence changes and new cards are **not pushed** — the Crews view must re-read on focus/pull. A member removed/leaving is taken out of the room's sockets at once.

**Screens/states this needs (none exist):** My crews list + invites waiting; create crew (name, bio, intent, tags, Room-for-one-more, invite friends, **consent copy + keep-me-anonymous**, every 400/409/429 above inline); crew detail (members by first name + photo, your role, owner edit, invite more, leave / remove member with confirm, keep-me-anonymous switch, report crew, dissolved state); invite accept screen (consent, keep-me-anonymous, decline silently, lapsed/withdrawn = "Crew not found" landing); crew chat (first-name room, "We're here 👋" and "liked … for the crew" system lines — `metadata.kind: crew_here | crew_like`); "We're here" button (needs check-in; repeated tap = quiet "already said"); the Crews view at an event (cards, `crewsEnabled: false` state, not-checked-in 403, opt-in gate for solo, empty, paging); crew card liked state.

### 2.2 Blends, the Blend room, and the crew reveal (`API.md:1479-1551`; `admin:lib/crews/like.ts`, `blends.ts`)

| Method | Endpoint | → |
|---|---|---|
| POST | `/events/:eventId/crews/:crewId/like` | `{ asCrewId? }` (as one of your crews here, or yourself) → `{ liked: true, blend: { blendId, chatGroupId } \| null }` |
| POST | `/events/:eventId/matches/likes` | with `asCrewId`: like one **person** on your crew's behalf → same shape |
| PUT | `/events/:eventId/matches/preferences` | `openToCrews: true\|false` → response carries `openToCrews` (lasts to the end of your occurrence; `false` clears it) (`preferences/route.ts:42,111,189`) |
| POST | `/blends/:blendId/reveal` | → `{ revealed, keptPrivate }` |
| GET | `/blends` | → `{ blends: [{ blendId, chatGroupId, eventId, closesAt, sides: [{ kind: crew\|person, crewId, name, emblemSeed, revealed, keptPrivate, people: [{ userId (Blend handle), pseudonym (tonight's), name (first name or null), photo (or null) }] }] }] }` (`blends.ts:105-247`) |

**Refusals** (`like.ts:68-85`): 403 "Check in before liking anyone here." · 403 "Your crew isn't here yet — two of you need to be checked in." · 403 "Turn on \"Open to joining a crew tonight\" to like a crew." · 403 "Your crew matches with one person only with \"Room for one more\" on, and at 6 or fewer." · 403 "The host has turned crews off for this event." · 404 "Crew not found" / "User not found" / "Blend not found" / "Event not found".

**Rules (quote)**
- "**No voting.** Any member of a crew that is here … likes on the crew's behalf; the crew chat gets a line, *'liked Crew Nebula for the crew'* … Nobody else is told: no push, no bell row, and the card's `youLiked` is only ever about your side" (`API.md:1489-1494`).
- "A crew member's like of a **person** tells them nothing about that person: not here, not opted in, not out for dating, or kept apart … each answers `{ liked: true, blend: null }`, exactly as a like that stood" (`:1501-1504`). Anything about the other side of a crew like is "the same 404 as a crew that does not exist" (`:1504-1508`). So the UI can never show "they're not available" — a like always looks like it stood.
- Dating: "if the crew is out for dating, the person must be too" (`:1500-1501`).
- One Blend per pair per occurrence; a closed one is not reopened ("liking again answers `blend: null`", `:1514-1515`).
- "**Who is in it: who was here when it matched** … a snapshot. A crewmate who arrives later is not in it" (`:1519-1523`). They speak in **tonight's pseudonyms**; `GET /blends` hides anyone kept apart from you and anyone with "show online" off (`:1524-1527`). Anyone may leave (`POST /chat/groups/:id/leave`).
- "**A block inside a Blend hides that pair; the room goes on** (D-9)" (`:1530-1535`) — never show "X left" for a block.
- "**It closes** 12 hours after the occurrence ends … and earlier when either side's crew dissolves or a moderator hides it" (`:1537-1540`). `closesAt` is on every Blend → an honest countdown.
- "**The crew reveal is scoped to one Blend** … revealed **to that Blend's people only** … Not to the event's room, its roster or deck, not in any DM, not in another Blend" (`:1542-1549`). Members with keep-me-anonymous stay pseudonyms; the person side in a crew↔person Blend reveals only themselves. "`GET /blends` says *'N revealed · M keep it private'* per crew" (`:1549`).
- `GET /chat/groups` lists **event rooms only** — Blend and crew rooms are not in the Banter list from the server; the app must place them itself (`API.md:856-857`).

**Screens/states needed:** the like-a-crew action on a crew card (as which crew: picker when you have several crews here; as yourself when opted in), liked/not-liked; "It's a Blend" moment (the liker's response — no push for them) for crew↔crew and crew↔person variants; Blend room (two-sided roster with emblem + pseudonyms → first names after reveal, "N revealed · M keep it private", countdown to `closesAt`, leave, block-by-handle, closed/archived state, "not in it because you arrived later" — the room simply isn't listed); the crew-reveal confirm (one tap reveals every consenting present member *in this Blend only*; say who will stay private); Blends in the Banter "Live now"; "Open to joining a crew tonight" switch on the event preferences screen (with its "until the end of tonight" scope).

### 2.3 Chat rooms of every kind (`API.md:850-866`, `1000-1005`; `SOCKET_EVENTS.md:32`)

- Kinds: `event`, `crew`, `blend`, `board_post`. The `/chat/groups/:id/...` routes work for every kind; a refusal "reads exactly as 'not a member'".
- **Names per kind:** event = room pseudonym; crew = **first name** (history, live, typing, roster, reply push); Blend = tonight's event-room pseudonym (first name after a Blend reveal).
- **Report a room** works only for event rooms (404 for others) — the crew/Blend chat-info screen must offer per-message report and the crew report instead.
- `board_post` rooms: the door exists (author + accepted askers; writes stop 12 h after the event, `CHAT_CLOSED`; a withdrawn post closes the room, 404) but **nothing on origin/dev creates one** (`git grep` finds readers only: `lib/chat-lifecycle.ts:66`, `app/api/mobile/account/route.ts:102`). Nothing to design yet.
- **Needed:** crew-room and Blend-room variants of `/chat/[id]` and `/chat-info/[id]` (header, roster, leave semantics, no room report, countdown for Blend).

### 2.4 "Open to joining a crew tonight" (`openToCrews`)

`PUT /events/:eventId/matches/preferences { openToCrews }`; stored as `open_to_crews_until = occurrence end`; read back as `openToCrews` (`admin:app/api/mobile/events/[eventId]/matches/preferences/route.ts:42-189`). Gates: a solo person sees crew cards only when on; a crew can like them only when on (and the result is silent either way). **Needed:** the switch, its scope ("tonight only"), and what the Crews view shows when it is off.

### 2.5 Places live: venue detail, Go Live, venue days, the hand-off (`API.md:632-829`; `SOCKET_EVENTS.md:45,183`)

**`GET /venues/:venueId`** → `venue { id, name, address, city, latitude, longitude, venueType, venueTypeLabel, claimed }`, `live { open, closedReason: event_live_here \| no_check_in_area \| null, eventId, liveNow: quiet \| 5-9 \| 10-19 \| 20+ \| null, youAreLive, expiresAt, stay, venueDayId, chatGroupId }`, `tonight { id, title, slug, coverImageUrl, startTime, endTime } \| null` (`API.md:743-765`). 404 unknown/archived; 403 `FORBIDDEN` not onboarded; 403 `AGE_RESTRICTED` no known adult age; 60/min.

**`POST /venues/:venueId/live`** `{ latitude, longitude, deviceInfo: { gpsAccuracy }, minutes: 20|45|60 }` or `{ …, stay: true }` → `{ venueDayId, chatGroupId, expiresAt, stay, stayUntil, checkIn { id, status, checkInTime }, revealSuggestion, intentNeeded }` (`:776-793`).

| Refusal | Sentence / body | When (`API.md:816-828`) |
|---|---|---|
| 403 `PLUS_REQUIRED` | "Staying live is part of Blendn+." (`admin:app/api/mobile/venues/[venueId]/live/route.ts:99`) | `stay` while `PLUS_GATING` is on — **off today; "stay" is everyone's** |
| 409 `EVENT_LIVE_HERE` | e.g. "Friday session is on here. Check in to it instead." + `eventId` in the body | A public event at the venue is on or starts within the hour. Checked before the fence |
| 400 `OUT_OF_RANGE` | "You're not at ‹venue› yet." — **never a distance** | Fix worse than 150 m, no check-in area, or outside it |
| 403 `FORBIDDEN` / `AGE_RESTRICTED` | — | Not onboarded / no known adult age (unknown age refused here) |
| 404 | — | Unknown/archived venue, or today's room deleted |
| 429 `RATE_LIMITED` | — | 20/min per person, plus per-address and per-venue ceilings |

**Timers and lifecycle**
- Windows 20 / 45 / 60 min; **stay** = 60 min, then each in-area presence ping extends to ping + 20 min, capped at **4 h from the first "stay" at this venue today** (choosing stay again doesn't restart it) (`:781-785`).
- No window runs past the venue's reset (**06:00 local** by default); in the last 5 min before reset Go Live opens tomorrow's room; tomorrow = new room, new pseudonyms (`:796-799`).
- Going live again extends, never shortens, and the room is not told of an arrival; going live elsewhere or checking in to an event **ends it as a switch** (`:800-802`).
- When it ends: checked out `expired`; the room answers **403 `NOT_LIVE`** "You're not live here any more. Go live at the venue to join today's room." for read, post, socket, roster and grid; sockets get `live:ended { eventId, reason }` with reason `expired | event_started | switched_event | manual | left_area` (`:803-808`; `SOCKET_EVENTS.md:183`). Leave early with `POST /events/:venueDayId/checkout`. A presence ping past the end answers `{ status: "checked_out", reason: "expired" }` (`:813-814`).
- **The takeover hand-off:** when a public event at the venue starts, everyone live there is checked out (`ended`) and pushed once "An event just started here — tap to check in" (`event_update`, `data.eventId`) (`:809-812`). **In-app, `live:ended { eventId, reason: "event_started" }` carries the venue day's id, not the event's** (`SOCKET_EVENTS.md:183`): the real event id is only in the push `data` or in `GET /venues/:id` → `live.eventId`, so an in-app "Check in to {event}" notice must re-read the venue first. There is **no pre-expiry push** from the server; a "5 min left" warning would be a local notification scheduled from `expiresAt`. From an hour before, Go Live there answers `EVENT_LIVE_HERE` and the venue drops out of `GET /venues`; the event card says "at ‹Venue›" (`:683-693`).
- A venue day's id is **not an event** to the event routes (404); the room's own routes work for somebody live there (`:632-640`). `GET /me/attendance` lists places you went live at as `kind: "venue_day"` — **show them labelled as a place by `venue_name`; the `title` is bookkeeping** (`:320-322`). `GET /checkins/active` items carry `kind`, `expiresAt`, `stay` (`API.md:2579`).
- `GET /chat/groups` lists a venue room only while your Go Live there is open (`:946-949`); its `closesAt` is the reset, not a day later (`:941-944`).

**Rules (quote)**
- "**`liveNow` is a bucket, never a number** … **`null`** for a caller the venue page would refuse … and the app hides the chip" (`:695-702`); "a count that moved from 4 to 5 as you watched would tell you somebody just walked in" (`:762`).
- "**Not on it:** the check-in area (no payload draws the boundary), and who is live. People are the venue day's roster and grid … which only somebody live there may read — you see people only while you can be seen" (`:767-770`).
- "`live.youAreLive` … Count down from `expiresAt`, never from the tap" (`:763`).
- `venue.claimed` false → "the app may offer 'Own this place? Claim it'" (`:764`), linking out to the public `/claim/venue/[venueId]` on the dashboard host — **that page now exists on origin/dev** (`admin:app/claim/venue/[venueId]/page.tsx`); USER_JOURNEY.md:300-301 still says "being built" (stale).
- Plan v2 D-11: "Plus lapses during 'stay live' → falls back to a 20-min end"; D-4/5 the 06:00 reset ends `expired` and the room goes read-only.

**Client today:** `client:app/venue/[id].tsx` is a placeholder (name, type · address, live bucket, tonight's event, "Try again"); its own docstring: "Go Live, the live pill and 'Own this place? Claim it' fill this screen in step 5" (`:15-22`). No `goLive` method, no `live:ended` listener, no Go Live entry from the centre disc.

**Screens/states needed:** venue detail full (live bucket, tonight, claimed/unclaimed, `closedReason` states: event-live-here with the event's card and "Check in to it", no-check-in-area "can't go live here yet"); Go Live sheet (20 / 45 / 60 / Stay; Stay with Plus lock when gating flips; the consequence line "puts you on a roster…"; the hold); live pill + countdown (Pulse peek, centre disc, venue page) from `expiresAt`; "stay" extension state ("staying until …, up to 4 h"); expiry prompt before the end (extend free / stay); the `NOT_LIVE` room state ("Go live at the venue to join today's room"); `live:ended` per reason (expired, reset at 06:00, event_started → hand-off sheet to the event's check-in, switched_event, left_area, manual); `EVENT_LIVE_HERE` hand-off sheet; `OUT_OF_RANGE` "You're not at ‹venue› yet" (Open Maps, never a distance); venue room variant of the Room (header = venue name, reset countdown, no event card); `/me/attendance` "places" rows in Going → Past; "Own this place? Claim it" link-out.

### 2.6 Polls in the event room (`API.md:1838-1904`)

`GET /events/:eventId/polls/:pollId`, `POST …/vote { optionId }`. A poll is a chat message of type `poll` whose `content` is the question. Counts are disclosed by `lib/disclosure.ts`: **`null` means withheld, never zero**; any option under 5 votes hidden; if anything is hidden, `total` is hidden; a lone survivor is hidden too; suppression is sticky; **results hidden until close** unless `resultsVisible`; closes at the event's end by default; one vote per person, changeable while open; `409` with a sentence ("This poll has closed", room closed, not a member). Client: `apiClient.getPoll`/`votePoll` exist (`client:lib/apiClient.ts:2364-2384`) with **no component** rendering a poll. **Needed:** poll bubble (open/voted/closed), withheld counts ("Fewer than 5" / "Results when it closes"), the 409 states. SCREENS.md's room states (`:575-590`) do not list polls.

### 2.7 Expertise (`API.md:1906-1965`)

`GET /work-fields` returns `expertiseByField` + `maxExpertise` (3); `PUT /profiles/:id { expertise }`; reads return labels, outside the identity gate. **Nothing in the client reads or writes it**: `expertiseByField` is unread, and the "CORE EXPERTISE" card row lives only in `client:lib/gridCardContent.ts`, which no screen imports (test-only; `client:ROADMAP.md:578-596` "decided and not yet built"). **Needed:** the second step of the field-of-work picker (onboarding "journey" and edit profile), max 3, pruned silently when the field changes; and the card row that shows it.

### 2.8 Smaller served-but-unrendered items

- `GET /events/search` exists and is never called (`USER_JOURNEY.md:100`; ROADMAP:441). The Pulse search uses `/events?search=`; verify the search surface before designing a second one.
- `/events/:eventId/interested-users` returns a count only; `users` always empty (`API.md:366`) — never design a "who's interested" list.
- The board_post room kind (2.3) — not yet written by anything.
- Socket `chat:memberMuted { chatGroupId, userId, muted, reason? }` — emitted on auto-mute (3+ violations in an hour) and admin mute/unmute (`admin:lib/socket-server.ts:217,1658`; `SOCKET_EVENTS.md:145`) — is **not declared or handled by the client**. Today you learn you are muted only by trying to send. SCREENS.md:590 asks for "auto-muted with an expiry"; the live transition (muted → unmuted at expiry) needs this event wired.
- Check-in **capacity**: the route still maps a `CAPACITY_FULL` error to "Event is at full capacity" (`admin:app/api/mobile/events/[eventId]/checkin/route.ts:198-199`), but nothing throws it — check-in never refuses on capacity (DESIGN_HANDOFF rule 5). The client's "At capacity" tray (`client:lib/checkInRefusal.ts:87`) is dead. **Do not design an "event full" door state**; the waitlist is the only full state.

---

## PART 3 — Client gaps

How the client turns a refusal into words: `apiClient` carries the server's `error` and `errorCode`; `client:lib/userMessage.ts:18-33` lets the server's sentence through only for `RATE_LIMITED, SPAM_BLOCKED, USER_MUTED, USER_BANNED, CHAT_LOCKED, CHAT_CLOSED, LEFT_ROOM, NOT_CHECKED_IN, EVENT_ENDED, EVENT_NOT_STARTED, AGE_RESTRICTED, WAVE_TOO_SOON, RECIPIENT_NOT_HERE, reveal_incomplete`; everything else gets the screen's fallback. `LoadError` always says "Check your connection and try again." A body that isn't JSON becomes a developer string — `HTTP 502 Bad Gateway (/api/…)` / `Invalid JSON response (502) (/api/…)` (`client:lib/apiClient.ts:1158-1184`) — which can reach `sign-in.tsx:190`, `venue/[id].tsx:33` and the safety sheets (`lib/safetyUtils.ts:186`).

### 3.1 Server states the client receives and renders badly or not at all

| # | State | What the user sees today (client file:line) | Screen/state needed |
|---|---|---|---|
| 1 | **Suspended account** (403 `"This account has been suspended. Contact support@blendn.app if you think that's a mistake."`, `API.md:118-148`; on signin/google/apple/refresh/session) | One inline red line under the sign-in buttons (`client:app/index.tsx:302-305`, `sign-in.tsx:399-401`); mid-use, thrown to the welcome screen with a small grey notice (`index.tsx:111-117,307-310`). Buttons stay offered; support address not tappable | A full **Account suspended** screen: the sentence, a tappable support mail, no sign-in buttons, and the appeal path |
| 2 | **Staff account** (403 `"This app is for attendees. Organisers, venue owners and sponsors sign in at the dashboard."`, `API.md:104-116`) | Inline line; **on a cold start with a valid token the sentence is lost** → "You were signed out. Sign in again to carry on." (`client:lib/useAuth.ts:163-168`) | A **"This app is for attendees"** screen with a link to the dashboard host |
| 3 | **Deleted account** (generic 401 / "Account not found"; deletion is never confirmed, `API.md:147-148`) | "You were signed out…" then "Couldn't sign in with Google. Please try again." forever (`client:lib/signInRefusal.ts:22`) | Copy that stops inviting retries without confirming deletion (the server won't) — e.g. a neutral "We couldn't sign you in with that account" + Support |
| 4 | **Signed out mid-use** (refresh refused) | Calling screen flashes "Session expired. Please sign in again.", then the welcome screen with one notice (`client:lib/apiClient.ts:1257-1276`; `lib/sessionEvents.ts:89`) | A designed **session-ended** notice on the welcome screen (reason-aware: signed out elsewhere / password reset / suspended) |
| 5 | **Room refused on load** — `USER_BANNED` ("The organiser has removed you from this room." or the restored-account sentence, `API.md:967`), `NOT_LIVE`, 404 hidden/deleted room, 5xx | All four → "Couldn't load this chat / Check your connection and try again." + Try again that never works (`client:app/chat/[id].tsx:370-373`) | **Removed from this room**, **Your Go Live ended** (Go live again), **This room is gone** — each a full-room state, not a load error |
| 6 | **Banned composer** | `USER_BANNED` on send: toast only, composer stays enabled (`chat/[id].tsx:619-623`); `chat:memberBanned` handled only while that screen is open, unban ignored (`:542-548`) | A **banned composer** state; ban/unban reflected on the Banter row and the Room overlay |
| 7 | **Mute arriving live** (`chat:memberMuted`, unhandled — Part 2.8) | Learned only by sending: "You're muted in this room." (`client:components/chat/ChatComposer.tsx:54`); reaction mute is a toast only (`chat/[id].tsx:751`) | Composer flips to muted (with expiry for auto-mute) as the event arrives, and back at expiry |
| 8 | **`write.reason` coverage**: server reasons `locked · archived · window_closed · not_open_yet · hidden · not_live · muted · banned · left` (`API.md:930-935`) | "Not open yet" and "closed" share "This room is closed." (`ChatComposer.tsx:56`); `not_live`, `hidden`, `archived` have no state | One composer state per reason. SCREENS.md:590 lists most but not `not_open_yet` ("This chat opens 24 hours before the event starts", `API.md:1737-1739`), `not_live`, `hidden`, `archived` |
| 9 | **Opening an event's chat when refused** (`NOT_CHECKED_IN`, banned, closed) | Event detail silently jumps to the Chats tab (`client:components/screens/EventDetailScreen.tsx:1014-1032`); the Blend'n overlay toasts "The chat for this event is not open yet." for every refusal (`components/blendn/BlendnScreen.tsx:270-272`) | Reason-specific answers: "RSVP to this event to join the chat" vs "This chat opens 24 hours before the event starts" (`API.md:1737-1739`), banned, closed |
| 10 | **Event deep link refused** — `AGE_RESTRICTED`, `FORBIDDEN` (unfinished profile), 400 bad id | "Couldn't load this event / Check your connection…" (`EventDetailScreen.tsx:353,1121-1152`) | **Age-gated event** (with "Add your age" when the age is unknown — the one fixable refusal), **Finish your profile**, **Link broken** |
| 11 | **Check-in refusals with a fix** — "Finish setting up your profile first…" (FORBIDDEN), `AGE_RESTRICTED` | ActionTray "Check-in failed" / "Not open to you" + sentence, no action (`client:lib/checkInRefusal.ts:85-103`) | Tray actions: **Finish profile**, **Add your age** |
| 12 | **Event no longer available** (organiser suspended → event hidden, push 3d) and **cancelled** | Hidden → 404 → "Event not found" + Go back (`EventDetailScreen.tsx:1121-1152`); cancelled → Scene with `status: cancelled` | A calm **"No longer available"** landing (the push promised something) and a designed **Cancelled** Scene (Going already lists cancelled, `SCREENS.md:519`) |
| 13 | **Dead targets from notifications/links** — crew dissolved/left (404 "Crew not found"), Blend closed (404 "Blend not found"), DM closed ("This conversation has ended" but **the composer is still rendered**, `client:app/private-chat/[conversationId].tsx:515-517,1101`), venue 404 (placeholder shows the raw "Venue not found" as its heading + a useless Try again, `client:app/venue/[id].tsx:33,73-79`), rate screen on a venue day (404 → "Couldn't load who you met", `client:app/rate/[eventId].tsx:255-258`) | — | One **"This isn't here any more"** pattern per object (crew, Blend, conversation, venue, event, rating), with the ended DM losing its composer (SCREENS.md:634 already says so) |
| 14 | **Unknown deep links** | No `+not-found` route → expo-router's built-in "Unmatched Route" screen; links tapped while signed out are dropped except `/f/` (`client:app/_layout.tsx:251`; `lib/pendingRoute.ts:26-63`) | A branded **not-found** screen; "Sign in to open this" holding the link through sign-in |
| 15 | **Rate limits on reads** | GETs aren't backed off on 429 → "Check your connection" (`apiClient.ts:1279`); the room toast says the raw "Too many requests" | "Slow down — try again in N min" for reads; room toast in our words |
| 16 | **`VALIDATION_FAILED`** | Raw "Validation failed" in sign-in, onboarding, event preferences, room controls, safety sheets (`sign-in.tsx:190`, `lib/useOnboarding.ts:280,381`, `app/event-preferences/[eventId].tsx:183`, `lib/safetyUtils.ts:186-189`); the `errors[]` field list is never read | Inline **field-error** states |
| 17 | **Server down / maintenance** | No screen. 5xx reads as "your connection"; on a cold start with a stored user the app opens to tabs where everything fails (`client:lib/useAuth.ts:162-163,217-235`). "Can't reach Blend'n" exists only with no stored user (`app/index.tsx:242-256`) | **Can't reach Blend'n / Down for maintenance** (with the stored session kept) |
| 18 | **Update required / version** | **Nothing on either side**: no `minVersion`, `UPDATE_REQUIRED`, 426 or `expo-updates`; the server sets `X-API-Version: v1` and the client ignores it (`admin:middleware.ts:130`) | An **Update required** screen, designed now (needs a server field before it can ship) |
| 19 | **Offline** | Banner "You're offline. Some actions won't work until you're back." on 5 screens only (room, DM, events, Chats, Blend'n overlay) (`client:components/RealtimeStatusBanner.tsx:79-80`) | Offline treatment for the other screens (profile, friends, settings, venue, rate, board) |
| 20 | **Realtime refused/ended** — socket `error` (`FORBIDDEN`/`OPS_FORBIDDEN` on a refused join), `io server disconnect` (deletion/suspension eviction) | Logged only; after 3 s "Live updates paused." on 5 screens (`client:lib/socketClient.ts:588-605`) | A reasoned state when the server cut the connection (the next 401 explains it today) |
| 21 | **Go Live family** — `NOT_LIVE`, `EVENT_LIVE_HERE`, `PLUS_REQUIRED`, `live:ended`, `OUT_OF_RANGE` (venue sentence) | No client code (no Go Live method, no `live:ended` listener). `NOT_LIVE` already arrives on room routes and shows "Couldn't load / Couldn't send" | Part 2.5 |
| 22 | **`WAVE_TOO_SOON`** | Wave button disabled, no visible text (`client:components/blendn/PersonCard.tsx:189-192`) | A still "Waved" state on the card |
| 23 | **Friend link refused** — 403 unfinished profile, 429 | "This link didn't open" + "Check your connection" (`client:app/f/[token].tsx:127`) | "Finish your profile to add friends" and a rate-limit state |
| 24 | Dead branches the brief must **not** design: `EVENT_FULL`, `ALREADY_CHECKED_IN`, `STORAGE_UNAVAILABLE` are never sent on origin/dev (capacity never refuses — Part 2.8) | — | — |

### 3.2 Dead and unused UI code (so nobody designs to it)

- **`app/preview/**`** (9 fixture screens: banter, chat, confetti, perf, profile, pulse, room, scene, tonight) are **reachable in production for a signed-in user** via `blendn:///preview/<name>`: `__DEV__` gates only the signed-out redirect (`client:app/_layout.tsx:228-253`), and `app/preview/_layout.tsx:17-19` says it is deliberately not gated, while four preview files still say "Dev-only". Not a design gap; a decision to record.
- **Organiser tools on the Scene** — Edit / Announce / Delete when `isOrganizer` (`client:components/screens/EventDetailScreen.tsx:1574-1600`), "Not in any frame" (`:1571-1572`; `docs/SCENE.md:256`). The app refuses staff accounts at sign-in, so this is reachable only by an attendee who also organises; **decide: design or delete**. Not in SCREENS.md.
- Test-only modules: `client:lib/gridCardContent.ts` (the "CORE EXPERTISE" + priority box model) and `lib/gridFilters.ts` (work-field filter chips; `ROADMAP.md:342` still marks the filter "Done").
- `apiClient` methods with no caller: `getPoll`, `votePoll` (→ polls, Part 2.6), `getInterestedUsers`, `getEventCheckins`, `getOrCreateConversation`, `deleteConversation`, `getBatchInterestStatuses`, `getBatchInterestCounts` (the last two only from dead `lib/api.ts`). Dead `lib/api.ts` exports: `getEvent, getCheckinStatus, toggleEventInterest, getUserInterestedEventIds, getEventInterestCounts, sendChatMessage, getChatMessages, getProfile, updateProfile, registerPushToken`.
- Dead UI helpers: `withErrorBoundary`, `clearImageCache`, `showLeaveConversationActions`, `showBlockConfirmation`, `showMessageReportOptions`, `isUserBlocked`, `lib/uxStandards.ts` constants except `TRAY_SPECS`, `APP_*` theme constants, `getTotalUnread`/`subscribeUnread` (`lib/unread.ts`), and `NotificationHelpers` + `sendNotificationToUser` in `client:lib/notifications.ts:235-294` (local stubs with stale copy "🎉 New Match!" / "You and ${name} liked each other!" — **never use as copy reference**; they name people on a lock screen).
- Socket: client declares `ping` and never emits it; server emits `chat:memberMuted`, client ignores it.

### 3.3 Roadmap / placeholder / handoff items still waiting on design

| Source | Item (quote) | Still true on this tree? | Needed |
|---|---|---|---|
| `client:ROADMAP.md:922-950` "Deferred features, and the UI that is waiting on each" | "**Friend graph** — The Nearby card's social-proof row — frame `1141:4788`, a 40×40 avatar stack with '+12' and the label 'Friends are here'" | Friend graph is built; the avatar stack is not ("Friends are here" appears nowhere). **But** `friends_see_me_in_rooms` defaults off and DESIGN-BRIEF §16 lists "friends-here" under "Not available without a server change" | Do **not** draw faces; at most a count of friends who opted in, and only once the server serves it |
| `client:ROADMAP.md:1036-1045` "9. Designed, built nowhere, now in scope" | "Map · Notifications centre · Search and filters · Profile strength" | Map built 2-D (MapLibre pending); bell built; search/filter built; **profile strength cut** (`admin:docs/ROADMAP.md:573-575`) | Bell → Flow 9 (Part 1); 3-D map → SCREENS-ADDITIONS 11.7. Note `SCREENS.md:670` "partial profile (completion prompts)" must not become a strength meter |
| `client:ROADMAP.md:538-557` profile frame | "`@handle`", "`PRO`", one gradient interest chip | Not built | `@handle`: no username exists anywhere — don't draw. PRO badge: undecided (Blendn+). Gradient chip: means "shared" elsewhere; not on your own profile |
| `client:ROADMAP.md:559-576` | `goals` / `looking_for` "read by nobody" | Still edited, read by nothing | Decide: drop from Edit profile, or design where they show |
| `client:ROADMAP.md:578-596` | "CORE EXPERTISE, decided and not yet built" | True | Part 2.7 |
| `client:ROADMAP.md:762-765`; `docs/PULSE.md:462-490` | "Explore the Grid" card; the large Nearby card (**Reserve Table**, "+12 Friends are here"); the floating action button | Not built, on purpose | Out: reservations and friends-here need the server (DESIGN-BRIEF §16) |
| `client:ROADMAP.md:918-920` | Pinning has no rail | True | Small: a pinned-conversations rail in the Banter, or drop pinning |
| `client:docs/PLACEHOLDER_SCREENS.md:711-721` "Screens that do not exist at all" | Presence prompt (now built); first-check-in screen (moved to onboarding); "**Group check-in / group matching** … this is crews"; "Notifications centre, search, profile strength"; "`/join` attendee landing page … Deferred" | Crews: not built in the client (server done). Others built/cut/deferred | Crews → Part 2.1 |
| `client:docs/PLACEHOLDER_SCREENS.md:85-92` §0 "Still missing" | Email verification not gated; reset link opens a browser (associated domains cover only `/f/`); Google mark is `AntDesign`; no social proof | True | The password-reset return trip (web page → back to the app); email-verification state when admin PR 8 lands ("gating chat from the second event", `admin:docs/ROADMAP.md:148`) |
| `client:docs/PLACEHOLDER_SCREENS.md:597-598` Board "Still open" | Board conversation not marked in the inbox; `chat` posts not composable | True (server accepts `kind: chat`, `admin:app/api/mobile/events/[eventId]/board/route.ts:123`) | A board-origin marker on Banter rows; a `chat` post composer (no requests on it, 422 "A chat post doesn't take requests") |
| `client:docs/PLACEHOLDER_SCREENS.md:703` §10 | Venue: "**A stand-in, until step 5.**" | True (`PlaceholderBanner` still on `app/venue/[id].tsx`, `app/board/[eventId].tsx`, `components/home/PlacesList.tsx`) | Part 2.5 |
| `admin:docs/DESIGN_HANDOFF.md:108-110,116-118` (mirror `client:docs/api/DESIGN_HANDOFF.md`) | "p1, p3 — phone + SMS OTP. Not built and not served"; "p18 — chat opens before the event" | OTP: not served. Pre-event chat: **served** (24 h before start for going/favourited, `API.md:1703-1743`) but the client shows no pre-event room ("STARTS IN" appears nowhere) | Pre-event room: the countdown header and the two refusals. OTP: don't draw |
| `admin:docs/DESIGN_HANDOFF.md:124-128` | "**Agreed instead: a coarse band** — Strong / Good / Some … Please design the band" | Not served; client band removed | Part 4.4 (proposal only) |
| `admin:docs/DESIGN_HANDOFF.md:204-206` | "Blocked on a product decision …: phone auth, pre-event chat, Create, and Circles — the last two have no data model at all" | Create/Circles: no model. Pre-event chat since served | Don't draw Create or Circles |
| `client:docs/CHAT.md:197-205` | The event context banner in the room "is not built" | True; not in SCREENS.md | A room header strip linking to the event (or drop) |
| `client:docs/TESTING_CHECKLIST.md:165-171` "Not built yet" | Blurred photos for anonymous people; interests as 13 parents; "a settings home for the five matching fields" | Blur: `SCREENS.md:680` has it. 13 parents: app-led taxonomy reshape (`admin:docs/ROADMAP.md:403-407`). Matching-fields settings home: not drawn | A **"How you match"** settings page (intent default, gender, interested in, orientations + show, work field + expertise), owner-only fields, dating fields only while Dating is chosen and only 18+ (`API.md:1555-1683`) |

### 3.4 `SCREENS-ADDITIONS.md` (in progress, untracked in the client worktree) vs the server

Another session is writing `client:docs/redesign/SCREENS-ADDITIONS.md` (Flows 10 and 11 drafted; 9, 12–15 empty at 17:10 on 2026-10-03). Where its drafts ask for something the server does not do:

| Draft says | Server on origin/dev | Fix |
|---|---|---|
| Push copy "an invite: '{crew name}: you're invited'" (Flow 10 rules) | Title "You're invited to a crew", body "A friend wants you in their crew. Open Blend'n to see." — **no crew name** (`admin:lib/crews/crews.ts:686-693`) | Quote the server copy |
| 10.3 invite received shows "the members' first names and photos" | An invitee gets only `{ crewId, name, bio, emblemSeed, tags, size, invitedBy (first name), invitedAt }`; `GET /crews/:crewId` is members-only (404) (`admin:lib/crews/views.ts:126-136,141-145`) | Invite card = emblem, name, bio, tags, "Crew of N", "Aisha invited you". Members appear after joining |
| 10.3 "lapsed ('This invite has expired')" as its own state | A lapsed invite stops being listed and accept answers the same 404 as withdrawn/left | One "This invite isn't open any more" (the client may compute "expired" from `invitedAt` + 14 d for a row it still holds) |
| 10.1 "2 of you are at Toit tonight"; 10.6 crew strip "when friends from your crews are **going** or here"; "the moment the crew becomes here" | Crew presence is served only by `GET /events/:eventId/crews` (`myCrews[].presentCount`), **only to someone checked in there** (403 `NOT_CHECKED_IN`), never pushed by socket; crewmates' RSVPs are not served at all; `GET /crews` carries no presence | Draw the strip only after your own check-in, from `myCrews`; no "going", no strip on Me/Scene before check-in, no live "became here" moment unless the server adds an event |
| 10.4 "History: Nights out together: 6" | Not served (no crew history) | Proposal frame only (the draft already says "if the server provides it") |
| 10.5 crew chat system lines "It's a Blend with Crew Nebula", "joins and leaves" | The crew chat gets only `crew_here` ("We're here 👋") and `crew_like` ("liked ‹crew/pseudonym› for the crew") lines (`admin:lib/crews/presence.ts:310`, `like.ts:320`) | Draw those two; the Blend is announced by push/response, not in the crew chat |
| 10.2 refusal example "Names can't include phone numbers or handles" | The sentence is "‹hint› A crew card is shown to people you haven't met, so contact details can't go on it." / "This can't be a crew's name." | Quote the server |
| 11.4 "5 minutes before the end: an in-app banner (or a notification if backgrounded)" | No pre-expiry push or socket | Local notification from `expiresAt` (client-only), or drop |
| 11.5 in-app "An event just started at Toit + Check in to {event}" | `live:ended` carries the venue day id; the event id needs `GET /venues/:id` | Fine to draw; note the data dependency |
| 11.1 hero "photo" | Venues have no image column; art comes from `tonight`/`nextEvent` or a type-based fallback (`API.md:709-714`) | Type-based fallback art |
| Flow 10 "Crew extras … crew photo and custom emblem colours" as locked options | Not served (crews have `emblem_seed` only) | Proposal frame, labelled Blendn+ |

---

## PART 4 — Planned but not served: the rulings that constrain design

None of these has an endpoint on origin/dev. Design them as proposal frames only, and do not contradict the following.

### 4.1 Blendn+

- **Price and channel:** "₹199/mo · ₹499/quarter · ₹1,499/yr · Night Pass ₹49, through Apple and Google in-app purchase via RevenueCat. **Never Razorpay inside the app.**" (`admin:docs/ROADMAP.md:95-97`; `client:ROADMAP.md:827-836`). DESIGN-BRIEF §16: "Paid features (Blend'n+) are in-app purchases only" and the `Price` component is the only place a price appears.
- **What it buys:** "stay live while I'm here, partner perks, full night history, cosmetics, **crew extras** (crew photo, custom emblem colours)" (plan v2 §9.3, l.388-393); plan step 11: "Gates … stay-live, history beyond 3 nights, perks, crew extras. Per-city `PLUS_GATING`, launch season, the 14-day trial on flip, the referral reward … Night Pass, restore and manage" (l.702-715). Launch season per city "with everything unlocked"; referral "3 friends who check in = 1 month" (l.393). D-11 "Plus lapses during 'stay live' → falls back to a 20-min end"; D-16 "Night Passes stacking → extend from the current end"; D-17 deletion keeps invoices without personal data, erases entitlements.
- **Never sold (quote):** "Blendn+ never sells, at any price: seeing who liked you; more asks or board requests than the caps allow; seeing a venue's room without going live there; a way round the reveal; boosting yourself in someone's Grid … A paywall screen that offers any of them is wrong, however it converts." (`client:ROADMAP.md:1099-1106`; `admin:docs/ROADMAP.md:673-680`).
- **Served today:** only `PLUS_REQUIRED` on Go Live "stay" behind `PLUS_GATING` (off) — "Staying live is part of Blendn+." No entitlements, no webhook, no `hasEntitlement` (`admin:lib/env.ts:84-87,156-162`). Crew photo and emblem colours do not exist on the server (crews have `emblem_seed` only).
- Profile "PRO" badge: undecided ("whether the profile shows a badge for it is not" decided, `client:ROADMAP.md:550-552`).

### 4.2 Regulars, blind offers, the door pass

- **Blind targeting (quote):** "The venue picks *who* by a rule, and we deliver it. The venue never sees *which people*." Audiences: regulars (3+ visits / 30 days), lapsed (no visit in 30 days), first-timers (and `everyone_live` in the schema sketch). "The venue sees **sent N / opened M / redeemed K**" (plan v2 §2, l.46-57; `USER_JOURNEY.md:291`).
- **The pass (quote):** "The person shows a live pass at the door: animated, time-stamped, one per day. Staff tap 'Redeemed'. Identity is learned **only** because the person physically walked up — the same as a coffee-shop stamp card" (plan v2 l.52). Step 12: "A pass redeems once" (l.729).
- **Opt-in visibility (quote):** "'Let Toit know I'm a regular'. The venue then sees their first name + photo + visit count … Revocable at any time" (l.53); "a person is visible to a venue only by their own opt-in" (`admin:docs/ROADMAP.md:280`).
- **Floors:** "An audience under 5 is refused with no count" (D-8; l.722). Regular = ≥3 nights in 30 days for offers, ≥3 in 60 for the "Regular here" badge; **visits after the claim only** (D-7). The room pseudonym still resets daily (l.55). DPDP consent copy required (Risks, l.529). Venue Pro gate.
- **Constraint for the app design:** no screen may list "regulars" to anyone, show a person their own "regular score" in a way a venue could see, or reveal who else got an offer. Counts on the venue side only (dashboard).

### 4.3 Matching v2 (`admin:docs/ROADMAP.md:278,682-696`; plan v2 §8)

- **Principle (quote):** "Rank on what people chose and did. Display what they are." "**Positive only.** Two labels per card at most. Never a mismatch." (§8.1, l.196-202).
- **Display-only signals** (never ranking): languages, home state, sign (opt-in, off by default, "the person **picks** their sign, prefilled from date of birth and labelled 'Western'"; "My rashi instead" offers Mesha…Meena; never "incompatible" warnings, never birth time/place) (§8.2).
- **Privacy tiers (quote):** "A — chosen tastes … always · B — origin-like (languages, home state, sign, work field): rooms ≥ 8, **one Tier B label per card** before reveal · C — identity (college, neighbourhood, employer, usual spots, free-text prompts, photos): after reveal only; never computed as an overlap" (§8.5).
- **Never build (quote):** "Caste, community, religion, gotra, surname, kundli, skin tone, veg/non-veg (a documented caste proxy in India), height, education level, income, and college or neighbourhood before reveal" (§8.4; `admin:docs/ROADMAP.md:682-691`). Step 10 adds a guard test that the fields don't exist.
- **Crew ↔ person guardrails:** solo opt-in, "Room for one more", crews over 6 match crews only, dating excluded unless both chose it (§8.3) — already enforced by the shipped server (Part 2.2).
- **Badges you cannot buy:** "Regular here" (≥3 visits in 60 days, shown only at that venue), "Shows up" (≥80% of RSVPs, min 3, opt-in), "5+ nights this month" ("a tier, never a count"); "No daily streaks"; a private monthly "Blendn Wrapped", shared only by choice (§8.6).
- **Cards (§8.7):** person anonymous = pseudonym + generated avatar, "Here now", age, work field (rooms ≥ 8), the 40 px blurred still, **one sentence of overlap**, chips, verified badges, an icebreaker from the top overlap, Like. **Crew card: the plan's "menagerie" and "revealed collage" are superseded by the shipped rule "counts, never people" and the Blend-scoped reveal** (Part 2.1/2.2) — the revealed crew appears only inside that Blend's roster.
- **Served today:** none of IPL leaves, this-or-that, languages, home state, sign, badges. `sharedEvents`/`sharedPlans`/`sharedWorkField` are served and drawn as reason lines ("Both at 3 nights before", "Going to 2 more events together", "You both work in Design", `client:components/blendn/PersonCard.tsx:245-249`).

### 4.4 The match band (Strong / Good / Some)

- Agreed in place of a percentage: "**Strong** — two or more shared interests, at least one rare in that room · **Good** — one or more shared · **Some** — nothing shared, compatible intent. Degrades honestly: a room sharing nothing shows 'Some', not a fabricated 34%" (`admin:docs/ROADMAP.md:445-456`; `DESIGN_HANDOFF.md:124-128` "Please design the band").
- **Not served:** no field on `GET /events/:id/matches` (`git grep` finds no band). The client's `lib/matchBand.ts` was removed, "never wired in" (`client:ROADMAP.md:1797-1798`). "Rare in that room" needs the server's IDF — the client can't derive it.
- Constraint: never a number or percentage anywhere (`client:ROADMAP.md:1079-1084`, "Validated — not doing").

### 4.5 Live Activity / Android Live Update

- "A Lock Screen **Live Activity** (and the Android 16 Live Update) while you're checked in: 'In the room · Toit, Indiranagar · 3 unread', **counts only and never names**" — sketch only (DESIGN-BRIEF §11.6, §20). No server support (no push-to-start/update tokens, no activity payloads). It must obey the same lock-screen rule as every push (1.2): no person, and per D-x3 no organiser-typed text on a stranger's lock screen — a venue name the person chose to go live at is theirs; an event title is organiser text.

### 4.6 The MapLibre 3D map

- Stack and rules: MapLibre RN v11 + OpenFreeMap "Liberty" restyled dark, 45–60° pitch; buildings under a live event in the **event shade** (ember/orange ramp, "brighter when live, dimmer when later today"), open venues in the **venue shade** (violet/rose), "a soft radial **glow** … Never a polygon" where no building exists; "Glow intensity steps with the floored live count (a few / busy / packed). **Never a number below 5**"; "Check-in boundary: **Not drawn**, anywhere on the map. Detail screens say 'You're inside — check in' or 'Get closer to check in'" (plan v2 §4, l.75-94; `USER_JOURNEY.md:255-261`; `client:ROADMAP.md:819`).
- No new endpoint: viewport → centre + radius on `/events` and `/venues` (`admin:docs/ROADMAP.md:442`). Clustering out of scope (step 2). Event detail keeps its small `react-native-maps` map.
- Already in SCREENS.md as "next" (`SCREENS.md:142,181`).

### 4.7 Staleness the brief should not inherit

- `USER_JOURNEY.md:247-253` "Places … Served: `GET /venues` only. No venue day, no Go Live" — **stale**: Go Live, venue days and `GET /venues/:id` are served (`API.md:632-829`).
- `USER_JOURNEY.md:263-269` "Crews … Served: Nothing" — **stale**: steps 7, 8a, 8b shipped (#622, #630, #631).
- Plan v2 §6/§8.7 crew card collage + menagerie, crew invite link, crew photo — **not what shipped** (Part 2.1).
- DESIGN-BRIEF §20 step 9 "crew cards (an anonymous menagerie, then a revealed collage)" — **contradicts `API.md:1456-1459`**; fix in the brief.

---

## Screens/states to add to the design pack (prioritised)

Priority: **P0** the server already sends it and the app mishandles it today · **P1** served, no UI · **P2** planned (proposal frames inside the rulings). Each line: what to draw · source.

### Notifications (Flow 9)
- P0 · Bell row anatomy per kind: a glyph per kind (16 bell kinds), title/body, unread dot, age; never a face or name · Part 1.3
- P0 · Routes for `crew_invite` → invite screen, `crew_here` → crew chat, `blend` → Blend room; and the "target is gone" landing for each · G1, Part 3.1#13
- P0 · Do not draw a "message request declined" row; flag the server decline push · G6
- P1 · Bell: load more (cursor), load-failed, clear-all confirm, empty, push-off ("notifications are off — you'll still see them here") · Part 1.3
- P1 · In-app foreground banner per kind (and silence for the thread on screen) · G4
- P1 · App-icon badge decision (bell unread / chat unread / none) · G5
- P1 · Settings: push switch on / off / OS-blocked tray; per-room mute; Android channel names that cover crews and ratings · Part 1.4, G9
- P2 · Lock-screen previews for all 19 kinds (iOS stacked + Android channel) to prove no names leak · Part 1.2

### Crews & group (Flow 10)
- P1 · My crews + invites waiting (Me) · 2.1
- P1 · Make a crew: name/bio/intent/tags/Room for one more → invite friends → consent + keep-me-anonymous; every 400/409/429 sentence inline · 2.1
- P1 · Invite received: emblem, name, bio, tags, size, inviter's first name; consent; Join / Not now (silent); "isn't open any more" · 2.1, 3.4
- P1 · Crew detail: members (first name + photo), owner edit, remove (confirm), invite more, leave, dissolve warning, keep-me-anonymous, mute, report crew · 2.1
- P1 · Crew chat (first names; "We're here 👋" and "liked … for the crew" lines; archived when dissolved) · 2.1, 2.3
- P1 · "We're here" after your own check-in (sent / already sent / crews off / not checked in) · 2.1
- P1 · Crews view in the Room: cards (counts, never people), Like as crew / as yourself, `crewsEnabled: false`, not checked in, paging, empty · 2.1, 2.2
- P1 · "Open to joining a crew tonight" switch (solo), with its tonight-only scope · 2.4
- P1 · It's a Blend: crew↔crew, crew↔person (both sides), by push · 2.2
- P1 · Blend room: two-sided roster, countdown to `closesAt`, reveal sheet (Blend-scoped, "N revealed · M keep it private"), leave, pair hidden by a block, closed · 2.2
- P1 · Crew/Blend variants of the room screen and room info (no room report; per-message report; crew report) · 2.3
- P2 · Crew extras (photo, emblem colours) as locked Blendn+ options · 4.1

### Places live (Flow 11)
- P0 · Room states for `NOT_LIVE` ("You're not live here any more. Go live at the venue to join today's room.") — the server already sends it · 3.1#5
- P1 · Venue detail: live bucket (or hidden when `null`), tonight, `closedReason` event-live-here (with the event) / no-check-in-area, claimed vs "Own this place? Claim it" link-out, 404/403/age states · 2.5
- P1 · Go Live sheet (20/45/60/Stay), the hold, every refusal (`EVENT_LIVE_HERE` hand-off, `OUT_OF_RANGE` "You're not at ‹venue› yet." with no distance, age, 429) · 2.5
- P1 · Live pill + countdown from `expiresAt` (Room header, Pulse peek), Stay ("live while you're here", ≤4 h), extended · 2.5
- P1 · `live:ended` per reason: expired, 06:00 reset, event_started (hand-off), switched_event, left_area, manual · 2.5
- P1 · The venue room as a Room variant (venue header, reset countdown) · 2.5
- P1 · Venue days in Going → Past, labelled as places by `venue_name` · 2.5
- P2 · Expiry warning (local notification) and "Stay with Blendn+" when `PLUS_GATING` flips · 2.5, 4.1
- P2 · 3-D lit map (already SCREENS-ADDITIONS 11.7) · 4.6

### Blendn+ (Flow 12)
- P2 · Paywall with the four prices via IAP only, restore, manage, Night Pass (stacking extends), trial, launch-season "everything unlocked", referral; never selling who-liked-you, cap bypass, see-without-going-live, reveal bypass, boosting · 4.1
- P2 · `PLUS_REQUIRED` on Stay ("Staying live is part of Blendn+.") and the lapse-to-20-min fallback · 2.5, 4.1
- P2 · Full night history beyond 3 nights (locked state on Going → Past / Me) · 4.1

### Regulars (Flow 13)
- P2 · The door pass: live, animated, time-stamped, one per day, staff tap "Redeemed", redeemed/expired states · 4.2
- P2 · An offer as received (push + bell row + pass), with no hint of who else got it · 4.2
- P2 · "Let ‹venue› know I'm a regular" per venue, revocable, DPDP consent copy · 4.2
- P2 · "Regular here" badge (shown only at that venue) · 4.3

### Matching v2 (Flow 14)
- P1 · Expertise picker (step 2 of field of work, max 3) and its card row · 2.7
- P1 · "How you match" settings home for the owner-only matching fields · 3.3
- P2 · One-sentence overlap on person cards; Tier-B budget (one origin label, rooms ≥8); icebreaker · 4.3
- P2 · Profile fields: languages (+ "Learning Kannada"), home state, sign (Western or rashi, opt-in), this-or-that, IPL teams, artists · 4.3
- P2 · Badges: "Shows up", "5+ nights this month" (a tier, never a count); private monthly Wrapped · 4.3
- P2 · Match band Strong / Good / Some (proposal; never a number) · 4.4

### System states (Flow 15)
- P0 · Account suspended screen; staff-account screen; deleted-account copy; session ended notice · 3.1#1-4
- P0 · Room: removed-from-room, banned composer, live mute/unmute, every `write.reason` incl. `not_open_yet`, `hidden`, `archived` · 3.1#5-8
- P0 · Event deep-link refusals: age-gated (+ Add your age), finish profile, no longer available, cancelled · 3.1#10-12
- P0 · "This isn't here any more" per object (crew, Blend, conversation without composer, venue, rating) · 3.1#13
- P0 · Branded not-found route; links held through sign-in · 3.1#14
- P1 · Can't reach Blend'n / maintenance (session kept); update required (server field to follow) · 3.1#17-18
- P1 · Read rate-limit state; field-level validation errors; offline on the remaining screens; realtime cut by the server · 3.1#15-16,19-20
- P1 · Polls in the room: open / voted / closed, withheld counts ("fewer than 5", results at close), 409 sentences · 2.6
- P1 · Pre-event room: the 24-hour countdown and its two refusals · 3.3
- P1 · Waved state on a card (`WAVE_TOO_SOON`) · 3.1#22
- P2 · Live Activity / Live Update while checked in or live: counts only, no names, no organiser text · 4.5
- Decide, not draw: organiser tools on the Scene (design or delete), `/preview` reachable in production, `goals`/`looking_for`, pinning · 3.2, 3.3
