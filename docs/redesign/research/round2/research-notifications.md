# Blend'n redesign: notifications (research, round 2)

> **Note (2026-10-03):** this file read the server at an older commit and says the crew kinds (`crew_invite`, `crew_here`, `blend`) aren't built. They are, on admin `origin/dev` `3852f15`. Their **current server copy** is in `gap-sweep.md` Part 1.2, and SCREENS-ADDITIONS Flow 9 shows it beside this file's proposed copy.


Researched 2026-10-03 for the Claude Design brief. This covers the bell's list, push notifications, the banner shown when the app is open, and the notification settings.

The stack is Expo SDK 57 / RN 0.86, with Android at about 93% of traffic in India. The server sends through the Expo push service: `expo-server-sdk` 7.2.0 (blendn-admin `lib/push-notifications.ts:3-13`).

**Labels used in this file**
- **UNVERIFIED**: no primary source confirmed it. Treat it as an observation or assumption.
- **SECONDARY**: only a third-party write-up was found. The primary page was unreachable (403) or does not exist.
- **PROPOSAL**: a recommendation for Blend'n, not a fact about a platform.

**Pinned code references**
- Bluesky `social-app` @ [`61c7cad`](https://github.com/bluesky-social/social-app/tree/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f) (2026-10-03). It is an Expo app on `expo-notifications@57`, the same major version as Blend'n.
- expo `Notifications.types.ts` @ [`257006e`](https://github.com/expo/expo/blob/257006eff77846a172e73fe37c864e915f8647a4/packages/expo-notifications/src/Notifications.types.ts).
- Blend'n server: blendn-admin @ `e232920`.
- Blend'n client: blendn `redesign-brief` @ `b46688d`.

Sibling files in `.context/redesign/` that this file relies on and does not repeat:
- `research-ios-glass.md`: glass materials.
- `research-android-m3e.md`: the Android glass fallback.
- `research-haptics-motion.md`: the haptic fallback ladder and spring tokens.
- `audit-social.md` and `audit-discovery.md`: the bell as it is today.

---

## 0. Summary: the decisions this file argues for

1. **The bell opens a full screen pushed onto the current stack, not a sheet.**
   - Every app surveyed puts its activity centre on a full screen or a tab: Bluesky, X, Threads, Discord, Luma.
   - Apple reserves sheets for "a scoped task", and NN/g says not to replace page-to-page flows with a bottom sheet.
   - Bell rows *navigate*. From a sheet, Back from the destination lands on Pulse, not on the list (§3).
2. **There are three sections, no tabs: "Waiting on you", "New" and "Earlier".**
   - "Waiting on you" holds pending decisions: friend requests, crew invites, message requests, board replies and reveal requests. It is read from the live request state, not from notification rows, so it never goes stale. This copies Instagram putting follow requests in Activity with Confirm/Delete.
   - Blend'n's bell volume is too low for Bluesky/X/Threads-style filter tabs (§2, §8.1).
3. **Opening the bell means everything is seen.** The badge clears at once. Rows unseen at open keep a dot for that visit only.
   - This is Bluesky's model: `updateSeen` with the time of the fetched page, so rows arriving later stay unread.
   - A pending request never keeps the badge lit. A permanent badge is the "unfinished task" nag users resented in the Snapchat study (§8.4).
4. **Show a count on the bell and cap it at "9+".** Today's cap is "99+". iOS and Android reserve the app-icon badge for things that are waiting. Setting it to zero on iOS also clears the app's delivered notifications, so it must match reality (§3.3, §8.4).
5. **Anonymous actors get a mark, never a blur and never a silhouette.**
   - A pseudonymous person who is known in an event's context gets that event's creature disc. This applies to a match, a board reply and a reveal request.
   - Kinds that name nobody get a glyph tile: "We're here" and "It's a Blend".
   - Blur reads as a paywall (Bumble Beeline), and a person-shaped placeholder reads as "a person wrote to you" (the Snapchat finding). Aggregate by **count** ("3 new matches"), never by "{name} and 2 others", unless every person counted is named to you (§8.2–8.3).
6. **Push copy has two lanes.**
   - **Person-lane** pushes (requests, matches, reveals, crew) name nobody and no place. This holds even after a reveal: a lock screen showing "Priya revealed herself to you" exposes Priya's dating activity to whoever holds the phone.
   - **Event-lane** pushes (changed, cancelled, starts soon, announcements, rating) name the event in the *body*, never a person.
   - Titles stay generic because Android's `VISIBILITY_PRIVATE` still shows the title on a secure lock screen, and Android caps titles at 30 characters (§8.6–8.7).
7. **Fix the current copy against these rules.** Today it has:
   - Two emoji titles: `📢 {event}` and "Message request accepted 🎉".
   - Instructions in the body: "Open Blend'n to see who", "Open the board…".
   - A real name in the message-request push.
   - A push that tells someone they were declined.
   - "Event updated: start time, venue", which does not say the new time (§1.2).
8. **Assign iOS interruption levels per kind** (§8.7). Time Sensitive needs the entitlement in `app.json`; Expo lists it as a supported capability.
   - **Time Sensitive** is only for "now or within an hour", as the HIG requires: "We're here", "Starts at 9:00 pm", and a change or cancellation within 60 minutes of start.
   - **Passive** is for "rate the night".
   - **Active** is everything else.
9. **Android channels: keep the three existing IDs, rename them, and add three more.** The new ones are `people` (Matches and friends), `crew` (Your crew) and `later` (After the night, LOW importance).
   - Importance is fixed at creation, so "rate the night" cannot become quiet inside `events`.
   - The existing channel named literally "default" can be renamed. Names and descriptions are the only things Android lets you change (§8.8).
10. **When the app is open, never show the OS banner, list entry or sound. Draw a glass in-app banner instead, and only for person-lane kinds and same-day event changes.**
    - Never show it when the destination is already on screen, never with haptics, and never with sound.
    - Tap opens it, swipe up dismisses it, and it auto-dismisses after 4 s unless a screen reader is on.
    - Today the client shows OS banner, list and sound for every kind except the on-screen thread (`lib/notifications.ts:54-65`). Bluesky shows nothing for non-chat kinds in the foreground (§5, §8.5).
11. **Settings: keep the master switch, add six per-category push toggles, and add one row "Sounds, pop-ups and lock screen" that deep-links to the OS.**
    - The toggles are stored server-side and match the Android channels one to one. The bell always records.
    - No quiet hours and no "pause all": OS Focus, Do Not Disturb and Bedtime already do this, and Blend'n's use peaks at night.
    - Never re-prompt for permission automatically. Ask in context: on RSVP "Going", the first like or friend request, or joining a crew. Android stops showing the system dialog after the second denial (§6, §8.9).
12. **Accessibility.**
    - The bell's label carries the real count ("Notifications, 12 new") while the badge shows "9+".
    - Banners announce politely: `announceForAccessibilityWithOptions(…, {queue:true})` on iOS, and `accessibilityLiveRegion="polite"` on Android, because Android 16 deprecates `announceForAccessibility`.
    - Row actions are exposed as `accessibilityActions` (Bluesky's pattern).
    - Reduce Motion turns the banner into a fade (§7).
13. **Out of scope for this redesign:**
    - Live Activities and Live Updates. Android's rules exclude "chat messages, alerts, upcoming calendar events", and iOS is 7% of traffic.
    - Android MessagingStyle conversation notifications. Expo push cannot render them without a custom native FCM handler.
    - iOS communication notifications for DMs. Bluesky ships them through a Notification Service Extension. It is feasible and a good follow-up (§4.1.3).

---

## 1. Current state

This section is grounding from code, not from the web.

### 1.1 What exists

| Area | Fact | Where |
|---|---|---|
| Transport | Expo push, `priority: "high"` on every message, and an optional `badge` | blendn-admin `lib/push-notifications.ts:335-368` |
| Channel routing | DMs → `messages`, keyed `dm:{id}` (thread, collapse and tag). Room replies → `rooms`, keyed `room:{id}`. Event updates → `events`, `event:{id}`. Rating → `events`, `rate:{id}`. Announcements and waitlist → `events`, stacked by `threadId: event:{id}` and never replaced. **Everything else** (friend request/accepted, match, reveal, board, message request) → `messages` | `deliveryFor`, `lib/push-notifications.ts:70-99` |
| Not in the bell | `private_message`, `group_message`, `event_checkin` | `NOT_IN_THE_BELL`, `:115-119` |
| Burst control | A DM rings when the thread goes from read to unread, then at most once per 5 min with a count. A room reply rings at most once per 3 min per room | `:129-132` |
| Stored body | DM, room and announcement bodies are replaced in the table ("Sent you a message"…). The message stays behind its own gate | `storedBodyFor`, `:249-279` |
| Feed API | `GET /notifications` uses a cursor, newest first, and returns `unreadCount` | `app/api/mobile/notifications/route.ts:18-36` |
| Mark read | `POST /notifications/read` takes `ids` (max 200), or **all of mine** when ids are absent | `app/api/mobile/notifications/read/route.ts:17-26` |
| Clear all | `DELETE /notifications` deletes rows rather than marking them read | `route.ts:113-130` |
| Retention | Read rows are pruned after **30 days** and unread rows after **90 days** | `lib/notification-retention.ts:31-32` |
| Client foreground | `shouldShowBanner/List/PlaySound: !onScreen`, where "on screen" means only the open DM or room thread | blendn `lib/notifications.ts:54-65` |
| Client channels | `messages` "Messages and people" HIGH; `events` "Events" HIGH; `rooms` "Room replies" DEFAULT; `default` named **"default"**, MAX. All have `vibrationPattern [0,250,250,250]` and `lightColor #FF6B6B` | `lib/notifications.ts:79-128` |
| Bell today | A **sheet**. Tapping the bell marks all read (optimistic). Rows: unread dot, title, 2-line body, age. Badge capped at 99+. Clear all goes through a confirm tray. Empty state: "Nothing yet / Friend requests, matches and event updates land here." No pull-to-refresh, by design. It reloads on focus and on socket `notification:new` | `audit-discovery.md:492`; `lib/push-notifications.ts:284-297` |

### 1.2 Current push copy, checked against the rules in §8.6

| Kind | Title / body today | Problem |
|---|---|---|
| friend_request | "New friend request" / "Someone wants to be friends. Open Blend'n to see who." | The body is an instruction. The HIG says avoid notifications that tell people to do tasks in the app |
| friend_accepted | "Friend request accepted" / "You're friends now." | OK |
| match | "You have a new match" / "Someone you liked has liked you back." | OK. Could be shorter |
| reveal_request | "A match wants to know you" / "Someone you matched with wants to see who you are." | OK |
| reveal | "A match revealed" / "Someone you matched with showed you who they are." | OK |
| board_request | "Someone answered your post" / "Open the board to see who is asking." | Instruction |
| board_request_accepted | "Your ask was accepted" / "You can message them now." | OK |
| message_request | "New message request" / "`${senderName}` wants to connect" | `senderName` is `user.name`, the real name (`app/api/mobile/message-requests/route.ts:219-245`). It is fine only if sending a request *is* the reveal. API.md calls the request "the documented crossing", but the push puts the name on the recipient's **lock screen** |
| message_request_response | "Message request accepted 🎉" / "{name} accepted…", or "Message request declined" / "Your message request was declined" | Emoji. **Declines are pushed**, so declining someone results in contacting them |
| announcement | "📢 {event}" / text | Emoji. VoiceOver reads the emoji's name (UNVERIFIED). It spends Android's 30-character title |
| event_update (change) | "{event}" / "Event updated: start time, venue" | Does not say the **new** time or place, the one fact the person acts on |
| event_update (reminder) | "{event}" / "Starting in ~60 minutes at {venue}" | The relative time goes stale while it sits in Notification Center or a Focus summary |
| cancelled | "{event}" / "This event has been cancelled" | OK, but the event name in the title shows on Android's PRIVATE lock screen |
| waitlist_promoted | "You're in" / "A place opened up at {event}." | OK |
| rating_request | "{event}" / "How was it? Tap to rate the night." (or the peers variant) | "Tap to…" is an instruction. It should be passive |
| crew invite / We're here / It's a Blend | not present in blendn-admin at `e232920` | The copy in §8.7 is new |

---

## 2. Activity centres in 2025–26

This section answers Q1.

### 2.1 App by app

| App | Surface | Tabs / filters | Grouping & aggregation | Unread / mark-read | Inline actions | Other |
|---|---|---|---|---|---|---|
| **Bluesky** (open source, read at `61c7cad`) | A **tab** screen "Notifications", with a settings gear in the header ([Notifications.tsx:122-143](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/view/screens/Notifications.tsx#L122-L143)) | **All / Mentions** pager ([:83-111](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/view/screens/Notifications.tsx#L83-L111)) | Only like/repost/follow kinds group, and only within **48 h** with the same reason and subject. Follow-backs are never grouped ([util.ts:22-31, 144-197](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/state/queries/notifications/util.ts#L144-L197)). "{first} and N others", up to **5 avatars then +N** ([NotificationFeedItem.tsx:73, 290-296, 1003-1020](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/view/com/notifications/NotificationFeedItem.tsx#L290-L296)). No time sections | **All marked seen when the first page of All loads** (`updateSeen` with the sync time). Rows newer than the previous `seenAt` get a tinted background for that visit ([feed.ts:118-121, 163-171](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/state/queries/notifications/feed.ts#L118-L171); [NotificationFeedItem.tsx:563-578](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/view/com/notifications/NotificationFeedItem.tsx#L563-L578)). Badge capped at **"30+"**. Polls every 30 s and backs off when unread ([unread.tsx:28, 146-179](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/state/queries/notifications/unread.tsx#L146-L179)) | "Follow back" on a single follow row | Page size **30**. "Load new notifications" pill when scrolled down. On focus it refreshes **only if not scrolled down, "to avoid moving content underneath them"** ([Notifications.tsx:222-234, 268-274](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/view/screens/Notifications.tsx#L222-L274)). Empty: "No notifications yet!" ([NotificationFeed.tsx:126-131](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/view/com/notifications/NotificationFeed.tsx#L126-L131)). No clear-all and no swipe. Known pain: virality splits groups ([#1974](https://github.com/bluesky-social/social-app/issues/1974)) |
| **Threads** | Activity **tab** | Filter chips: All, Follows, Conversations, Reposts, Verified, plus **Mentions** and **People you follow** (added 2025-10-30) ([9to5Mac](https://9to5mac.com/2025/10/30/threads-rolls-out-reply-approvals-and-new-activity-feed-filters/)) | UNVERIFIED | UNVERIFIED | Reply approvals ("Ignored" tab) | — |
| **X** | Notifications **tab** | **All / Mentions**. "Verified" became **Priority**, only for accounts with 500+ followers ([X Help](https://help.x.com/en/managing-your-account/understanding-the-notifications-timeline), via search snippet because the page 403s; [Roboin, 2026-01](https://roboin.io/article/en/2026/01/11/what-is-the-priority-tab-in-x-notifications/), SECONDARY) | UNVERIFIED | UNVERIFIED | — | — |
| **Instagram** | Heart → Activity (full screen; UNVERIFIED as a first-hand observation) | none | Sections "Today / Yesterday / Last 7 days / Last 30 days" plus a Highlights section. SECONDARY: a clone's Mobbin-derived spec ([PR #201](https://github.com/externaldev21-sketch/brandthread/pull/201)) | UNVERIFIED | **Follow requests "appear in your Activity", answered with Confirm or Delete** ([Instagram Help](https://help.instagram.com/207917546007234), via search snippet) | Swipe-left menu (See less / Remove / Block), SECONDARY, same PR. **Pause all, 15 min–8 h** ([Newsweek](https://www.newsweek.com/pause-notifications-instagram-how-feature-new-update-1361846)) |
| **Discord** | Notifications **tab**: "server events, friend requests and message replies… notifications should now auto-clear instead of requiring you to remove them" ([Engadget, 2023-12-05](https://www.engadget.com/discord-overhauls-its-mobile-app-with-new-tabs-messaging-features-and-more-170035917.html)) | UNVERIFIED for 2025–26 | — | Auto-clear | Friend request accept | — |
| **Luma** | iOS has a Notifications tab (a student teardown, [PDF](https://assets.nextleap.app/submissions/LumaAppNotifications-41d53037-356b-43d7-87c0-6fd04b62eb40.pdf), SECONDARY) | — | — | — | — | Types: Invites, **Reminders (1 day and 1 h before)**, Blasts, **Updates ("name, start time, duration, or location")**, Feedback requests (email only) ([Luma Help](https://help.luma.com/p/notification-types); [reminders](https://help.luma.com/p/update-to-reminders-on-luma)) |
| **Partiful** | A per-event Activity feed (comments, GIFs, photos) | — | — | — | — | Reminders **2 h before** for Going, and 1 week before for Maybe ([help](https://help.partiful.com/hc/en-us/articles/24470120681115-What-event-reminders-do-you-send)). Toggles "such as RSVPs or photo uploads". **Mute event** per event ([settings](https://help.partiful.com/hc/en-us/articles/44702879192859-How-can-I-adjust-my-notification-settings), [mute](https://help.partiful.com/hc/en-us/articles/26503500543515-How-do-I-stop-receiving-notifications-for-an-event)) |
| **Hinge** | No general activity centre. Likes go to the "Likes You" surface | — | — | — | — | Per-category push and email toggles, plus **snooze** ([Hinge Help](https://help.hinge.co/hc/en-us/articles/360011142974-How-can-I-manage-my-notifications), via search snippet because the page 403s) |
| **Bumble** | No general activity centre. Likes go to the "Beeline" surface | — | — | — | — | Free users see the Beeline **blurred** as a teaser for Premium ([Bumble Support](https://support.bumble.com/hc/en-us/articles/28423161699485-Viewing-who-s-liked-you) 403s; [roast.dating](https://roast.dating/blog/bumble-beeline), SECONDARY) |
| **Snapchat** | No centre. Red in-app dots on tabs | — | — | Dots "only disappeared when you clicked on them", and "no way for users to set whether they wish to receive in-app badges" | — | Bits of Freedom (2025-11-24, N=13 interviews plus a 6-week case study): 39 of 109 notifications were misleading. Some "resembled another user sending you a message"; some were time-sensitive for permanent content; friend *suggestions* were "interpreted as friend requests". Users want to get rid of "the feeling that they still have something to do" ([report §4](https://www.bitsoffreedom.nl/wp-content/uploads/2025/12/20251124-report-snapchats_manipulating_notifications.pdf)) |

### 2.2 What the survey says

- **Surface.** Every app with a real activity centre uses a full screen or a tab. None uses a sheet (see the table).
- **Filters.** Tabs and filters exist where volume is high and a slice matters: replies and mentions on Bluesky, X and Threads. Blend'n has no "mentions" concept in the bell. The slice that matters is *pending decisions*. Instagram serves that with a requests entry *inside* Activity, not with a tab.
- **Aggregation.** It is reserved for low-stakes, high-volume kinds (likes, reposts, follows) within a window: 48 h on Bluesky. Bluesky never groups replies, mentions or quotes, because each needs reading (`GROUPABLE_REASONS`).
- **Mark-read.** The dominant mobile pattern is *seen on open*, with a visit-scoped highlight: Bluesky, and Discord's auto-clear. Per-row read state is uncommon on mobile (UNVERIFIED beyond these two).
- **Clear-all and swipe-to-dismiss.** Rare. Discord makes clearing unnecessary, and Bluesky has neither.

### 2.3 Which patterns fit a product where many actors are anonymous

| Pattern | Fit | Why |
|---|---|---|
| "{Name} and N others" (Bluesky) | **No**, unless every actor is named to you | It needs a first name. "Someone and 3 others" reads as a glitch |
| Count-first aggregation ("3 new matches") with a stack of marks | **Yes** | The count is the fact. The marks are the per-event creatures you already saw in the room |
| Blurred faces (Bumble Beeline) | **No** | Blur means "pay to see". Blend'n also already forbids client-side blur (`audit-social.md:167`) |
| Generic person silhouette | **No** | It reads as "a person contacted you". That is the Snapchat deception finding |
| A kind glyph for events that name nobody | **Yes** | Honest: "this is about your crew, not a person" |
| Requests inside the centre, with inline Confirm/Delete (Instagram) | **Yes, for kinds whose actor is already visible to you in-app** | Never on the lock screen. A push that hides who cannot also offer "Accept" |
| Event context line ("at Saturday Social") | **Yes** | Pseudonyms are per event (`audit-social.md:165`), so the event is the only context that makes a creature meaningful |

---

## 3. Full screen or sheet, navigation, and badge

This section answers Q2.

### 3.1 Full screen

- **Apple** says a sheet "helps people perform a scoped task that's closely related to their current context" and "for complex or prolonged user flows, consider alternatives to sheets". Also: "When people close a sheet, they expect to return to the parent view" ([HIG Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), change log 2026-03-24).
- **NN/g** says "We strongly recommend not using a bottom sheet to replace typical page-to-page user flows". It also notes that a downward swipe while scrolling dismisses the sheet by accident ([NN/g, 2023-06-11](https://www.nngroup.com/articles/bottom-sheet/)).
- **The navigation problem with today's sheet.**
  - A row tap must dismiss the sheet and then push the destination, so Back returns to Pulse and the reader loses their place.
  - Inside a sheet, a pull-to-refresh fights the dismiss gesture. That is presumably why the current sheet has none.
- **PROPOSAL.**
  - The bell pushes `/notifications` onto the *current* tab's stack, from both Pulse and the Banter inbox. The title is "Notifications", matching the settings label.
  - Back and the edge swipe return to the origin.
  - A row pushes its destination, and Back returns to the list at the same scroll offset.
  - An OS push tap deep-links straight to the destination. Back goes to that tab's root, not through the bell.

### 3.2 Badge on the bell: count or dot, and the cap

- Apple: "Use a badge only to show unread notification count" and "Keep badges up to date" ([HIG Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)).
- M3 defines a small badge (dot) and a large badge (count), with "max characters (e.g. 999+)" ([M3 Badges](https://m3.material.io/components/badges/guidelines); the page summary was thin, so treat the 999+ figure as the example given).
- Bluesky caps at "30+" ([unread.tsx:174-179](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/state/queries/notifications/unread.tsx#L174-L179)). Blend'n today caps at "99+".
- **PROPOSAL: a count, capped at "9+".**
  - Bell kinds are low-volume.
  - Past nine, the number does not change what you do.
  - A one-character badge stays a circle on a 44 pt glass control. "99+" becomes a pill that overpowers it.
  - The accessible label carries the exact number (§7).

### 3.3 Clearing the badge

- Apple: "Update a badge when people open the corresponding notifications. Reducing the badge count to zero removes all related notifications from Notification Center" (HIG Notifications).
- So the **app-icon** badge must never drop to 0 while DMs are still unread. If it does, it wipes their delivered notifications.
- Bluesky's iOS extension increments the icon badge for **non-chat** pushes only ([NotificationService.swift:62-71, 199-207](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/modules/BlueskyNSE/NotificationService.swift)).
- PROPOSAL: §8.4.

---

## 4. Push on the two platforms, 2025–26

This section answers Q3.

### 4.1 iOS (26 and 27)

**4.1.1 Interruption levels.** There are four: Passive, Active (the default), Time Sensitive and Critical.

| Level | Overrides scheduled delivery | Breaks through Focus | Overrides Ring/Silent |
|---|---|---|---|
| Passive | No | No | No |
| Active | No | No | No |
| Time Sensitive | Yes | Yes | No |
| Critical | Yes | Yes | Yes (needs an entitlement) |

- Rules quoted from Apple ([HIG Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications)):
  - "Use the Time Sensitive interruption level only for notifications that are relevant in the moment."
  - "Make sure the notification is about an event that's happening now or will happen within an hour."
  - "Never use the Time Sensitive interruption level to send a marketing notification."
  - "The first time a Time Sensitive notification arrives from your app, the system describes how such a notification works and gives people a way to turn it off."
- Time Sensitive needs the capability to be enabled ([WWDC21 10091 notes](https://wwdcnotes.com/documentation/wwdc21-10091-send-communication-and-time-sensitive-notifications/)). The entitlement is `com.apple.developer.usernotifications.time-sensitive`, which Expo supports ([Expo iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/)). One app's PR reports that iOS silently downgrades without it (SECONDARY: [hermex #790](https://github.com/uzairansaruzi/hermex/pull/790)).
- Expo push sends `interruptionLevel: 'active' | 'critical' | 'passive' | 'time-sensitive'`. `expo-server-sdk` 7.2.0 already types it (`node_modules/expo-server-sdk/build/ExpoClient.d.ts:72`; [Expo push fields](https://docs.expo.dev/push-notifications/sending-notifications/)).

**4.1.2 Grouping and summaries.**
- `threadIdentifier`: "assign the same thread identifier string to all notifications that you want to group together visually" ([docs](https://developer.apple.com/documentation/usernotifications/unmutablenotificationcontent/threadidentifier)). `summaryArgument` and `summaryArgumentCount` are **deprecated**.
- `relevanceScore` (0–1, iOS 15+): "The highest score gets featured in the notification summary" ([docs](https://developer.apple.com/documentation/usernotifications/unnotificationcontent/relevancescore)). The Expo push API has **no** `relevanceScore` field. Setting it would need a Notification Service Extension.
- Scheduled Summary and Focus delay delivery: "Even though a Focus might delay the delivery of a notification alert, the notification itself is available as soon as it arrives" (HIG Managing notifications). **Implication: never write relative times ("in an hour"). Write the clock time.**
- Apple Intelligence:
  - It summarises "long or stacked notifications".
  - **Prioritize Notifications** puts what it judges important "at the top of the stack" and can be turned off per app ([Apple Support, iOS 27 guide](https://support.apple.com/guide/iphone/summarize-notifications-reduce-interruptions-iph1fbe7d2b9/ios)).
  - Both reached **English (India)** with iOS 18.4 ([GSMArena](https://www.gsmarena.com/apple_releases_ios_184_with_priority_notifications_expanded_apple_intelligence_availability-news-67181.php)).
  - iOS 26 re-enabled news summaries with italic text and a "Summarized by Apple Intelligence" label ([9to5Mac](https://9to5mac.com/2025/07/22/ios-26-beta-4-re-enables-apple-intelligence-notification-summaries-for-news-apps/)).
  - **Implication: a summary can only leak what is in the payload.** Payloads that name nobody stay anonymous when summarised.
- iOS 27 (WWDC 2026): no notification-system change was found in the keynote write-ups ([MacRumors roundup](https://www.macrumors.com/roundup/ios-27/); [TechRadar](https://www.techradar.com/phones/ios/here-are-21-new-features-in-ios-27-that-apple-didnt-have-time-to-mention-during-its-wwdc-2026-keynote)). **UNVERIFIED absence.** Re-check the iOS 27 release notes before the build.

**4.1.3 Communication notifications.**
- These are for "direct communications", meaning messages and calls. The system shows the sender's image, badged with the app icon ([HIG](https://developer.apple.com/design/human-interface-guidelines/notifications)).
- They need `INSendMessageIntent` with an `INPerson` image, built inside a Notification Service Extension, plus the Communication Notifications capability ([Apple](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications)).
- They "break through scheduled notification summaries by default" (same page).
- **Bluesky ships this in an Expo app.** Its NSE builds the `INPerson` from `senderDisplayName` and `senderAvatarUrl`, then donates and updates the content ([NotificationService.swift:87-165](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/modules/BlueskyNSE/NotificationService.swift#L87-L165)).
- For Blend'n, the avatar would be the creature mark until reveal.
- PROPOSAL: DMs only, as a follow-up. The NSE and native work are not justified for 7% of traffic in this round.
- The donation feeds system suggestions. Check what a donated pseudonymous `INPerson` exposes in the share sheet before shipping (UNVERIFIED).

**4.1.4 Previews, provisional authorization and in-app settings.**
- Show Previews can be **Always, When Unlocked or Never**, per app or globally ([Apple Support](https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios)).
- With previews hidden, the system shows the app icon and "Notification". Apple asks for "generically descriptive text… like 'Friend request', 'New comment'" (HIG).
- The mechanism is the category's `hiddenPreviewsBodyPlaceholder` ([docs](https://developer.apple.com/documentation/usernotifications/unnotificationcategory/hiddenpreviewsbodyplaceholder)). Expo exposes it as `previewPlaceholder` on `setNotificationCategoryAsync`, alongside `showTitle` and `showSubtitle` ([types :798-835](https://github.com/expo/expo/blob/257006eff77846a172e73fe37c864e915f8647a4/packages/expo-notifications/src/Notifications.types.ts#L798-L835)). The push selects the category with `categoryId`.
- **Provisional authorization.** Notifications go "quietly… only appear in the notification center's history", with Keep and Turn Off buttons ([Apple](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)). Expo: `allowProvisional`.
- **In-app settings link.** `providesAppNotificationSettings` adds "Blend'n Notification Settings" in iOS Settings. The system then calls `userNotificationCenter(_:openSettingsFor:)` ([docs](https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate/usernotificationcenter(_:opensettingsfor:))). Bluesky routes that callback to its settings screen with a 40-line Expo module ([ExpoBlueskyNotificationSettingsModule.swift](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/modules/expo-bluesky-swiss-army/ios/NotificationSettings/ExpoBlueskyNotificationSettingsModule.swift)).
- `UIApplication.openNotificationSettingsURLString` (iOS 16+) opens the app's notification page in Settings directly ([docs](https://developer.apple.com/documentation/uikit/uiapplication/opennotificationsettingsurlstring)).
- Apple requires both a permission request and "an in-app settings screen that lets people change their choice" (HIG Managing notifications).

**4.1.5 Live Activities.**
- They are for tasks "with defined beginning and end" that "don't exceed eight hours". They are not for ads, and not for sensitive information on the Lock Screen ([HIG Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities), updated 2025-12-16).
- Expo `expo-widgets` is stable from SDK 56, iOS only ([Expo blog, 2026-06-18](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo)).
- A check-in → check-out "tonight" activity fits Apple's definition. PROPOSAL: defer. It is iOS-only, and there is no Android equivalent (§4.2.5).

### 4.2 Android (15 and 16)

**4.2.1 Channels.**
- "Create a channel for each type of notification you need to send."
- "Once you submit the channel… you can't change the importance level… However, you can still change a channel's name and description."
- Deep link: `ACTION_CHANNEL_NOTIFICATION_SETTINGS` with `EXTRA_APP_PACKAGE` and `EXTRA_CHANNEL_ID`.
- "The notification settings screen displays the number of deleted channels, as a spam prevention mechanism."
- All from [Android channels](https://developer.android.com/develop/ui/views/notifications/channels). Expo agrees: "After a channel has been created, you can modify only its name and description" ([Expo SDK](https://docs.expo.dev/versions/latest/sdk/notifications/)).
- **Implication: give channels user-facing names. Add channels rather than repurposing them. Never delete and recreate.**
- Bluesky makes one channel per reason, with plain names: "Likes", "Replies", "New followers", "Activity from others". It also has a "Chat" group whose message channels use `lockscreenVisibility: PRIVATE` ([useNotificationHandler.ts:126-218](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/lib/hooks/useNotificationHandler.ts#L126-L218)).

**4.2.2 Runtime permission (13+).**
- "notifications are off by default" on new installs.
- Good moments to ask: "The user taps an 'alert bell' button", "chooses to follow someone's social media account", or after "the third or fourth time the user launches your app" ([Android](https://developer.android.com/develop/ui/views/notifications/notification-permission)).
- "If the user taps Deny… more than once… the user will no longer see the system permissions dialog."
- "Respect the user's decision. Don't link to system settings in an effort to convince the user to change their decision" ([Requesting permissions](https://developer.android.com/training/permissions/requesting)).
- So a Settings deep link is acceptable only when the *user* asks for notifications, for example by flipping the switch.

**4.2.3 Lock-screen visibility.**
- `VISIBILITY_PRIVATE`: "Only basic information, such as the notification's icon **and the content title**, shows on the lock screen."
- `setPublicVersion()` supplies redacted text ([Android](https://developer.android.com/develop/ui/views/notifications/build-notification)). Expo push has no public-version field.
- **Implication: the title must be safe to show to anyone holding the phone.**
- Users can also choose "Hide sensitive content" or "Don't show notifications" ([Google Help](https://support.google.com/android/answer/9079661?hl=en)).

**4.2.4 Grouping, cooldown and organiser features.**
- Since Android 7, four or more ungrouped notifications are auto-grouped. Use groups only if the children are complete and individually actionable. Otherwise update the existing notification or use MessagingStyle ([Android groups](https://developer.android.com/develop/ui/views/notifications/group)).
- Android 16 **forces** per-app bundling: "all notifications from a single app will be bundled together" ([Android Authority, 2025-06-10](https://www.androidauthority.com/android-16-force-group-notifications-3565400/), SECONDARY). Every push must therefore stand alone.
- **Notification cooldown** (Android 16; it was in an Android 15 DP and then removed):
  - It lowers the volume and alerting of rapid successive notifications. "Calls, alarms, and priority conversations are not affected."
  - Sources disagree on the window (1 vs 2 min) and on whether it is on by default ([How-To Geek](https://www.howtogeek.com/android-notification-cooldown-how-it-works/) says off by default; [Android Police](https://www.androidpolice.com/android-16-takes-a-hard-stance-against-notification-overload/) says on). **UNVERIFIED default.**
  - Implication: Blend'n's server-side burst windows (§1.1) are the right control. A burst gets muffled by the OS anyway.
- **Notification Organizer and AI summaries** (Android 16 QPR2, Pixel 9/10 only):
  - They sort Promotions, News, Social and Suggested. Promotions and News are on by default; Social is opt-in.
  - English only, in AU, CA, DE, JP, UK and US. **Not India** ([9to5Google, 2025-12-09](https://9to5google.com/2025/12/09/google-pixel-notification-organizer/); [Google](https://blog.google/products-and-platforms/platforms/android/android-16-december/)).
  - Low relevance to Blend'n's market today.

**4.2.5 Live Updates (Android 16).**
- Allowed: "Active navigation, ongoing phone calls, active rideshare tracking, and active food delivery tracking."
- **Not allowed: "Ads, promotions, chat messages, alerts, upcoming calendar events, and quick access to app features."**
- A Live Update must be ongoing, mostly user-initiated, and "require the user's attention throughout the activity" ([Android](https://developer.android.com/develop/ui/views/notifications/live-update)).
- "Starts in an hour" is an upcoming calendar event, so it is excluded. A night out does not need attention throughout. **Do not use Live Updates.**

**4.2.6 Conversation notifications.**
- They need `MessagingStyle` and a long-lived sharing shortcut. They appear in a separate top section, can be marked *priority*, and priority conversations escape cooldown ([Android](https://developer.android.com/develop/ui/views/notifications/conversations)).
- Expo push renders standard notifications. MessagingStyle needs data-only FCM and a custom native handler. Bluesky patches `expo-notifications` for a background handler ([patch notes](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/patches/expo-notifications%4057.0.20.patch.md)).
- **Out of scope.** The cost is that Blend'n DMs sit in the general section and are not cooldown-exempt.

**4.2.7 India specifics.**
- Android has 92.79% share (StatCounter, 2026-08; [gs.statcounter.com](https://gs.statcounter.com/os-market-share/mobile/india), via search snippet).
- Xiaomi/HyperOS needs a per-app "Background autostart" permission and battery exemptions, or background work "will break" ([dontkillmyapp](https://dontkillmyapp.com/xiaomi)).
- High-priority FCM delivery is usually unaffected. Delivery problems on these devices are not design problems (UNVERIFIED for HyperOS 2).

### 4.3 Copy guidelines from the platforms

| Rule | Source |
|---|---|
| The title is under 30 characters, carries the most important information, is truncated to one line, and **never includes the app name** | [Android design: notifications](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications) |
| Body text should avoid exceeding 40 characters, and should not repeat the title | same |
| The large icon is for **people (circular avatars)** or a meaningful symbol, "Don't use the large icon for branding" | same |
| At most 3 actions on Android and 4 on iOS. "Avoid providing an action that merely opens your app". Prefer nondestructive actions | Android design; HIG Notifications |
| iOS title: "brief… title-style capitalization and no ending punctuation". Body: "complete sentences, sentence case". "Don't truncate… the system does this" | HIG Notifications |
| "Avoid sending a notification that tells people to perform specific tasks within your app" | HIG Notifications |
| "Avoid including sensitive, personal, or confidential information" | HIG Notifications |
| "Avoid sending multiple notifications for the same thing" | HIG Notifications |
| iOS has no fixed truncation. Practical targets are a 35–50-character title and an 80–120-character body. Android collapsed shows about 39/43 characters | [EngageLab](https://www.engagelab.com/blog/push-notification-character-limits) (SECONDARY) |
| Emoji: no platform rule was found. **UNVERIFIED** | — |
| Deceptive patterns to avoid: system or recommendation pushes styled as personal messages, false facts, and fake time pressure | [Bits of Freedom §4.1](https://www.bitsoffreedom.nl/wp-content/uploads/2025/12/20251124-report-snapchats_manipulating_notifications.pdf) |

How anonymous and privacy-sensitive products write copy:
- Grindr leaves previews to OS settings and offers a Discreet App Icon ([Grindr Help](https://help.grindr.com/hc/en-us/articles/4402749200915-In-app-privacy-features), via search snippet).
- Blend'n's match and reveal pushes already name nobody (`lib/push-notifications.ts:556-590`). The decline path was fixed after it leaked the decliner's name (`respond/route.ts:166-184`).
- The two-lane rule in §8.6 generalises this.

---

## 5. Banners while the app is open

This section answers Q4.

- **Apple:** "Handle notifications gracefully when your app is in the foreground… present information in a discoverable but non-distracting way", for example by incrementing a badge or subtly inserting data. "Mail adds new messages to the unread list instead of sending a notification" (HIG Notifications).
- **Bluesky** (`expo-notifications@57`):
  - Non-chat pushes in the foreground show **no banner, no list entry and no sound**. They only set the badge and invalidate the feed.
  - Chat shows the system banner and list entry only if `convoId !== currentConvoId`, and never plays a sound ([useNotificationHandler.ts:89-94, 305-335](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/lib/hooks/useNotificationHandler.ts#L305-L335)).
- **Telegram** gives in-app notifications their own settings: In-App Sounds, Vibrate and Preview ([Telegram wiki](https://telegram.fandom.com/wiki/Notifications_Settings), SECONDARY).
- **M3 snackbars:**
  - 4–10 s.
  - One at a time.
  - Swipe to dismiss ([M3](https://m3.material.io/components/snackbar/guidelines); thin page summary).
- **WCAG 2.2.1 (Timing Adjustable):** a message that times out must be adjustable, or available elsewhere. The bell is the "elsewhere".
- **Today, Blend'n** shows the OS banner, list entry and sound for every kind not on screen (`lib/notifications.ts:54-65`). A friend request arriving mid-chat plays the system sound and drops a system banner over the room.

The design for Blend'n is in §8.5.

---

## 6. Notification settings: patterns

This section answers Q5.

| Pattern | Who does it | Note |
|---|---|---|
| Per-category toggles, each with **Push** and **In-app** switches and an **Everyone / People I follow** filter | Bluesky ([blog 2025-07-02](https://bsky.social/about/blog/07-02-2025-more-notification-control); [PreferenceControls.tsx:115-190](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/screens/Settings/NotificationSettings/components/PreferenceControls.tsx)) | 9+ categories. Each row's subtitle summarises its state |
| An "Enable push notifications" row shown only when not granted. It prompts if `canAskAgain`; otherwise it sends the Android `APP_NOTIFICATION_SETTINGS` intent or `Linking.openSettings()`. The state is refetched when the app returns to the foreground | Bluesky ([index.tsx:66-145](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/screens/Settings/NotificationSettings/index.tsx#L66-L145)) | Uses `Linking.sendIntent`. No new dependency |
| Per-category toggles across push and email | Hinge, Luma, Partiful | Luma maps types to channels (Email/SMS/Push) |
| Mute one event / room | Partiful (Mute event); **Blend'n already has room mute** (1 h / 8 h / tomorrow / until I turn it back on, `audit-social.md:425`) | — |
| Pause all (15 min–8 h) | Instagram | OS Focus and Do Not Disturb cover this |
| Snooze | Hinge | — |
| Quiet hours | OS Focus / Bedtime / Do Not Disturb | iOS Focus and Android DND are system-wide |
| Per-category control, including platform-generated kinds and in-app badges | Recommended by Bits of Freedom (§5 of the report) | — |

**Permission and re-prompting.**
- Apple: "Request permission only when your app clearly needs access". A pre-alert screen gets "only one button… Continue or Next… not 'Allow'". "Never precede the system-provided alert with a custom screen… that could confuse or mislead" ([HIG Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy)).
- Apple again: "Make the request in a context that helps people understand why", for example "after the person schedules a first task" ([Apple](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)).
- For Android, see §4.2.2.

---

## 7. Accessibility

This section answers Q6.

- **WCAG 4.1.3 Status Messages.** Status messages must be programmatically determinable "without receiving focus". Its example is a cart count ("5 items") that the screen reader announces ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)).
- **React Native.**
  - `announceForAccessibilityWithOptions(text, {queue: true})` queues behind current speech. It is **iOS only** ([RN AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)).
  - `accessibilityLiveRegion` (`polite` / `assertive`) is **Android only**.
  - `isReduceMotionEnabled()` and `prefersCrossFadeTransitions()` (iOS) exist; `reduceMotionChanged` is an event.
- **Android 16 deprecates `announceForAccessibility`.** For changes to critical UI, use `setAccessibilityLiveRegion`, "sparingly", or pane titles ([Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-all)).
- **Badges.** M3 asks for content descriptions on badges (M3 Badges). Apple: badges can be turned off, so never rely on a badge alone (HIG Notifications).
- **Row actions.** Bluesky exposes "Expand list of users" and "View {name}'s profile" as `accessibilityActions` on the row, so the row stays one focus stop ([NotificationFeedItem.tsx:586-614](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/view/com/notifications/NotificationFeedItem.tsx#L586-L614)).
- **Reduce Motion.** Replace movement with fades (the HIG via `research-haptics-motion.md` §0.9).

---

## 8. Recommendations for Blend'n

### 8.1 Screen structure

`/notifications` is a full-screen route pushed onto the current tab's stack. It is opened from the bell in the Pulse top bar and in the Banter inbox.

```
┌──────────────────────────────────────┐
│ (‹)  Notifications              (⋯)  │  ← glass control layer: back + overflow (glass);
│                                      │    large title collapses to inline on scroll
├──────────────────────────────────────┤
│ ⓘ Push is off. These still land here,│  ← only if OS permission off; solid row
│   but your phone won't tell you.  [Turn on]
├──────────────────────────────────────┤
│ WAITING ON YOU · 3                   │  ← section header (role=header)
│ [◐] Arjun wants to be friends        │
│     From Saturday Social · 2h  [Accept][Decline]
│ [▦] Crew invite: Night Owls          │
│     From Meera · 5h            [Join][Decline]
│ [🦊] Velvet Otter answered your ask   │
│     Saturday Social · 1d       [View]
│ See all 4                         ›  │  ← only if >3
├──────────────────────────────────────┤
│ NEW                                  │  ← rows unseen when the screen opened
│ [◎] Your crew's here — 3 of you    • │
│     Saturday Social · now            │
│ [🦊🐙] 2 new matches                 • │
│     Saturday Social · 20m            │
├──────────────────────────────────────┤
│ EARLIER                              │
│ [▣] New start time: 9:30 pm          │
│     Saturday Social · Updated 2× · Mon
│ [▣̸] Cancelled: Jazz on the Terrace   │
│     Sun 28 Sep                       │
│ …                                    │
│ That's everything from the last 30 days.
└──────────────────────────────────────┘
          (↑ New)  ← glass pill, appears only when scrolled down and rows arrive
```

- **There are no tabs or filters.** "Waiting on you" is the only slice that needs separating. PROPOSAL: add a filter when volume demands it.
- **"Waiting on you" comes from live request state, not from notification rows.** It covers friend requests, crew invites, message requests, board replies to your asks, and reveal requests. Rows are pruned 30 days after being read (`lib/notification-retention.ts:31`) while a request can stay pending, and Instagram's requests entry in Activity reflects requests, not history. Accepting or declining removes the item in place. The history row (below) remains, showing the outcome ("You're friends with Arjun").
- **"New" and "Earlier"** are the only time sections. Volume is low, and retention is 30 days for read rows and 90 for unread. Today, Yesterday and This week buckets would mostly hold one row each. This is a PROPOSAL: Instagram uses finer buckets (SECONDARY).
- **Live updates.**
  - At scroll top, new rows insert at the head with a 200 ms fade.
  - When scrolled down, show a glass "↑ New" pill and never move content under the finger (Bluesky's rule, §2.1).
  - Add pull-to-refresh. It is safe now that the surface is a screen and not a sheet.
- **Pagination.** Cursor-based with 30 per page (as in Bluesky). The footer reads "That's everything from the last 30 days."
- **The overflow menu (⋯)** holds "Notification settings" and "Clear all". Clear all keeps the existing confirm tray. It moves off the main surface because the seen-on-open model (§8.4) removes the reason to clear, and Bluesky and Discord have no clear-all. No per-row swipe-to-dismiss: YAGNI, and the Instagram evidence is SECONDARY.
- **States to draw:**
  - Loading: 6 skeleton rows.
  - Error: "Couldn't load notifications" + Try again.
  - Empty, permission off, and a populated list.
  - A request row through its states: pending → accepting (spinner in the button) → accepted (inline line "You're friends now" for 2 s, then it leaves "Waiting on you").
  - A stale request (withdrawn or expired): "This request is no longer open", not a navigation into an error.
- **Empty state:**
  - Title: "Quiet for now".
  - Body: "Friend requests, matches, crew news and event changes land here. Messages are in Banter."
  - It says where DMs live, because they are deliberately not here. There is no call to action.

### 8.2 Row anatomy by kind

**Layout.**
- A 40 pt leading visual.
- A title in `bodyStrong`, up to 2 lines, saying what happened in sentence case.
- A context line in `meta`, 1 line: event · time.
- A trailing unread dot or inline actions.
- The whole row is one tap target. Rows are solid content, with no glass.

**Leading visual rules.** The same rules apply to the in-app banner.

| Actor status (as the *viewer* sees them) | Visual |
|---|---|
| Named to you (revealed to you, a friend, or an accepted request) | Round photo. Initials on `surfaceSunken` if there is no photo |
| Pseudonymous, seen in an event | **That event's creature disc**, with the same seed as in the room (`lib/pseudonymAvatar.ts`). Never blurred and never a silhouette |
| Nobody, by design ("We're here", "It's a Blend") | A rounded-square **glyph tile** on `surfaceSunken` with an outlined icon (crew / sparks). Never person-shaped |
| Event | The event cover as a 40 pt rounded square (radius 8) with a 16 pt outlined kind badge at the bottom-right: clock, pin, megaphone or star. Cancelled: desaturated cover, with the word "Cancelled" in the title and not conveyed by colour alone |
| Several pseudonymous people (aggregated) | Up to 3 overlapping creature discs at 28 pt, then "+N" (Bluesky stops at 5. Blend'n rows are narrower once actions are included) |

| Kind | Visual | Title (in-app) | Context line | Trailing | Tap → |
|---|---|---|---|---|---|
| friend_request | photo or disc, by identity rule | "{Name} wants to be friends" / "Someone from {event} wants to be friends" | event · time | **Accept** (filled) · **Decline** (outline) | profile |
| friend_accepted | photo | "{Name} accepted your friend request" | time | dot | friend profile |
| match | creature disc(s) | "You matched with {pseudonym}" / "{n} new matches" | event · time | dot | match conversation / matches list |
| reveal_request | creature disc | "{pseudonym} asked to know you" | event · time | **View** | conversation (the RevealBar lives there. A reveal is too weighty to make one tap in a list) |
| reveal | **photo**, now revealed | "{Name} revealed: you matched at {event}" | time | dot | conversation |
| board_request (a reply to your ask) | creature disc(s) | "{pseudonym} answered your ask" / "{n} answered your ask" | "{ask title}" · time | **View** | board ask |
| board_request_accepted | disc / photo | "You're in: {ask title}" | event · time | dot | conversation |
| message_request | photo or disc | "{Name} wants to message you" | time | **View** (read before you decide) | Banter → requests |
| message_request accepted | photo | "{Name} accepted your message request" | time | dot | conversation |
| crew_invite | crew glyph tile | "Crew invite: {crew}" | "From {inviter or 'a friend'}" · time | **Join** · **Decline** | crew |
| we_are_here | crew glyph tile | "Your crew's here" / "{n} of your crew are here" | event · now | dot | event room |
| its_a_blend | sparks glyph tile | "It's a Blend" | event · time | dot | Blend view |
| event_changed | cover + clock/pin | "New start time: 9:30 pm" / "New venue: {venue}" | event · "Updated 2×" · time | dot | event |
| event_cancelled | desaturated cover + ✕ | "Cancelled: {event}" | date of the event | dot | event (in its cancelled state) |
| starts_soon | cover + clock | "Starts at 9:00 pm" | event · venue | dot | event |
| announcement | cover + megaphone | "{Organiser label}: {first line}" | event · time | dot | event room |
| waitlist_promoted | cover | "You're in: a place opened up" | event · time | dot | event |
| rating_request | cover + star | "How was {event}?" | time | dot | `/rate/[eventId]` |

### 8.3 Grouping and aggregation rules

1. **Aggregate by count, for low-stakes repeats only.**
   - The key is `(kind, eventId)` within the same event night. "Night" means event start to end + 6 h, matching `RATING_REQUEST_LOOKBACK_MS`.
   - Kinds: `match`, `friend_accepted`, `we_are_here`, `board_request` on the same ask.
   - Copy: "{n} new matches", "{n} of your crew are here", "{n} answered your ask". Use a name list only when every actor is named to you ("Priya, Arjun and 2 others accepted").
2. **Never aggregate:**
   - Anything awaiting your decision. Each request is its own row in "Waiting on you".
   - Reveals, which are personal moments.
   - "It's a Blend", which is rare and celebratory.
   - Cancellations.
   - Organiser announcements, each of which is distinct content. This matches the server, which stacks them and never replaces them (`deliveryFor`).
3. **Event logistics collapse per event.** This mirrors the push `collapseId event:{id}`.
   - Changed and starts-soon rows for one event are one row showing the **latest** state, with "Updated N×" in the context line.
   - A cancellation replaces that row, and cancelled always wins.
   - Expanding the row shows the history (PROPOSAL; YAGNI until asked).
4. **Aggregates update in place.** "2 of your crew are here" becomes 3. The row moves back to "New" and its dot returns.
5. Server work implied: none required for the grouping. The client can group the rows it fetches, as Bluesky does in `groupNotifications`. A second page can split a group, which is Bluesky's known issue #1974. That is acceptable at Blend'n's volume.

### 8.4 Unread handling and the badge

- **There are two states: seen and done.**
  - *Seen* covers every row. Opening the screen marks seen.
  - *Done* covers requests only. It is derived from the request's own status, with no new column.
- **On opening the screen:**
  - Clear the bell badge optimistically.
  - Call `POST /notifications/read` scoped to rows **created at or before the newest row fetched**.
  - Today the endpoint takes `ids` or "all of mine". "All" can mark a row that landed between the fetch and the call, without anyone seeing it. That is Bluesky's reason for `seenAt` = sync time.
  - PROPOSAL: add `before: ISO timestamp` to the schema.
- **Rows unseen at open:**
  - They render in "New" with an 8 pt accent dot and a semibold title. That is two cues, not colour alone.
  - They stay styled for this visit and fall to "Earlier" on the next.
  - Do not use Bluesky's tinted background. With solid content, one dot reads more cleanly than a band of tinted rows (PROPOSAL).
- **A push tap marks that row read** (by id).
- **The bell badge counts unseen rows only.**
  - A pending request does not keep it lit. That count shows in the "Waiting on you · 3" header.
  - Display 1–9, then "9+". The accessible value is the true number.
  - The badge appears with a 150 ms fade/scale from 0.8. Under Reduce Motion it is a plain fade. No bounce, matching "still marks, not motion" (`audit-discovery.md:25`).
- **App-icon badge** (PROPOSAL; verify with the owner):
  - It equals unseen bell rows plus **conversations** with unread messages (each conversation counts once). That is the count of things waiting for you anywhere.
  - The server computes it and sends `badge` on every push. Expo's `badge` field is iOS-only; Android launchers show a dot per channel's `showBadge`.
  - The client calls `setBadgeCountAsync` after any read.
  - It is never set to 0 while anything is unread, because of the iOS clearing rule in §3.3.

### 8.5 The in-app banner

- **Mechanism.**
  - `setNotificationHandler` returns `{shouldShowBanner:false, shouldShowList:false, shouldPlaySound:false, shouldSetBadge:false}` for every foreground push.
  - The app renders its own banner with Reanimated and gesture-handler, which are already installed, so no new dependency is needed.
  - The bell badge and list update over the existing socket `notification:new` (`lib/push-notifications.ts:284-297`).
- **When to show** (all three must hold):
  1. The kind is one of: DM, room reply (existing behaviour), friend_request, message_request, crew_invite, match, reveal_request, reveal, board_request, we_are_here, its_a_blend, or event_changed/cancelled/starts_soon **for an event today**.
  2. Its destination is not on screen. Extend `claimThread` (`lib/notifications.ts:35-45`) to claim `event:{id}` on the event page and its room, `crew:{id}` on the crew, `match:{id}` during the match moment, and `notifications` on the bell screen. On the bell screen, insert the row instead of showing a banner.
  3. The user is not mid-gesture in a hold-to-confirm or a sheet. If they are, drop the banner; it is in the bell. Do not queue (YAGNI).
- **Never shown for:** announcement (it appears in the room and the bell), rating_request, waitlist_promoted (the event page shows it), and friend_accepted / message-request accepted (low urgency, bell only). This list is a PROPOSAL to tune.
- **Design:**
  - A **glass capsule** at the top, inset 8 pt from the safe area. It is the control layer and transient, matching iOS 26 system banners. Android uses the fallback in `research-android-m3e.md`.
  - Content: the 32 pt leading visual from §8.2, a title on 1 line (`bodyStrong`) and a body on 1 line (`meta`). It uses the **in-app** wording (§8.2), not the push wording: inside the app the creature disc and pseudonym are fine.
  - No buttons.
- **Behaviour:**
  - Tap opens the destination and marks the row read.
  - Swipe up dismisses.
  - Auto-dismiss after **4 s**, paused while touched. M3's range is 4–10 s.
  - **No auto-dismiss while a screen reader is on**: `AccessibilityInfo.isScreenReaderEnabled`, WCAG 2.2.1. It stays until swiped or after 10 s of focus-free time (PROPOSAL).
  - One at a time. A newer banner replaces the current one. A same-kind banner within 4 s merges ("2 new matches") instead of stacking.
- **Haptics and sound: none.** An arrival is unsolicited. This is the "nothing unsolicited" rule from `research-haptics-motion.md`.
- **Motion:** a 16 pt translate down plus a fade in, 200 ms ease-out. Out: translate up plus fade, 150 ms. Under Reduce Motion: opacity only.
- **Accessibility:**
  - iOS: `announceForAccessibilityWithOptions("{title}. {body}", {queue:true})`.
  - Android: `accessibilityLiveRegion="polite"` on the banner container. Do not call `announceForAccessibility`, which Android 16 deprecates.
  - The banner is a button labelled "{title}. {body}. Double-tap to open."

### 8.6 Push copy rules

1. **Two lanes.**
   - **Person-lane** kinds (friend, match, reveal, board, message request, crew) name **no person and no place** in the title or body. This holds even after a reveal (§0.6).
   - **Event-lane** kinds (changed, cancelled, starts soon, announcement, waitlist, rating) name the **event in the body**, never a person. The organiser speaks as the event.
   - DMs and room replies keep today's convention: thread name plus a preview.
2. **The title is a generic kind phrase of 30 characters or fewer.** It must be safe on a lock screen, because Android PRIVATE shows the title. Put event names in the body, which also keeps them out of the 30-character title budget. Some event names are sensitive themselves (a queer night, a support group).
3. **The body is one complete sentence.** The first 40 characters carry the meaning; the whole body is about 80 or fewer.
4. **No emoji, no app name, no "Tap to…", no "Open Blend'n to…".** The HIG asks to avoid task instructions, and Android forbids the app name.
5. **Write absolute times ("9:30 pm"), never relative ones ("in an hour").** Focus and Scheduled Summary delay delivery, and notifications are read late.
6. **Each push stands alone.** Android 16 bundles per app, and AI summaries condense stacks.
7. **Never push a rejection.** Declines are silent. The requester's item stays "Sent" in-app until it expires. PROPOSAL: remove the `message_request_response` decline push (`respond/route.ts:197`).
8. **Never manufacture urgency or personhood.**
   - No recommendation or "come back" pushes.
   - Time Sensitive only by the HIG rule: now, or within an hour.
   - Never style a system push as if a person sent it. These are the Snapchat findings.
9. **Copy for hidden previews** is set per iOS category with `previewPlaceholder` (§8.7 column). For example "Friend request" or "Event update", following Apple's examples.
10. **Push notifications have no action buttons.** Accept and Decline on a push would let someone accept a person they cannot see, because the push deliberately does not say who. Actions live in the bell.
11. **Casing: sentence case for titles too.** This deviates from the HIG's title case to match Blend'n's voice. **The owner should confirm.**

### 8.7 Push copy for each kind

**Columns:**
- iOS level: P = passive, A = active, TS = time-sensitive.
- Thread/collapse: `collapse` means iOS `collapseId` plus Android `tag`.
- Placeholder: the iOS `previewPlaceholder` for the category.

| Kind | Title | Body | Placeholder | iOS | Android channel | Thread / collapse | Banner in-app |
|---|---|---|---|---|---|---|---|
| friend_request | Friend request | Someone you've met wants to add you. | Friend request | A | `people` | — | yes |
| friend_accepted | Friend request accepted | You're friends now. | Friend update | A | `people` | — | no |
| match | It's a match | Someone you liked liked you back. | Match update | A | `people` | thread `match` | yes |
| reveal_request | A match asked to know you | It's your call. Nothing changes unless you reveal. | Match update | A | `people` | thread `match` | yes |
| reveal | A match revealed | They've shared who they are with you. | Match update | A | `people` | thread `match` | yes |
| board_request | Reply to your ask | Someone wants in on your board post. | Board update | A | `people` | collapse `ask:{askId}` | yes |
| board_request_accepted | Request accepted | You can message them now. | Board update | A | `people` | — | no |
| message_request | Message request | Someone wants to message you. | Message request | A | `messages` | — | yes |
| message_request accepted | Request accepted | You can chat now. | Message request | A | `messages` | — | no |
| message_request declined | **— (no push)** | — | — | — | — | — | — |
| crew_invite | Crew invite | You've been asked to join a crew. | Crew update | A | `crew` | — | yes |
| we_are_here | Your crew's here | A crewmate just arrived. → "{n} of your crew have arrived." | Crew update | **TS** | `crew` | collapse `here:{eventId}` | yes |
| its_a_blend | It's a Blend | Your crew matched with another crew. | Crew update | A | `crew` | thread `crew:{eventId}` | yes |
| event_changed (time) | New start time | {Event} now starts at 9:30 pm on Sat 4 Oct. | Event update | A; **TS** if old or new start ≤ 60 min away | `events` | collapse `event:{id}` (exists) | yes, if today |
| event_changed (place) | New venue | {Event} has moved to {Venue}, {Area}. | Event update | as above | `events` | collapse `event:{id}` | yes, if today |
| event_changed (both) | New time and venue | {Event}: 9:30 pm at {Venue}, {Area}. | Event update | as above | `events` | collapse `event:{id}` | yes, if today |
| event_cancelled | Event cancelled | {Event} on Sat 4 Oct won't go ahead. | Event update | A; **TS** if start ≤ 60 min away | `events` | collapse `event:{id}` | yes |
| starts_soon | Starts at 9:00 pm | {Event} at {Venue}, {Area}. | Event update | **TS** | `events` | collapse `event:{id}` | yes, unless on the event page |
| announcement | From the organiser | {Event}: {text, clipped to ~100}. | Event update | A | `events` | thread `event:{id}`, stacked (exists) | no |
| waitlist_promoted | You're in | A place opened up at {Event}. | Event update | A | `events` | thread `event:{id}` | no |
| rating_request (peers) | How was the night? | Rate the people you met at {Event}. Only you see what you say. | Rating | **P** | `later` | collapse `rate:{id}` (exists) | no |
| rating_request (event) | How was the night? | Rate {Event}. Only you see it. | Rating | **P** | `later` | collapse `rate:{id}` | no |
| DM (unchanged) | {thread name: pseudonym until reveal} | preview, or "{n} new messages" | Message | A | `messages` | collapse `dm:{id}` (exists) | yes, unless in the thread |
| Room reply (unchanged) | {room} | {pseudonym} replied: {preview} | Room reply | A | `rooms` | collapse `room:{id}` (exists) | yes, unless in the room |

**Lengths** (COMPUTED; Android title limit 30):
- The longest title is "A match asked to know you" (25 characters).
- Bodies put the meaning in the first 40 characters. For example, "Someone you liked liked you back." is 33.

### 8.8 Android channels

Importance is fixed at creation, so the existing IDs keep their importance. Names and descriptions are renamed through `setNotificationChannelAsync`, which Android allows.

| ID | Status | User-visible name | Description | Importance | Kinds | Lock screen |
|---|---|---|---|---|---|---|
| `messages` | existing (HIGH) | **Messages** (was "Messages and people") | Direct messages and message requests | HIGH (fixed) | DM, message request, accepted | as created (user's setting) |
| `rooms` | existing (DEFAULT) | Room replies | When someone replies to you in an event room | DEFAULT (fixed) | room reply | as created |
| `events` | existing (HIGH) | **Event updates** | Time or venue changes, cancellations, start reminders and organiser posts for events you're going to | HIGH (fixed) | changed, cancelled, starts soon, announcement, waitlist | as created |
| `people` | **new** | Matches and friends | Matches, reveals, friend requests and replies to your board posts | HIGH | friend_*, match, reveal_*, board_* | PRIVATE |
| `crew` | **new** | Your crew | Crew invites, when your crew arrives, and Blends | HIGH | crew_invite, we_are_here, its_a_blend | PRIVATE |
| `later` | **new** | After the night | A nudge to rate an event you went to | **LOW** (no sound, no pop-up) | rating_request | PRIVATE |
| `default` | existing (MAX) | **Other** (currently named "default") | Anything else from Blend'n | MAX (fixed) | payloads with no type only | as created |

- **New channels:**
  - Omit `vibrationPattern` and `lightColor` so they use the system defaults. The existing `[0,250,250,250]` double buzz cannot be removed from the old channels.
  - This follows the strict haptic vocabulary and Android's guidance against custom waveforms (`research-haptics-motion.md` §0.1).
- **Server:** `deliveryFor`'s `default:` branch (`lib/push-notifications.ts:89-90`) routes to `people`, `crew` or `messages` by kind. `rating_request` moves to `later`.
- **Old app builds** that lack the new channels: Android files unknown channel IDs under "Miscellaneous" at normal importance (the comment at `lib/push-notifications.ts:47-52`). Gate the routing on client version, or accept a short transition (PROPOSAL).
- **No channel groups.** Groups help only when channel names repeat (Android docs).

### 8.9 The settings screen

Location: Settings → NOTIFICATIONS. It is also reachable from the bell's ⋯ menu and, on iOS, from "Blend'n Notification Settings" in iOS Settings via `providesAppNotificationSettings`. Bluesky's 40-line module is the template; it is a nice-to-have.

```
NOTIFICATIONS
┌───────────────────────────────────────────┐
│ ⓘ Notifications are off for Blend'n       │  ← only when OS-denied
│   Turn them on to hear about changes.  [Turn on]
├───────────────────────────────────────────┤
│ Push notifications                   [●]  │  ← existing master (token on/off)
├───────────────────────────────────────────┤
│ TELL ME ABOUT                             │
│ Messages                             [●]  │
│   Direct messages and message requests    │
│ Room replies                         [●]  │
│ Matches and friends                  [●]  │
│ Your crew                            [●]  │
│ Event updates                        [●]  │
│   Includes cancellations                  │
│ After the night                      [○]? │  ← default ON; shown here off as example
├───────────────────────────────────────────┤
│ Sounds, pop-ups and lock screen   Phone › │  ← OS deep link
└───────────────────────────────────────────┘
```

- **Toggles are push-only and stored server-side.** The server skips the push but still writes the bell row. Bluesky's per-category in-app toggle and audience filter are YAGNI at this volume.
- The six toggles match the six Android channels. The same words appear in the OS settings, so a person finds the same names in both places.
- **The "Turn on" row:**
  - If `getPermissionsAsync().canAskAgain`, request permission.
  - Otherwise use `Linking.openSettings()` on iOS, or `Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [{key:'android.provider.extra.APP_PACKAGE', value}])` on Android. That is Bluesky's exact code; no new dependency.
  - The user started this, which keeps it consistent with Android's "don't link to settings to convince".
  - Refetch the permission state when the app returns to the foreground.
- **"Sounds, pop-ups and lock screen"** opens the OS page for the app. Per-channel deep links on every row (`CHANNEL_NOTIFICATION_SETTINGS`) are possible but add clutter (PROPOSAL: one row).
- **Not included:**
  - Quiet hours and pause-all. OS Focus, Bedtime and DND cover them, and Blend'n's peak is at night. Add them if users ask.
  - Provisional authorization. Its quiet delivery defeats Time Sensitive kinds, and Android has no equivalent.
  - Per-event mute beyond the existing room mute.
- **Permission timing:**
  - Keep the onboarding step. Add **in-context** asks at the moments where a push is the obvious payoff:
    - After RSVP "Going": "Want a heads-up if the time or venue changes?"
    - After the first like or friend request.
    - On joining a crew.
  - Each is an inline row with **one** button, "Continue", that opens the system dialog. This follows the HIG pre-alert rule.
  - Never show it again after a denial. The bell's "Push is off" row and this settings row are the only routes back.
- **Haptics:** toggles fire a selection tick through the fallback ladder. Use `TOGGLE_ON`/`OFF` on API 34+, and fall back below that (`research-haptics-motion.md`).

### 8.10 Haptics and motion on these surfaces

| Event | Haptic | Motion |
|---|---|---|
| Push or banner arrives, badge changes, row inserts | **none** | badge fade/scale 150 ms; row fade 200 ms; banner per §8.5 |
| Accept / Join (user action that succeeds) | success (iOS `notificationAsync(Success)`; Android `CONFIRM` on API 30+) | button → spinner → inline "You're friends now", then the row collapses (height animates 200 ms; fade under Reduce Motion) |
| Decline | none (no celebration and no error) | the row collapses |
| Opening the bell / row tap | none (navigation) | standard push transition |
| Clear all (confirmed) | none | the list fades out |

### 8.11 Work this implies, and open questions

**Server** (blendn-admin):
- `deliveryFor` adds `categoryId` and `interruptionLevel` per kind, plus the new channel routing.
- Copy changes per §8.7. Remove the decline push.
- `POST /notifications/read` accepts `before`.
- Compute `badge`.
- Persist the per-category push preference and skip sends accordingly.

**Client** (blendn):
- Create the three channels and rename three.
- Register iOS categories with `previewPlaceholder`.
- Add the time-sensitive entitlement in `app.json`.
- Change the foreground handler to show nothing, and add the custom banner.
- Turn the bell into a pushed screen.
- Add the settings rows.

**Open questions for the owner:**
1. Is sending a message request the reveal? If yes, keep the name in-app and still drop it from the push (§1.2).
2. Should declines push at all? The proposal is no.
3. Does a friend request carry the requester's identity in-app? This decides whether the row shows a photo or a disc.
4. Crew mechanics (invite, "We're here", "It's a Blend") are not in blendn-admin at `e232920`. The copy here is new and needs the crew spec.
5. App-icon badge: bell plus conversations, or the bell only?
6. Title casing: sentence case (proposed) or HIG title case?

---

## 9. Sources

**Apple**
- [HIG: Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)
- [HIG: Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications)
- [HIG: Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy)
- [HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- [Asking permission to use notifications](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)
- [Implementing communication notifications](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications)
- [threadIdentifier](https://developer.apple.com/documentation/usernotifications/unmutablenotificationcontent/threadidentifier)
- [relevanceScore](https://developer.apple.com/documentation/usernotifications/unnotificationcontent/relevancescore)
- [hiddenPreviewsBodyPlaceholder](https://developer.apple.com/documentation/usernotifications/unnotificationcategory/hiddenpreviewsbodyplaceholder)
- [openSettingsFor](https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate/usernotificationcenter(_:opensettingsfor:))
- [openNotificationSettingsURLString](https://developer.apple.com/documentation/uikit/uiapplication/opennotificationsettingsurlstring)
- [WWDC21 10091](https://developer.apple.com/videos/play/wwdc2021/10091/) and [notes](https://wwdcnotes.com/documentation/wwdc21-10091-send-communication-and-time-sensitive-notifications/)
- [Apple Support: notification settings (iOS 27 guide)](https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios)
- [Apple Support: summarize and prioritize](https://support.apple.com/guide/iphone/summarize-notifications-reduce-interruptions-iph1fbe7d2b9/ios)
- [9to5Mac: iOS 26 summaries](https://9to5mac.com/2025/07/22/ios-26-beta-4-re-enables-apple-intelligence-notification-summaries-for-news-apps/)
- [GSMArena: iOS 18.4, India](https://www.gsmarena.com/apple_releases_ios_184_with_priority_notifications_expanded_apple_intelligence_availability-news-67181.php)
- [MacRumors: iOS 27](https://www.macrumors.com/roundup/ios-27/)

**Android and Google**
- [Channels](https://developer.android.com/develop/ui/views/notifications/channels)
- [Notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [Requesting permissions](https://developer.android.com/training/permissions/requesting)
- [Conversations](https://developer.android.com/develop/ui/views/notifications/conversations)
- [Groups](https://developer.android.com/develop/ui/views/notifications/group)
- [Build a notification (visibility)](https://developer.android.com/develop/ui/views/notifications/build-notification)
- [Live Updates](https://developer.android.com/develop/ui/views/notifications/live-update)
- [Android 16 features](https://developer.android.com/about/versions/16/features)
- [Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-all)
- [Design: notifications](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications)
- [Google Help: control notifications](https://support.google.com/android/answer/9079661?hl=en)
- [M3 Badges](https://m3.material.io/components/badges/guidelines)
- [M3 Snackbar](https://m3.material.io/components/snackbar/guidelines)
- [Android Authority: forced grouping](https://www.androidauthority.com/android-16-force-group-notifications-3565400/)
- Cooldown: [9to5Google](https://9to5google.com/2024/11/19/notification-cooldown-android-16-dp1/), [How-To Geek](https://www.howtogeek.com/android-notification-cooldown-how-it-works/), [Android Police](https://www.androidpolice.com/android-16-takes-a-hard-stance-against-notification-overload/)
- [9to5Google: Notification Organizer](https://9to5google.com/2025/12/09/google-pixel-notification-organizer/)
- [Google blog: Android 16 December](https://blog.google/products-and-platforms/platforms/android/android-16-december/)
- [StatCounter India](https://gs.statcounter.com/os-market-share/mobile/india)
- [dontkillmyapp: Xiaomi](https://dontkillmyapp.com/xiaomi)

**Expo and React Native**
- [Expo push message fields](https://docs.expo.dev/push-notifications/sending-notifications/)
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/)
- [Expo widgets and Live Activities](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo)
- [Notifications.types.ts @257006e](https://github.com/expo/expo/blob/257006eff77846a172e73fe37c864e915f8647a4/packages/expo-notifications/src/Notifications.types.ts)
- [RN AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)

**Accessibility and UX research**
- [WCAG 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [NN/g: Bottom sheets](https://www.nngroup.com/articles/bottom-sheet/)
- [NN/g: Indicators, validations, notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)
- [Bits of Freedom: How Snapchat's notifications manipulate users (2025-11-24)](https://www.bitsoffreedom.nl/wp-content/uploads/2025/12/20251124-report-snapchats_manipulating_notifications.pdf)

**Apps**
- Bluesky: code @ [`61c7cad`](https://github.com/bluesky-social/social-app/tree/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f) (files cited inline); [blog 2025-07-02](https://bsky.social/about/blog/07-02-2025-more-notification-control); [issue #1974](https://github.com/bluesky-social/social-app/issues/1974)
- [Threads (9to5Mac)](https://9to5mac.com/2025/10/30/threads-rolls-out-reply-approvals-and-new-activity-feed-filters/)
- X: [Help](https://help.x.com/en/managing-your-account/understanding-the-notifications-timeline), [Roboin](https://roboin.io/article/en/2026/01/11/what-is-the-priority-tab-in-x-notifications/)
- Instagram: [Help: follow requests](https://help.instagram.com/207917546007234), [Newsweek: Pause all](https://www.newsweek.com/pause-notifications-instagram-how-feature-new-update-1361846), [Mobbin-derived spec (SECONDARY)](https://github.com/externaldev21-sketch/brandthread/pull/201)
- [Discord (Engadget)](https://www.engadget.com/discord-overhauls-its-mobile-app-with-new-tabs-messaging-features-and-more-170035917.html)
- Luma: [types](https://help.luma.com/p/notification-types), [reminders](https://help.luma.com/p/update-to-reminders-on-luma), [teardown PDF (SECONDARY)](https://assets.nextleap.app/submissions/LumaAppNotifications-41d53037-356b-43d7-87c0-6fd04b62eb40.pdf)
- Partiful: [settings](https://help.partiful.com/hc/en-us/articles/44702879192859-How-can-I-adjust-my-notification-settings), [reminders](https://help.partiful.com/hc/en-us/articles/24470120681115-What-event-reminders-do-you-send), [mute](https://help.partiful.com/hc/en-us/articles/26503500543515-How-do-I-stop-receiving-notifications-for-an-event)
- [Hinge](https://help.hinge.co/hc/en-us/articles/360011142974-How-can-I-manage-my-notifications)
- Bumble: [Support](https://support.bumble.com/hc/en-us/articles/28423161699485-Viewing-who-s-liked-you), [roast.dating (SECONDARY)](https://roast.dating/blog/bumble-beeline)
- [Grindr](https://help.grindr.com/hc/en-us/articles/4402749200915-In-app-privacy-features)
- [Telegram (SECONDARY)](https://telegram.fandom.com/wiki/Notifications_Settings)
- [EngageLab: character limits (SECONDARY)](https://www.engagelab.com/blog/push-notification-character-limits)
