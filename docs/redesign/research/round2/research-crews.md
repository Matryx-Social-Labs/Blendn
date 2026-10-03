# Blend'n Crews: research and recommendations for the mobile redesign (round 2)

> **Note (2026-10-03):** the server finding in §0.1 (a new crew of one is dissolved by the 15-minute sweeper) was confirmed by reading `lib/crews/sweep.ts` `repairCrews` and `createCrew` on admin `origin/dev` `3852f15`. It still needs fixing on the server. SCREENS-ADDITIONS 10.1 draws the forming state as blocked on it.


- **Date:** 2026-10-03
- **For:** the Claude Design brief (Crews, "We're here", crew cards in the Room, Blends, reveal)
- **Method:** web research only (WebSearch and WebFetch). Every external claim links to its source. Some help centres (Tinder, Bumble BFF, Partiful, Life360, Zenly, BeReal) return a Cloudflare 403 to WebFetch. Their article bodies were read from each help centre's public Zendesk JSON endpoint (`/api/v2/help_center/en-us/articles/<id>.json`), which serves the same article text. The links below go to the human-readable article.
- **Server facts** come from `origin/dev` (`lib/openapi/paths/mobile-crews.ts`, `lib/crews/*.ts`, `lib/constants.ts`). They are cited by file. They were read, not driven.
- **Labels:** **UNVERIFIED** means I could not confirm it from a primary source. **PROPOSAL** is my recommendation. **SERVER** is behaviour read from the code on `origin/dev`.

---

## 0. Summary: the decisions this brief recommends

1. **No new tab.** Crews live in the places that already exist. Me › Crews manages them. Banter holds crew chats, crew invites and Blend rooms. The Blend'n Room overlay holds "Crews here", liking and "We're here". The current tab order is `Pulse · Going · [Blend'n] · Banter · Me` (`.context/redesign/audit-core-loop.md:100`). Tinder put pair and group dating behind an icon or pill on screens that already existed, and gave neither its own tab ([Tinder Help: Double Date](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date), [Tinder Help: Group Hangouts](https://www.help.tinder.com/hc/en-us/articles/46714669437453-Group-Hangouts)).
2. **A crew is a square; a person is round.** Banter's rule is already "A person is round and a room is a square cover" (`audit-social.md:174`). The crew emblem is a squircle with a seeded abstract motif, never a creature and never a face. People in rooms are creatures (`audit-social.md:165`), so a creature on a crew would read as a person.
3. **The emblem is seeded from `emblemSeed` and nothing else.** The seed is random at creation (SERVER: `lib/crews/crews.ts:315`, `randomBytes(8)`), so it can never encode members. It must not change on rename or as people join and leave. If it did, a stranger watching the card could tell that membership had changed.
4. **Counts only, drawn as ticks.** The card shows a ring or row of N neutral ticks, with the "here now" ticks filled. It reads "Crew of 5 · 3 here now". This follows Spotify's practice of encoding member count in Blend cover art (secondary source, [followeran](https://followeran.com/en/blog/what-is-spotify-blend/)), applied to counts and never to people.
5. **Liking for the crew is one tap and needs no confirmation.** Any present member likes on the crew's behalf, which is the same rule as Tinder's "Only one like per pair" and "someone from each group sends a Like" ([Tinder Newsroom 2025](https://www.tinderpressroom.com/2025-06-17-Tinder-Launches-Double-Date-The-New-Way-to-Make-Connections-with-Your-Bestie), [Tinder Newsroom 2026](https://www.tinderpressroom.com/2026-09-30-Tinder-Launches-Group-Hangouts-A-New,-Low-Pressure-Way-to-Meet-Someone-New-With-Your-Friends)). The crew chat line ("liked Crew Orbit for the crew") is how the crew holds whoever tapped accountable. A one-time explainer replaces a confirm dialog ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/): do not confirm routine actions).
6. **"Liking as" is one persistent identity chip, not a choice made on every card.** The header shows "Liking as ⬚ Crew Nebula ▾", in the style of LinkedIn's "comment as" selector. The picker appears only when more than one identity is valid.
7. **The Blend moment is a sibling of the 1:1 MatchMoment, kept deliberately quieter.** It uses the same glass sheet and Success haptic. Two emblems meet, nobody is named, and the copy says "N + M people · nobody's named yet". The primary action ("Open the Blend") is the screen's one gradient action.
8. **Reveal is the one confirmed action.** It cannot be undone (SERVER: "Never un-revealed by anything later (D-10)", `mobile-crews.ts`). The confirm names the scope ("to the 7 people in this Blend, and nobody else"), names who will be shown, and states who stays private. Its button describes the outcome: "Reveal 3 of us", not "OK" ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/), [Apple HIG alerts](https://developers.apple.com/design/human-interface-guidelines/components/presentation/alerts/)).
9. **Consent is given at the join button, and is as easy to withdraw.** The fixed sentence sits directly above "Join Crew Nebula". The "Keep me anonymous" toggle is visible on the same screen and stays one tap away in crew settings. That covers DPDP's "clear affirmative action" and its rule that withdrawal be "comparable to the ease with which such consent was given" ([DPDP s.6 via dpdprules.org](https://dpdprules.org/act/6)).
10. **Arrival is self-declared, per night, and names nobody on the lock screen.** There is no automatic "arrived" ping and no "not here yet" alert. Snap's arrival alerts are off by default ([Snap Help](https://help.snapchat.com/hc/en-us/articles/42602082747924-How-do-I-use-Arrival-Notifications)), and Apple makes the friend approve recurring alerts ([Apple Support](https://support.apple.com/guide/iphone/notified-friends-change-location-iph843dd79b6/ios)). Life360's "No Show" alert is the pattern to avoid ([Life360](https://support.life360.com/hc/en-us/articles/34106208950935-No-Show-Alerts)).
11. **Silence is a feature.** Declines, lapses, keep-me-anonymous changes and report outcomes are never announced. The server already makes all of these indistinguishable, and the UI must not undo that (for example by showing "pending" lists or "declined" states). The lesson comes from Tinder Social in 2016, which outed who was on Tinder by default ([TechCrunch 2016](https://techcrunch.com/2016/04/27/oops-tinders-new-friend-finding-feature-tinder-social-is-outing-which-of-your-friends-use-the-app)).
12. **Server finding for the parent agent (§0.1):** a freshly made crew that is still waiting on invites looks likely to be dissolved by the 15-minute sweeper. The "forming" state the design needs may not survive on the server.

### 0.1 Server finding: a new crew of one is in the sweeper's dissolve set (read, not driven)

- `createCrew` writes **only the creator** as a member, and everyone else as an invite (`lib/crews/crews.ts`, the `members: { create: { user_id: creatorId … } }` and `invites: { create: … }` block).
- `repairCrews()` selects **every** standing crew with fewer than `CREW.MIN_MEMBERS` (2) active members, with no exemption for open invites, and calls `settleCrew`. `settleCrew` dissolves anything below 2 and **deletes its invites** (`lib/crews/sweep.ts:164-180`, `:84`, `:108`).
- `repairCrews` runs on the chat-lifecycle sweeper, at boot and every `SWEEP_INTERVAL_MS = 15 min` (`lib/chat-lifecycle.ts:23`, `:158`).
- The sweeper comment says its purpose is to repair what "an erasure … or a suspension" left behind (`chat-lifecycle.ts:150-156`). It does not mention new crews, so this looks unintended.
- **Effect if confirmed:** "Make a crew → invite 3 friends → they accept tomorrow" would fail. Within about 15 minutes the crew would be gone and the invites deleted. When a friend tapped the invite, they would get the generic 404.
- **What to do:** drive it on staging (make a crew with invites, wait one sweep, read `crews.dissolved_at`). Then either exempt crews that have open invites and are younger than the 14-day lapse, or define a "forming" state. This brief designs a "Waiting for your friends" state in §7.2 either way.

---

## 1. Landscape: products that put friends or groups together (2024–26)

### 1.1 Tinder Double Date (launched 17 June 2025)

| Aspect | What it does | Source |
|---|---|---|
| Entry | "Tap the Double Date icon on your Discovery or Messages screen", then "Invite up to 3 friends to pair up with" | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date) |
| Pairs | "you can create up to 3 pairs of friends and swipe on other pairs of friends" | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date) |
| How a pair is shown | "shown to you in Discovery the same way individual profiles are, with the difference being both people from the Double Date are shown side-by-side" | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date) |
| Matching | "Only One Like Per Pair Needed To Kick Things Off… a group chat is created" | [Tinder Newsroom](https://www.tinderpressroom.com/2025-06-17-Tinder-Launches-Double-Date-The-New-Way-to-Make-Connections-with-Your-Bestie) |
| After a match | "a chat is opened between the 4 of you… You may also swipe right on an individual in your matched pair and open an individual DM" | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date) |
| Settings | A "Double Date" section in Settings lets you highlight pairs or "hide all Double Date profiles completely" | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date) |
| Consent norm | "always seek consent from your Double Date friend before you discuss any private details (including contact information)" | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date) |
| Shared liability | "Any violations of our policies can result in action being taken against 1 or both accounts in a Double Date" | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date) |
| Data | Women "three times more likely to Like a pair"; "35% more messages"; nearly 15% of users new or reactivated | [Tinder Newsroom](https://www.tinderpressroom.com/2025-06-17-Tinder-Launches-Double-Date-The-New-Way-to-Make-Connections-with-Your-Bestie) |
| Later placement | It became one of three "Modes" (For You, Double Date, College) that users toggle between | [Fortune 2025-09-11](https://fortune.com/2025/09/11/tinder-gen-z-modes-feature-double-dating-college/) |
| Invite acceptance UI, match-screen art | **UNVERIFIED.** No primary source describes the invitee's accept screen or the pair "It's a Match" artwork | — |

**Takeaways for Blend'n:** a pair or group is a single card in the existing deck, shown alongside people rather than in a separate world. One like speaks for the group. A match opens a group chat, and 1:1 conversation is a secondary path inside it. Tinder leaves the consent to share private details to a written norm. Blend'n turns that norm into a product rule (reveal consent at join, plus a per-person override).

### 1.2 Tinder Group Hangouts (launched 30 September 2026)

- "One person starts a group, picks an activity, and invites at least two friends to join… at least three members before the profile becomes visible" ([Tinder Newsroom 2026](https://www.tinderpressroom.com/2026-09-30-Tinder-Launches-Group-Hangouts-A-New,-Low-Pressure-Way-to-Meet-Someone-New-With-Your-Friends)). Groups hold up to 15 people ([TechCrunch](https://techcrunch.com/2026/09/30/tinder-adapts-to-a-social-irl-dating-future-with-group-hangouts-feature/)).
- The help centre puts the requirement as "Once your Group has 3 members and a dedicated activity and time". Groups are shown "the same way individual and Double Date profiles are, with the difference being multiple people from the Group are shown". The entry point is the "Groups Hangouts pill button on your Discovery screen" ([Tinder Help](https://www.help.tinder.com/hc/en-us/articles/46714669437453-Group-Hangouts)).
- Matching works when "someone from each group sends a Like to the other group, a shared group chat opens for everyone." Members "choose whether to join" and can "leave a conversation without leaving their friend group" and "block or report someone" ([Tinder Newsroom 2026](https://www.tinderpressroom.com/2026-09-30-Tinder-Launches-Group-Hangouts-A-New,-Low-Pressure-Way-to-Meet-Someone-New-With-Your-Friends)).
- Data: "40% of Group Hangouts invitations were accepted", and "women are 2.2x more likely to Like a group profile than a traditional one-to-one profile" ([Tinder Newsroom 2026](https://www.tinderpressroom.com/2026-09-30-Tinder-Launches-Group-Hangouts-A-New,-Low-Pressure-Way-to-Meet-Someone-New-With-Your-Friends)).

**Takeaways:** the market moved from pairs to groups within 15 months, and both launches kept the same three primitives: any one member's like counts, a match opens a shared chat, and anyone can leave the chat without leaving the group. Blend'n's version is stricter. Strangers see counts rather than faces, and presence rather than plans, which is the real difference from Tinder's people-forward group cards. A 40% invite acceptance rate means most invites go unanswered, so the create flow has to work well in the "waiting for friends" state (and §0.1 has to be fixed).

### 1.3 Tinder Social (2016): the cautionary tale

- It was tested in Australia in April 2016 and **on by default**: "Tinder Social presents a list of all your Facebook friends and lets you view their dating profiles", which outed people who were "using Tinder… on the side". Tinder's first fix was an opt-out in Settings ([TechCrunch 2016-04](https://techcrunch.com/2016/04/27/oops-tinders-new-friend-finding-feature-tinder-social-is-outing-which-of-your-friends-use-the-app)).
- The global launch was **opt-in** and "oriented around going out _tonight_". "If one member of both parties matches with the other group, all members of each group see that as a match" ([TechCrunch 2016-07](https://techcrunch.com/2016/07/21/tinder-social-helping-friend-groups-plan-their-night-out-launches-globally/)).

**Takeaway:** any group feature built on a friend graph can expose that friend graph. Blend'n's server already guards this. Invites go only to your own friends, a decline is silent, `invited` "says nothing about anybody", and a 404 is the same whoever it is about (SERVER: `mobile-crews.ts` invites/join). The design must not add "pending", "seen" or "declined" states that leak the same information again.

### 1.4 Bumble BFF Groups (Geneva)

- Bumble acquired Geneva, a group-chat community app, in 2024. The relaunched BFF is "built on Geneva", and Geneva members were upgraded "without losing any of their groups or messages" ([TechCrunch 2025-09-18](https://techcrunch.com/2025/09/18/bumble-bffs-revamped-app-is-here-focusing-on-friend-groups-and-community-building)).
- **Create:** "Open the Discover page and tap 'Groups' at the top"; "Add a Group name and description, choose a theme color, and upload a photo or icon"; choose visibility and approval; choose a location; "Select up to two topic tags". New groups come with four rooms: Intros, Chat Room, Events and Recs ([BFF Help: Creating a Group](https://support.bumblebff.com/hc/en-us/articles/33945550399005-Creating-a-Group)).
- **Invite:** by link, from contacts, or by DM. "Group owners can reset invite links" ([BFF Help: Inviting](https://support.bumblebff.com/hc/en-us/articles/33948277788957-Inviting-someone-to-a-Group), [BFF Help: Joining](https://support.bumblebff.com/hc/en-us/articles/30291683710109-Discovering-and-joining-Groups)).
- **Profile exposure:** "When you join a publicly visible Group, it will appear on your profile by default" ([BFF Help: Joining](https://support.bumblebff.com/hc/en-us/articles/30291683710109-Discovering-and-joining-Groups)).
- **Report a group:** "Tap the '…' next to the Group's name → Report Group". Message reports also reach the group admin, who "will be able to review the reported content… and remove or ban the member" ([BFF Help: Reporting](https://support.bumblebff.com/hc/en-us/articles/30291512779677-Reporting-Groups-and-Group-activity)).
- **Blocks inside groups:** "If you're both members of the same Group, you'll still be able to see each other's posts and participate in Chat and Post rooms" ([BFF Help: Blocking](https://support.bumblebff.com/hc/en-us/articles/29878320830109-Blocking-someone)).
- **Delete is irreversible and needs friction:** "Type in the Group's name… and press Delete". Transfer: "There is no way to undo this action" ([BFF Help: Transfer/delete](https://support.bumblebff.com/hc/en-us/articles/34659283992861-Transferring-or-deleting-a-Group)).

**Takeaways:** BFF's create form (name, description, theme colour, icon, ≤2 tags) is the closest template for crew creation. Blend'n generates the emblem rather than asking for a photo, which removes a moderation surface and a face. BFF shows groups on your profile by default. Blend'n should **not** show crews on profiles that strangers see, because a crew is counts-only outside itself. BFF leaves blocked people visible to each other inside a group, and Blend'n is stricter: a block hides the pair everywhere crews meet (SERVER: `GET /events/{id}/crews` excludes any crew with a member kept apart from you; `GET /blends` drops blocked pairs). Typing the group's name to confirm deletion is a pattern worth keeping in reserve; Blend'n has no delete action today (an owner who leaves hands the crew on).

### 1.5 Partiful (co-hosts, guest-list privacy, Mutuals, Crush)

- Co-hosts: "Up to 20 users can be cohosts on an event" ([Partiful Help](https://partiful.zendesk.com/hc/en-us/articles/29936098702619-How-many-cohosts-can-I-have-on-an-event)).
- Host privacy controls include "Anonymize guest list for your guests", "Hide guest count for your guests" and "Change Crush settings" ([Partiful Help: Event Settings](https://help.partiful.com/hc/en-us/articles/28895223149979-What-features-are-available-to-change-in-my-Event-Settings)).
- "Your Partiful Mutuals are everyone you've attended a party with before!" ([Partiful Help: Mutuals](https://partiful.zendesk.com/hc/en-us/articles/27354915523483-What-are-Mutuals)).
- **Crush:** "They won't be told who crushed them, but the notification will show the last event you attended together. If they crush you back, you'll both get a notification that it's a match… You can crush up to 10 people per month" ([Partiful Help: Crush](https://partiful.zendesk.com/hc/en-us/articles/45086026179483-How-does-Crush-work)). A k-anonymity guard: "If it's a small event and too obvious, we won't reveal the event" ([Partiful Help](https://partiful.zendesk.com/hc/en-us/articles/45361534853019-How-can-I-tell-which-event-my-Crush-attended)). It rolled out from late December 2025 ([Global Dating Insights](https://www.globaldatinginsights.com/featured/partifuls-crush-tool-brings-dating-style-matching-to-event-app/)).

**Takeaways:** hosts switching off a social layer per event is normal (Partiful's Crush settings are the analogue of "Hosts can switch crews off"). Partiful's "too obvious, we won't reveal" is the principle behind Blend'n's "names nobody" pushes, and behind "Here now" never falling below 2 (SERVER: `presentCount` "always ≥ 2"). Partiful does tell a person that "someone crushed" them. Blend'n tells nobody (SERVER: `youLiked` is "Never whether they liked you"), and the design must keep it that way.

### 1.6 Timeleft (dinners for six strangers)

- "you take a short personality quiz, get matched into a group of four to six, and find out the restaurant the day before" ([Timeleft blog](https://timeleft.com/blog/dinner-with-strangers/)). Group details arrive before the dinner ([Timeleft blog](https://timeleft.com/blog/dinner-with-strangers/)). Afterwards, "guests often swap numbers or connect in the app" ([Timeleft blog](https://timeleft.com/blog/dinner-with-strangers/)).
- A design critique found the wait anxious and proposed a "Group Preview" showing "basic profiles (first names, interests, a short bio)" ([Pratt IXD critique](https://ixd.prattsi.org/2025/02/design-critique-timeleft-app/)).

**Takeaway:** strangers want a small amount of structured preview before committing (interests, a bio). A crew card's tags, intent and bio are that preview, and that is enough for a like. Names and photos come later, and only through consent.

### 1.7 Hinge

- Hinge has no group matching. "Friend's Take" (launched globally 15 July 2026) lets friends answer prompts on your profile ([Yahoo/Hinge coverage](https://www.yahoo.com/lifestyle/articles/hinge-newest-feature-just-made-210738216.html), [Swipestats](https://www.swipestats.io/blog/hinge-for-friends)). That is friends vouching for you, not friends matching together. **UNVERIFIED** beyond these secondary sources.

### 1.8 IRL (shut down 2023): why

- It described itself as "the leading group messaging social network that brings people together through events and shared experiences". It shut down after the board found "95% of the users were 'automated or from bots'" ([Fortune 2023](https://fortune.com/2023/06/25/irl-shutting-down-startup-admits-95-percent-of-messaging-app-users-were-fake)). The SEC later charged the founder with fraud (via [Fortune](https://fortune.com/2023/06/25/irl-shutting-down-startup-admits-95-percent-of-messaging-app-users-were-fake) and [search summary](https://tech.co/news/unicorn-irl-95-users-fake-shuts-down)).

**Takeaway:** in a group or event product, counts only mean something if they are real. Blend'n's "here now" counts come from GPS check-ins of at least two members (SERVER). The copy should say so plainly: "here now" rather than "online" or "active".

### 1.9 WhatsApp groups and Communities; Discord

- **Control over who can add you:** "Everyone", "My Contacts" or "My Contacts Except". Otherwise you get a private invite, and "You'll have three days to accept the invite before it expires" ([WhatsApp Blog](https://blog.whatsapp.com/new-privacy-settings-for-groups)).
- **Safety overview (2025):** shown when a non-contact adds you to a group. It says whether "the person who added you is one of your contacts, and if any member of the group is a contact of yours", and "Notifications from the chat will be muted until you mark that you want to remain" ([TechCrunch 2025-08-05](https://techcrunch.com/2025/08/05/whatsapp-adds-new-features-to-protect-against-scams)). It launched in India ([Business Today](https://www.businesstoday.in/technology/news/story/whatsapp-launches-safety-overview-in-india-to-protect-users-from-group-chat-scams-bans-68-million-accounts-487990-2025-08-06)).
- **Silent exit:** "only notify the admin when you leave a group chat" ([WhatsApp on X](https://x.com/WhatsApp/status/1557400660450185216)).
- **Communities** got their own tab: "the new communities tab at the top of their chats on Android and at the bottom on iOS" ([search summary of TechCrunch 2022-11-03](https://techcrunch.com/2022/11/03/whatsapp-officially-launches-its-new-discussion-group-feature-communities)).
- **Discord** servers without a custom icon "show the server name abbreviated to its initials on a colored background" ([Moda](https://moda.app/resources/sizes/discord-server-icon); secondary source). Discord's own safety page covers reporting messages and profiles and blocking users ([Discord Safety](https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord)).

**Takeaways:** WhatsApp's safety overview is the model for a Blend room's first-open card, which shows who is in it, where it was made, when it closes, and offers Leave as a first-class action. Blend'n invites last 14 days, which is generous next to WhatsApp's 3. That is fine for crews, which are persistent, but the invite row should show "Expires in N days" so a stale invite does not look alive.

### 1.10 Snapchat groups and Snap Map presence

- **Group profiles** show "Bitmoji group pose… The top three active users in the group chat will be in the front three spots… up to 10 avatars" ([Snap Help](https://help.snapchat.com/hc/en-us/articles/7012374553876-How-do-Group-Profiles-on-Snapchat-work)). Up to 201 people per group ([Snap Help](https://help.snapchat.com/hc/en-gb/articles/7012337635604-How-do-I-add-Snapchat-friends-to-a-Group-Chat)).
- **Arrival Notifications (expanded 9 Feb 2026):** "When you arrive at a place you've set up notifications for, your friend gets a push notification and a notice in Chat". The options are "One time", which expires after 24 hours, and "Every time". Notifications "default to off". Ghost Mode disables them ([Snap Help](https://help.snapchat.com/hc/en-us/articles/42602082747924-How-do-I-use-Arrival-Notifications), [Snap Newsroom](https://newsroom.snap.com/expanded-arrival-notifications-snap-map)).

**Takeaways:** an arrival ping is sent to a chat as well as a push. Blend'n does the same with a crew-chat line plus a push (SERVER: `/crews/{id}/here`). Snapchat's group identity is a collage of people, which is right inside a crew and wrong on a card strangers see.

### 1.11 Life360 and Apple Find My

- **Life360 Check in:** "The Check in button instantly sends your location to every member in a Circle" ([Life360 Help](https://support.life360.com/hc/en-us/articles/23053645947031-Check-In-With-My-Circle)).
- **Bubbles:** "Your Circle members will only see that you're in a Bubble". "Any Circle member can burst a Bubble… This will reveal the Bubble creator's location and notify the entire Circle" ([Life360 Help](https://support.life360.com/hc/en-us/articles/23053376685463-Life360-Bubbles-Feature)). Any member can act for the group, and everyone is told.
- **No Show Alerts** "notify you when a Circle member does not arrive at a saved Place by the expected time" ([Life360 Help](https://support.life360.com/hc/en-us/articles/34106208950935-No-Show-Alerts), [TechCrunch 2025-08-20](https://techcrunch.com/2025/08/20/life360-adds-a-new-no-show-notification-to-its-app)).
- **Find My:** "Your friend gets an alert after you set the notification. If you set a recurring notification, your friend must approve it before it's set" ([Apple Support](https://support.apple.com/guide/iphone/notified-friends-change-location-iph843dd79b6/ios)).

**Takeaways:** "We're here" is Life360's Check in, kept to the crew, with no place in the push and only one per night. Never build "Ana isn't here yet". That would turn a night out into supervision, which is the opposite of Blend'n's tone. Find My's approval rule is a reason never to let anyone subscribe to another member's arrival.

### 1.12 Zenly (closed February 2023), BeReal, Locket

- **Zenly Bump:** "Bump with the people around you to add them as a friend… or to send a notification to your mutual friends so they know you're hanging out together. If you Bump while in a gathering, the flame on the map will get turnt uppppp" ([Zenly Help](https://zenlyapp.zendesk.com/hc/en-us/articles/5370902963345--BUMP)). It shut down because "the current economic climate made it difficult… to sustain its operations" ([Zenly Help](https://zenlyapp.zendesk.com/hc/en-us/articles/11085576435857-why-is-zenly-shutting-down)), during Snap's cost cuts ([Life360 blog](https://www.life360.com/blog/what-happened-to-zenly)).
- **Zenly Ghost Mode:** "Your friends don't receive notifications when ghosted", while "friends, who you've chosen to blur, will see the blurred icon" ([Zenly Help](https://zenlyapp.zendesk.com/hc/en-us/articles/5332032631057-Do-My-Friends-Know-If-I-ve-Enabled-Ghost-Mode), [Zenly Help](https://zenlyapp.zendesk.com/hc/en-us/articles/5333128490513-The-Downlow-on-Ghost-Mode)).
- **BeReal reciprocity:** "You can't view your friends' BeReal… until you've posted yours. Fair's fair!" Late posts are marked: "your friends will know you posted late" ([BeReal Help](https://help.bereal.com/hc/en-us/articles/7350386715165--Time-to-BeReal)).
- **Locket's cap as intimacy:** "To keep things friendly, you can only have 20 friends on the app" ([App Store](https://apps.apple.com/us/app/locket-widget/id1600525061)).

**Takeaways:**
- Zenly's gathering flame shows togetherness without naming anyone. The crew card's "here now" ticks do the same job.
- Ghost Mode set the norm that privacy toggles are not announced. "Keep me anonymous" should never post a line in the crew chat.
- BeReal's "fair's fair" is how Blend'n should explain why crews are visible only to people who are checked in.
- Locket and the server comment on `CREW.MAX_MEMBERS` ("small enough that a crew card is not a mob in a room of 80") let the copy present the cap of 12 as a feature rather than a limit.

### 1.13 Spotify Blend: a word clash and a cover-art precedent

- "Blend is a shared playlist… You can invite up to 10 friends in a Blend… Tap Invite, and send the link… Leave Blend" ([Spotify Support](https://support.spotify.com/us/article/blend/)). "When the friend accepts, Spotify will create the cover art, track lists and display your taste match score" ([TechCrunch 2021](https://techcrunch.com/2021/08/31/spotify-officially-launches-blend-allowing-friends-to-match-their-musical-tastes-and-make-playlists-together/)).
- Covers are generated. Secondary sources report overlapping circles, one per member, in random colours, with moderators saying the colours carry no meaning ([followeran](https://followeran.com/en/blog/what-is-spotify-blend/)). **UNVERIFIED** against a Spotify primary source: the community thread returns 403.
- **Name clash:** Spotify's "Blend" means a playlist made by mutual consent. Blend'n's "Blend" means a mutual match between a crew and a crew or a person. Inside the Blend'n brand the word works. Users in India who know Spotify may expect a shared, persistent thing, but a Blend'n Blend closes 12 hours after the event. **PROPOSAL:** always show the closing time on the Blend ("closes 4 am"). Trademark risk: **UNVERIFIED**, and outside this brief.

### 1.14 Patterns pulled out of all of the above

| Need | Pattern that works | Who does it | Blend'n move (PROPOSAL) |
|---|---|---|---|
| Making the group | Name, short description, colour or icon, ≤2 tags, invite friends | BFF ([help](https://support.bumblebff.com/hc/en-us/articles/33945550399005-Creating-a-Group)), Tinder Hangouts (activity) | Name, bio, intent, ≤3 tags, "Room for one more", friends. Emblem generated, not uploaded |
| Inviting and accepting | Accept or ignore, time-limited | WhatsApp 3 days ([blog](https://blog.whatsapp.com/new-privacy-settings-for-groups)), Spotify link ([support](https://support.spotify.com/us/article/blend/)) | Friends-only push and in-app row, 14-day lapse shown, consent sentence on the accept button |
| Consent copy | A norm, written in help pages | Tinder ("always seek consent", [help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date)) | A rule at the join button, with a personal override |
| Group identity | Initials on colour; generated art; photo collage | Discord ([Moda](https://moda.app/resources/sizes/discord-server-icon)), Spotify, Snapchat ([help](https://help.snapchat.com/hc/en-us/articles/7012374553876-How-do-Group-Profiles-on-Snapchat-work)) | A generated squircle emblem outside the crew; a first-name and photo collage inside |
| Group card for strangers | Side-by-side faces | Tinder ([help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date)) | Counts, tags, intent, bio; never faces |
| Group-to-group match | One like per side; group chat opens | Tinder 2016/2025/2026 | Same, plus pseudonyms and a frozen roster |
| Chat entry | Straight into a group chat; 1:1 DM optional | Tinder | Straight into the Blend room, with a context card first |
| Presence | Gathering flame; "in a Bubble" | Zenly ([help](https://zenlyapp.zendesk.com/hc/en-us/articles/5370902963345--BUMP)), Life360 ([help](https://support.life360.com/hc/en-us/articles/23053376685463-Life360-Bubbles-Feature)) | "3 of 5 here", ticks, no names to strangers |
| Arrival ping | Opt-in, one-time, push plus chat notice | Snap ([help](https://help.snapchat.com/hc/en-us/articles/42602082747924-How-do-I-use-Arrival-Notifications)), Life360 Check in | "We're here": explicit, once per night, names nobody, mutable |

---

## 2. Anonymous group identity: making a crew card attractive with no faces

### 2.1 References

| Reference | Mechanism | Licence and notes | Use for Blend'n |
|---|---|---|---|
| **Boring Avatars** | "generates custom, SVG-based avatars from any username and color palette". Variants: marble, beam, pixel, sunset, ring, bauhaus. Deterministic | MIT ([GitHub](https://github.com/boringdesigners/boring-avatars)) | **Bauhaus and ring** show that a two-colour geometric seed can look designed rather than generic |
| **DiceBear** | "61 avatar styles"; "Same Seed, Same Avatar. Every Time." "privacy-focused" | Core MIT; styles vary (several CC0, some CC BY 4.0) ([dicebear.com](https://www.dicebear.com/)) | **Shapes, rings, glass** styles; avoid character styles, which read as people |
| **Facehash** | "generates unique, friendly faces from any string"; blink animation | MIT ([facehash.dev](https://www.facehash.dev/)) | **Avoid.** Faces mean people, and a crew must never read as a person |
| **Vercel avatar** | A SHA-1 of the name sets a hue; a second colour from the triad | ([GitHub](https://github.com/vercel/avatar)) | Shows hue-from-hash, but a raw hue wheel collides with the brand colours, so use a curated palette |
| **GitHub identicons** | "simple 5×5 'pixel' sprites that are generated using a hash of the user's ID" (2013) | ([GitHub blog](https://github.blog/news-insights/company-news/identicons/)) | Mirror symmetry makes random output read as a mark. Steal the symmetry |
| **Discord default icon** | Initials on colour | ([Moda](https://moda.app/resources/sizes/discord-server-icon)) | Not this. Initials would change when the crew is renamed, and they look like a placeholder |
| **Spotify Blend covers** | Generated; circles per member (secondary) | ([followeran](https://followeran.com/en/blog/what-is-spotify-blend/)) | Encode **count** as marks, and colour as identity only |
| **Apple Invites** | "a curated collection of images representing different occasions"; emoji backgrounds; "Attendees control how their details show up to others" | ([Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)) | Curated, occasion-themed art beats free upload for a social object. The emblem motif set should feel like nightlife "occasions" |
| **Blend'n pseudonym discs** | A round gradient disc with an animal emoji, seeded from the pseudonym. Two of its eight pairs are violet and collide with brand violet | `audit-social.md:41`, `:165`, `:313` | The crew palette must not overlap the pseudonym palette or the brand violet and orange |

### 2.2 Constraints the emblem must satisfy

1. **It must never stand for a person.** No creatures, no faces, no initials of members. A person is round and a crew is a squircle (Banter's "a room is a square cover", `audit-social.md:174`).
2. **It must never encode membership.** It is seeded from the server's random `emblemSeed` (SERVER: `crews.ts:315`), not from member ids, pseudonyms or the name. It does not change on rename or on joins and leaves.
3. **It must not use the brand gradient.** The direction reserves the orange-to-violet gradient for the mark and one primary action. The emblem palette excludes the hue bands around #F05423 and #925DA9 (PROPOSAL: about ±18° of hue on each) and the pseudonym violets.
4. **It must stay legible at 24 pt**, the size of a chat-line chip and the "Liking as" chip.
5. **It must sit calmly on dark solid content.** Its colours are slightly desaturated in the base state, and nothing loops or glows (the owner rejected glows and halos: `audit-discovery.md:25`).

### 2.3 Recommended emblem system (PROPOSAL)

**Anatomy, back to front:**

1. **Ground:** a squircle (continuous corners at about 28% of size), filled with one of **12 crew palettes**. Each palette is a deep base plus one mid tone, tuned for dark mode, all at a similar luminance so no crew looks "louder" than another. Palette = `seed[0] % 12`.
2. **Figure:** one of **12 night motifs**, drawn as flat geometry in the mid tone and an ink tone, with optional mirror symmetry in the GitHub-identicon style. Motif = `seed[1] % 12`, with rotation and offset quantised from `seed[2..3]`. A suggested set, each a nightlife "occasion" in the spirit of Apple Invites: crescent, sunburst, tile floor (dance-floor), stacked rings, tide lines, star cluster, bolt, arch, chevrons, orbit, spark grid, wave stack.
3. **Count ring (cards only):** N small ticks around or under the squircle, where N = crew size (2–12). Filled ticks = `presentCount`. The ticks are identical, so they never point at a person.
4. **No text on the emblem.** The name sits beside it, in Satoshi.

**Sizes:** 24 (chat-line chip, "Liking as" chip), 40 (list row), 56 (Banter row, matching Banter's 56 pt avatar, `audit-social.md:209`), 96 (crew card), 160 (crew detail hero, Blend moment).

**Motion ("alive through change, calm at rest"):** when `presentCount` rises, one tick fills (about 220 ms, standard ease) and the matching number changes. Nothing else moves. With Reduce Motion on, the change is instant. There are no loops, no shimmer and no breathing. Durations and easing: align to the token set in `.context/redesign/research-haptics-motion.md` §4.1.

**Rendering:** on the device, from the seed, with `react-native-svg` (already a client dependency according to the project memory). Write the motif set in-house, about 12 small SVG path builders, so it owns a look. DiceBear CC0 styles and Boring Avatars (MIT) are allowed as starting points if time is short ([DiceBear](https://www.dicebear.com/), [Boring Avatars](https://github.com/boringdesigners/boring-avatars)).

**Accessibility label:** "Crew Nebula emblem" (decorative). The card's label carries the counts: "Crew Nebula, crew of 5, 3 here now, Techno heads, Gig goers, out for friendship".

### 2.4 The "revealed collage" (PROPOSAL)

This appears **only inside a Blend, after a reveal**, and only to that Blend's people (SERVER: reveal is "Shown to this Blend's people… and to nobody else").

- **Side header:** the crew emblem at 56 pt, with a horizontal **photo stack** to its right of 36 pt rounded tiles, one per revealed person (first name and one photo, per SERVER). The stack ends in a **count tile**, "+1 private", which is a neutral squircle and **not** that person's creature. The header reads "**3 revealed · 1 keeps it private**".
- **People list inside the Blend:** revealed people show photo, first name and a small pseudonym caption ("was Velvet Otter"). Private people keep their creature disc and pseudonym, with no lock icon (a lock implies blocked or forbidden). The order is revealed first, then private, both alphabetical. Order must not encode who revealed.
- **The transition:** when a reveal lands, each revealed person's creature disc cross-fades to their photo in place (about 280 ms, staggered by 40 ms, no flip and no confetti). The header count updates. Haptic: a single light impact for the revealer; nothing for others.
- **A solo person in a crew↔person Blend:** "reveals only themselves" (SERVER). Their side shows one tile or one creature, with no count line.

---

## 3. Consent for group reveal and "Keep me anonymous"

### 3.1 What the sources say

- **Shared items create conflicts between the people in them.** "Items in social media such as photos may be co-owned by multiple users, i.e., the sharing decisions of the ones who upload them have the potential to harm the privacy of the others" (Such, Porter, Preibusch, Joinson, CHI 2017, [Bath](https://researchportal.bath.ac.uk/en/publications/photo-privacy-conflicts-in-social-media-a-large-scale-empirical-s/)). The same study found "an all-or-nothing approach seems to dominate conflict resolution" ([KCL portal](https://kclpure.kcl.ac.uk/portal/en/publications/photo-privacy-conflicts-in-social-media-a-large-scale-empirical-s/), via search summary).
  - **Blend'n's model avoids all-or-nothing.** Any member can trigger the reveal (collective action), but each person's "Keep me anonymous" always wins for that person (individual veto over their own data). This is the strictest-preference-per-person rule from the multiparty-privacy literature, and the UI has to make it visible: "N revealed · M keep it private".
- **Valid consent (India).** It must be "free, specific, informed, unconditional and unambiguous with a clear affirmative action", and withdrawal must be possible "with the ease of doing so being comparable to the ease with which such consent was given" (DPDP Act 2023, s.6(1) and s.6(4), [dpdprules.org](https://dpdprules.org/act/6)). The same site says these subsections take effect from **13 May 2027** ([dpdprules.org](https://dpdprules.org/act/6); **UNVERIFIED** against the gazette). Designing to them now is cheap.
- **Irreversible actions:** "Use a confirmation dialog before committing to actions with serious consequences"; "Be specific… Do not ask Are you sure"; "provide response options that summarize what will happen"; "Do not use confirmation dialogs for routine actions" ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)). Apple: include a "Cancel"; the destructive style is for a destructive action "people didn't deliberately choose" ([Apple HIG Alerts](https://developers.apple.com/design/human-interface-guidelines/components/presentation/alerts/)).
- **Privacy toggles are not announced** (Zenly: "Your friends don't receive notifications when ghosted", [Zenly Help](https://zenlyapp.zendesk.com/hc/en-us/articles/5332032631057-Do-My-Friends-Know-If-I-ve-Enabled-Ghost-Mode)).
- **Attendees control how they appear** (Apple Invites, [Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)).

### 3.2 Rules for Blend'n (PROPOSAL)

1. **Consent at the button.** The fixed sentence, *"Anyone in this crew can reveal the crew — your name and photos — to people you match with,"* sits directly above the primary button "Join Crew Nebula", in body size and not in fine print. Pressing the button is the affirmative act (SERVER requires `revealConsent: true`). Nothing is pre-checked.
2. **The override is on the same screen.** A switch below the button reads: **"Keep me anonymous even when my crew reveals"**, default off, with the helper "Your crew still sees you. Matches won't." Changing it later is one tap in crew settings, which meets the "comparable ease" rule.
3. **Say the scope every time.** Reveal copy always names the audience in numbers ("the 7 people in this Blend") and with a negative ("and nobody else: not the Room, not your DMs").
4. **Say the permanence once, plainly.** "You can't undo a reveal." The keep-me-anonymous helper adds: "Applies from now on. It doesn't take back a reveal that already happened" (SERVER: "a crew reveal already made is not undone (D-10)").
5. **Show that the action is collective, not who withheld.** After a reveal, the crew chat gets a line "Ana revealed the crew in the Blend with Crew Orbit" (**PROPOSAL; needs server**, because the spec only writes a line for likes). The reveal result shows counts, "3 revealed · 1 keeps it private", and never says which crewmate kept private inside the crew chat.
6. **Don't use the destructive style for reveal.** The person chose it deliberately (Apple HIG). Use the screen's one gradient primary for "Reveal 3 of us", with "Not now" as the cancel.
7. **The consent copy says "photos" and the reveal shows "one photo"** (SERVER: "by first name and one photo"). The consent is broader than what is used, which is legally safe. Keep the fixed sentence as ruled, and make the reveal confirm say "first name and one photo" so nobody overestimates what gets shown.

---

## 4. Group arrival without group check-in

### 4.1 Principles (with sources)

- **Self-declared, never inferred for others.** Life360's Check in is an explicit tap that "instantly sends your location to every member" ([Life360](https://support.life360.com/hc/en-us/articles/23053645947031-Check-In-With-My-Circle)). Blend'n's server forbids proxies: "nobody else is checked in by this — each member checks in by their own GPS" (SERVER: `/crews/{id}/here`).
- **Togetherness without names.** Zenly's gathering flame grew as people bumped ([Zenly Help](https://zenlyapp.zendesk.com/hc/en-us/articles/5370902963345--BUMP)). Life360's Bubble shows status without location ([Life360](https://support.life360.com/hc/en-us/articles/23053376685463-Life360-Bubbles-Feature)).
- **Reciprocity gate.** BeReal: "Fair's fair!" ([BeReal Help](https://help.bereal.com/hc/en-us/articles/7350386715165--Time-to-BeReal)). Blend'n: crews are visible only to people checked in, and "We're here" needs you checked in.
- **One ping, opt-in, expiring.** Snap: "One time", which expires after 24 hours, off by default ([Snap Help](https://help.snapchat.com/hc/en-us/articles/42602082747924-How-do-I-use-Arrival-Notifications)). Blend'n: once per person per crew per night; muting the crew chat suppresses the push, and a phone with notifications off gets the bell line instead (SERVER).
- **No absence alerts.** Life360 No Show ([Life360](https://support.life360.com/hc/en-us/articles/34106208950935-No-Show-Alerts)) is the pattern to avoid.

### 4.2 The arrival moments (PROPOSAL)

| Moment | What you see | Notes |
|---|---|---|
| You check in (your own GPS) and you're in ≥1 crew | The check-in success sheet adds one row per crew: ⬚ **Crew Nebula** "Tell them you're here" [We're here]. Secondary, not the gradient primary | Never automatic. Lists only crews that are not muted |
| You tap **We're here** | The row turns into "Told Nebula · 3 others" (`notified`). The crew chat gets the line "**Ana is here** · Bassment, Indiranagar" (the crew chat names people and places; the push does not) | `repeated: true` → "Already told them tonight" |
| A crewmate gets the push | **"Someone from your crew is here 👋"**, with no name and no place (ruling). Tapping opens the crew chat at the line | The lock screen stays safe |
| You're the first one there | In the Room: "**You're the first from Nebula.** Your crew shows up here once two of you are in." | Mirrors SERVER: a crew is "here" at ≥2 |
| Two or more are in | Room strip: ⬚ **Nebula · 2 of 5 here**; ticks fill; "Crews here" unlocks for your crew | Counts only, even for members (`myCrews.presentCount`) |
| Someone arrives after a Blend was made | Crew chat: "Nebula blended with Crew Orbit at 11:40. The Blend is for the 3 of you who were here then." | SERVER: "somebody who arrives later is not in it" |

**Don't build:** "Waiting for Rohit…", "Rohit hasn't arrived", per-member presence dots for crewmates (the server exposes counts only), or any "check in your friend" affordance.

---

## 5. Where crews live in navigation

### 5.1 How others placed groups

| Product | Placement | Source |
|---|---|---|
| Tinder Double Date | An icon on the **Discovery or Messages** screen; a mode toggle; its own Settings section | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date), [Fortune](https://fortune.com/2025/09/11/tinder-gen-z-modes-feature-double-dating-college/) |
| Tinder Group Hangouts | A **pill at the top of Discovery** ("top of the home screen") | [Tinder Help](https://www.help.tinder.com/hc/en-us/articles/46714669437453-Group-Hangouts), [Newsroom](https://www.tinderpressroom.com/2026-09-30-Tinder-Launches-Group-Hangouts-A-New,-Low-Pressure-Way-to-Meet-Someone-New-With-Your-Friends) |
| Bumble BFF | "Open the **Discover** page and tap 'Groups' at the top" | [BFF Help](https://support.bumblebff.com/hc/en-us/articles/33945550399005-Creating-a-Group) |
| WhatsApp Communities | Its **own tab** (top on Android, bottom on iOS) | [TechCrunch 2022](https://techcrunch.com/2022/11/03/whatsapp-officially-launches-its-new-discussion-group-feature-communities) |
| Snapchat | Groups inside **Chat**; group profile from the group Bitmoji | [Snap Help](https://help.snapchat.com/hc/en-us/articles/7012374553876-How-do-Group-Profiles-on-Snapchat-work) |
| Spotify Blend | **Your Library / Made for You** | [Spotify Support](https://support.spotify.com/us/article/blend/) |

The pattern: groups get a tab only when they are the product (WhatsApp Communities). When groups are a way of doing the main job, they live on the surfaces of that job (Tinder, BFF, Spotify).

### 5.2 Blend'n placement (PROPOSAL)

| Job | Surface | Why |
|---|---|---|
| Manage my crews, make one, see invites | **Me › Crews**, a row beside Friends ("Crews · 2" with an invite dot) | Crews are made from friends, and Friends already lives under Me (`audit-social.md:553-641`) |
| Crew chat | **Banter**, a square-cover row with the 56 pt emblem | "One inbox, not tabs… a room is a square cover" (`audit-social.md:174`) |
| Crew invite received | **Banter**, a request row ("Ana invited you to Crew Nebula") **plus** the dot on Me › Crews | The inbox is where people look for asks; Banter already holds asks (`audit-core-loop.md:836`) |
| Blend rooms | **Banter › Live now** while the event runs, then a normal row until it closes, with "closes 4 am" on the row | They are event-scoped rooms, and Banter already lifts checked-in rooms into "Live now" (`audit-social.md:174`) |
| Crews here, liking, We're here, "Open to joining a crew tonight" | **The Blend'n Room overlay**, as a "Crews here" section | Visible only when checked in, and the Room is where checked-in life happens (`audit-core-loop.md:126`) |
| The crew settings toggle for hosts | Dashboard (host), not mobile | Ruling: hosts switch crews off per event |

**Not:** a sixth tab, a Crews pill on the Pulse, or crews on a profile strangers can see.

---

## 6. Safety in group matching

### 6.1 Sources

- Tinder holds pairs jointly responsible and tells users to report "inappropriate behavior in-app or IRL". Reports are confidential: "details of who submitted the report or the contents of the report will not be disclosed" ([Tinder Help: Double Date](https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date), [Tinder Help: Reporting](https://www.help.tinder.com/hc/en-us/articles/115003822043-Reporting-profiles-and-content)).
- Group Hangouts: leave the conversation without leaving the group; block or report anyone ([Newsroom 2026](https://www.tinderpressroom.com/2026-09-30-Tinder-Launches-Group-Hangouts-A-New,-Low-Pressure-Way-to-Meet-Someone-New-With-Your-Friends)).
- BFF: report a group from the "…" next to its name; admins are notified of message reports ([BFF Help](https://support.bumblebff.com/hc/en-us/articles/30291512779677-Reporting-Groups-and-Group-activity)).
- WhatsApp's safety overview before entering a group of strangers, with notifications muted until you stay ([TechCrunch](https://techcrunch.com/2025/08/05/whatsapp-adds-new-features-to-protect-against-scams)); silent leave ([WhatsApp](https://x.com/WhatsApp/status/1557400660450185216)).
- Apple Invites: attendees can "leave or report an event at any time" ([Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)).

### 6.2 What the server already guarantees (SERVER, `mobile-crews.ts`)

- A solo person meets only crews of **6 or fewer**: "one stranger facing a big group is a bad night and a safety concern" (`lib/constants.ts`, `CREW.MAX_SOLO_MATCH`).
- Crews out for dating are hidden from a solo person who isn't.
- A block or closed conversation with **any** member of either side hides the crew, refuses the like, and takes the pair out of an open Blend while the Blend continues for everyone else.
- A crew card (name or bio) can be reported (`spam`, `offensive`, `contact_details`, `impersonation`, `other`), and "Nobody in the crew is told". A moderator can hide the crew, which removes its card, likes and Blends, or dissolve it.
- Names and bios are folded, moderated and checked for contact details on write.
- Anyone may leave a Blend; anyone may leave a crew; an owner's removal sticks.

### 6.3 Design (PROPOSAL)

1. **Crew card "⋯" → Report this crew's name or bio.** The sheet lists the five reasons and an optional note (≤500). The confirmation reads "Thanks — we'll take a look. Nobody in the crew is told."
2. **Blend room first-open card**, modelled on WhatsApp's safety overview: "**Blend with Crew Orbit** · 7 people · made at Bassment · closes 4 am. Everyone here is on tonight's names until they reveal. [Got it] [Leave]". The room's "⋯" offers Leave Blend, Report someone, Block someone, and Mute.
3. **Block from inside a Blend** uses the existing person safety sheet. Copy: "You won't see each other in this Blend, or in crews tonight. The Blend carries on for everyone else."
4. **Leaving a Blend is silent.** No "left" line, as with WhatsApp's silent exit. **UNVERIFIED:** whether `POST /chat/groups/{id}/leave` writes a system line. Check before drawing.
5. **Leaving a crew:** confirm with "Leave Crew Nebula? You'll leave its chat too. If you run it, it passes to whoever's been in longest. If only one person would be left, the crew ends." Buttons: "Leave crew" / "Cancel".
6. **Removing a member (owner):** "Remove Rohit from Nebula? Only you can invite them back." Buttons: "Remove" (destructive style; Apple HIG treats this as a consequence the person may not have weighed) / "Cancel".
7. **Never show** that a crew was reported or hidden to a stranger, and never "X declined".

---

## 7. Screen-by-screen recommendations

Copy is a draft for Claude Design. Fixed strings from the rulings are in **bold quotes**. Glass is used only for the control layer (top bars, docks, sheets); content surfaces are solid. Icons are outlined. The only gradient fill on each screen is the single primary action (and the mark).

### 7.1 Crews home: Me › Crews

**List of my crews** (rows on solid content):
- Row: emblem (40) · **Crew Nebula** · "5 of you · Techno heads, Gig goers" · chevron. When any of the crew is checked in somewhere tonight: "2 here now at Bassment" in the accent text colour. **UNVERIFIED** that the server exposes this outside the Room; `myCrews` is per-event, so the row may only be able to show it from the Room.
- Section "**Invites**" above the list when there are any: emblem · "**Ana** invited you to **Crew Nebula**" · "5 people · expires in 9 days" · [Join] [Not now].
- The primary action at the foot (gradient, one per screen): **Make a crew**.
- Cap hints sit under the button in a caption, shown only when you are close to a cap: "You run 2 of 3 crews."

**Empty state:** "**Crews are for the friends you go out with.** Make one, and when two of you check in somewhere, other crews there can find you — as a crew, not as names." [Make a crew]. If you have no friends yet: "Crews are made from friends. Add a friend first." [Add friends] (goes to `friends/add`).

### 7.2 Create flow: four short steps in one sheet stack (PROPOSAL)

The structure follows BFF's create form ([BFF Help](https://support.bumblebff.com/hc/en-us/articles/33945550399005-Creating-a-Group)), reordered so that people come first. Your friends are the reason to make a crew.

**Step 1: Who's in?**
- Title: "Who do you go out with?"
- Multi-select list of friends (round photos; you are named to your friends). The counter reads "3 picked · up to 11".
- Helper: "Only your friends can be in your crews. They'll get an invite; nobody's added without saying yes."
- Button: "Next".
- Edge: no friends → the "Add a friend first" state.

**Step 2: Name it**
- Live emblem preview at 96, generated now. It does not change with the name, and a "Shuffle" text button rerolls it once the seed becomes client-proposable (**UNVERIFIED**: the seed is server-generated today, so for v1 the preview appears after creation, or a placeholder is shown).
- Field: **Name**, 2–32 characters, with the counter visible after 24. Placeholder: "Crew Nebula, Thursday Quiz Lot…"
- Field: **Bio**, optional, ≤140. Placeholder: "What a night with you looks like."
- Server refusals show inline under the field, using the server's sentence verbatim (SERVER: "A refusal is 400 with a sentence saying which").
- Button: "Next".

**Step 3: What's the vibe?**
- **Intent** (multi): Friendship · Networking · Dating · Just here (SERVER enum). Helper under Dating: "Crews out for dating only meet people who are too."
- **Tags**, up to 3 chips from the curated ten (Quiz team, Run club, Techno heads, Office gang, Birthday crew, Foodies, Board gamers, Gig goers, Book club, Dance floor). The counter reads "2 of 3".
- **Room for one more**, a switch. Helper: "A person who's out on their own can find you, if your crew is six or fewer."
- Button: "Next".

**Step 4: The deal** (the consent screen; it is also the join screen for invitees, §7.3)
- Emblem (96) + name + "You and 3 friends".
- Body, the fixed sentence: **"Anyone in this crew can reveal the crew — your name and photos — to people you match with."**
- A second line, smaller: "Reveals happen in a Blend, to the people in it, and nobody else."
- Switch: **"Keep me anonymous even when my crew reveals"** (off). Helper: "Your crew still sees you. Matches won't."
- Primary (gradient): **"Make Crew Nebula"**.
- Caption: "Invites last 14 days."

**After create: "Waiting for your friends"** (the state §0.1 puts at risk)
- Crew detail shows the emblem, "Just you so far", and "3 invites out · they last 14 days". It never says who has seen or declined an invite (SERVER: invites are skipped "without a word").
- Crew chat is open but empty, with the line: "Say hi — your friends see this when they join."

**Caps** (SERVER: 409 own ≥3 or in ≥10; 429 after 3 crews in 24 h). These are shown **before** step 1, so nobody fills in a form only to be refused:
- Own 3: "You run 3 crews — that's the most. Leave one (it passes to whoever's been in longest) to start another."
- In 10: "You're in 10 crews — that's the most. Leave one to make another."
- 3 made today: "That's 3 new crews today. You can make another tomorrow."

### 7.3 Invite received

**Push:** the server sends one push that "names nobody" (SERVER: "each gets a push that names nobody"). Suggested copy, **PROPOSAL**: "You've been invited to a crew 👀". Tapping it opens the invite.

**Banter request row and Me › Crews invite row:** emblem (40) · "**Ana** invited you to **Crew Nebula**" · "5 people · Techno heads · expires in 9 days".

**Invite screen** (a sheet):
- Emblem (96) · **Crew Nebula** · bio · tags · intent.
- "**Ana** invited you." The inviter is named because they are your friend (SERVER: `invitedBy`, first name).
- "5 people are in it." **Show members' names? UNVERIFIED.** `CrewInviteSchema` carries no member list, so the invitee sees counts until they join. That is good, since it avoids revealing the friend graph, and the design should keep it.
- The Step 4 consent block, word for word, with the anonymity switch.
- Primary (gradient): **"Join Crew Nebula"**. Secondary text button: "Not now".
- Under "Not now", a caption: "Nobody's told. You won't be asked again for 30 days."

**Edge states:**
- The invite isn't open any more (lapsed, inviter left, no longer friends, a block, or the crew dissolved). All of these are the same 404 (SERVER), so there is one neutral copy: "**This invite isn't open any more.**" [OK]. Never say "lapsed" or "they left", because the server deliberately doesn't say which.
- Full: "Crew Nebula is full — 12 is the most."
- You're in 10: "You're in 10 crews — leave one to join this."
- Under 18 or not finished setting up (SERVER 403, verbatim): "**Crews are for people 18 and over who have finished setting up.**"

### 7.4 Crew detail and settings

**Header (glass control bar over a solid hero):** emblem 160 · **Crew Nebula** · bio · tags · intent · "Room for one more" pill if on.

**Members (inside a crew, "people see first name + one photo"):** a row of round photos with first names, the owner marked "runs it". No presence and no "last seen".

**Actions:**
- Primary: **Open chat** (the crew chat in Banter).
- "Invite friends" (any member can invite their own friends; SERVER). The picker hides people already in the crew. Afterwards: "Invited 2." The count is what you asked for, which "says nothing about anybody" (SERVER).
- Overflow (owner): Edit name, bio, tags, intent, Room for one more; Remove someone.
- **Your settings** section:
  - Switch **"Keep me anonymous even when my crew reveals"**. Helper: "From now on. It doesn't undo a reveal that already happened." No crew-chat line is posted on change (the Zenly norm).
  - Mute crew chat (also mutes "We're here" pushes, per SERVER).
  - **Leave crew** (confirm per §6.3).

**Edit:** same fields and limits as create. Renaming does **not** change the emblem.

**Dissolved:** if the crew drops below 2 active members, it dissolves and "its chat archives and closes" (SERVER). The Banter row shows "Crew Nebula ended" and the chat is read-only (**UNVERIFIED** whether archived crew chats stay readable). Copy: "**Crew Nebula has ended.** There weren't two of you left."

**Hidden by a moderator:** members keep it, but there is "no card, likes or Blends" (SERVER). **UNVERIFIED** whether members are told. If they aren't, the Room should still say something true: "Nebula isn't showing to other crews right now." Ask the owner (§8).

### 7.5 Arrival flow at an event

See §4.2. Visually:
- **Check-in success sheet (glass):** existing content, plus "Your crews" with one row per crew: emblem (24) · "Nebula" · [We're here] as an outlined secondary button.
- **Room strip** (top of the Crews section): emblem (24) · "Nebula · 2 of 5 here" · ticks. Tapping it opens the crew chat. With several crews here, the strips stack, at most 3, then "+1".

### 7.6 "Crews here" in the Room

**Gate:** visible only to people checked in (SERVER 403 `NOT_CHECKED_IN`). Copy when not checked in: "Check in to see the crews here."

**Section header (glass control row):**
- "**Crews here** · 6"
- **Liking as** chip: emblem (24) + "Nebula ▾". It appears only when you have a valid crew identity here (≥2 of your crew checked in). The menu lists each eligible crew and, if you're opted in to "Open to joining a crew tonight", "Just me". The choice is remembered for the night, as LinkedIn's identity selector "remembers your last selection for that session" ([third-party guide](https://connectsafely.ai/articles/how-to-comment-as-company-page-linkedin-guide-2026); secondary).

**Crew card anatomy** (solid surface, 16 pt padding, sorted "Most here first" per SERVER):

```
┌──────────────────────────────────────────┐
│ [emblem 96]  Crew Orbit                  │
│  ▪▪▪▫▫       Crew of 5 · 3 here now      │
│              "Quiz nights, then dancing."│
│  Quiz team · Dance floor     Friendship  │
│                         [ Like for Nebula ] │
└──────────────────────────────────────────┘
```

- Emblem with a tick row (size = ticks, here now = filled).
- **Name** (Satoshi, title weight).
- "**Crew of N · M here now**" (SERVER `size`, `presentCount`).
- Bio, up to 2 lines.
- Tags as outlined chips; intent as a text label.
- Like button: outlined by default; after liking it becomes a filled neutral "Liked for Nebula ✓" (SERVER `youLiked`: your side liked). It never shows whether they liked you.
- "⋯" → Report this crew's name or bio.
- **No** names, pseudonyms, photos, creature discs or "friends in this crew" hints. Ever.

**The like-as decision** (PROPOSAL):

| Your state | Button reads | Picker? |
|---|---|---|
| In one crew here (≥2 in), not opted in solo | "Like for Nebula" | No |
| In two crews here | "Like for Nebula" (as the chip says) | Chip menu |
| Opted in solo, no crew here | "Like" (as you) | No |
| In a crew here **and** opted in solo | "Like for Nebula" / "Like as you" (per chip) | Chip menu |
| Your crew here has only you checked in | Not shown; strip says "Your crew shows up here once two of you are in." | — |

**First like for a crew: one-time explainer (not a confirm):** "**Likes count for the whole crew.** Anyone here from Nebula can like a crew for all of you. Nebula's chat shows who liked." [Got it]. Afterwards the crew chat gets the SERVER line "liked Crew Orbit for the crew".

**Empty and edge states:**
- No crews here: "No other crews here yet. When they check in, they'll show up here."
- Host switched crews off (`crewsEnabled: false`): "**The host has switched crews off for this event.**" Hide the section otherwise; no strip and no We're here.
- A crew disappears between load and like (it left, or was hidden, or a block arose): the SERVER returns 404. Copy: "That crew isn't here any more." Remove the card quietly.

### 7.7 "Open to joining a crew tonight" (a solo person)

- **Where:** in the Room, in the Crews section, when you're checked in and have no crew here. A switch row reads: "**Open to joining a crew tonight**". Helper: "Crews here with room for one more can see you're open and like you, as a crew. Just for tonight." **UNVERIFIED**, because exactly what crews see of an opted-in solo person (a badge on the normal person card?) isn't in the spec. Confirm with the server before drawing.
- **What you then see:** only crews with "Room for one more", of **6 or fewer**, and not out for dating unless you are too (SERVER). A caption sets expectations: "Showing crews of six or fewer — a big group meeting one person isn't much fun for anyone."
- **Turning it off** stops new crew likes reaching you (**UNVERIFIED**: whether an existing like persists; the server says "for the night you said it").
- **A crew liking you:** you are never told (SERVER `youLiked` semantics; the Partiful Crush pattern minus the "someone crushed you" ping). It becomes visible only as a Blend.

### 7.8 The Blend moment, and how it differs from a 1:1 Match

The 1:1 `MatchMoment` today is a "glass sheet over orbs", with a Success haptic and "Say hi" (accent) / "Keep looking" (`audit-social.md:760`, `:1278`).

| | 1:1 Match | **Blend** (PROPOSAL) |
|---|---|---|
| Who sees it | The two people | The person who made the mutual like sees the sheet; everyone else in the room gets the push **"It's a Blend"** (names nobody) and sees the sheet on next open |
| Art | Two creature orbs | **Two emblems** (160) slide in from the edges and stop overlapping by about 12% (the Spotify-circles echo). Nothing else animates |
| Headline | It's a match | **"It's a Blend"** |
| Line 2 | Names or pseudonyms | "**Nebula + Orbit** · 3 + 4 people" (crew ↔ crew), or "**Nebula + one more**" (crew ↔ person) |
| Line 3 | — | "Nobody's named yet. Everyone's on tonight's names until your crew chooses to reveal." |
| Shared facets (optional) | — | "You both: Dance floor · Friendship", computed from the public card fields only |
| Primary (gradient) | Say hi | **Open the Blend** |
| Secondary | Keep looking | Later |
| Haptic | Success | Success, once, for the person on screen only |
| Must not show | — | Who liked first ("Nothing anywhere says who liked first", SERVER), who on your side tapped, any name or photo |

### 7.9 The Blend room

- **Banter row:** a split-diagonal square cover made of both emblems (still a square, because it's a room) · "**Nebula + Orbit**" · "Bassment · closes 4 am" · unread.
- **Room header (glass):** both emblems at 24 · "Nebula + Orbit" · "closes 4 am" (SERVER: event end + 12 h, or earlier if a side dissolves or is hidden) · "⋯".
- **First open:** the context card from §6.3.
- **People sheet:** two sections, one per side. Each section has its emblem, "3 revealed · 1 keeps it private" (or "Nobody revealed yet"), and the list of people (photo with first name if revealed, otherwise creature and pseudonym). Your own row is marked "you".
- **Composer:** messages appear under tonight's pseudonym for unrevealed people and under first name for revealed people (SERVER `BlendPerson.name`).
- **1:1 from a Blend** (Tinder lets you "open an individual DM"): **UNVERIFIED** whether Blend'n allows it. It isn't in the crew spec. Open question §8.
- **Closing:** at T-60 minutes, a quiet line in the room: "This Blend closes at 4 am." After close, **UNVERIFIED** whether the room is readable or gone.

### 7.10 The reveal flow

**Entry:** in the Blend room header, a text button **"Reveal Nebula"**. It is visible to any member of your crew in this Blend. In a crew ↔ person Blend, the solo person sees "Reveal me".

**Confirm sheet (glass, the one confirmed action):**
- Title: "**Reveal Nebula to this Blend?**"
- Body: "**Ana, Rohit and Meera** will be shown by first name and one photo to the **7 people in this Blend** — and nobody else. Not the Room, not your DMs, not another Blend."
- If anyone keeps it private: "**1 of you keeps it private** and stays on tonight's name." Do **not** name them. The revealer knows the crew but shouldn't be told who opted out. **UNVERIFIED** whether the client can compute this; the server reads the flag at reveal time. If not, say "Anyone who's chosen to stay anonymous won't be shown."
- "You can't undo a reveal."
- Primary (gradient): "**Reveal 3 of us**" (or "Reveal us" if the count isn't known before the call). Secondary: "Not now".
- Haptic on confirm: Medium impact.

**After:**
- Toast in the Blend: "**3 revealed · 1 keeps it private**" (from the SERVER response `revealed`, `keptPrivate`).
- The §2.4 collage transition runs in the people sheet and header.
- Crew chat line (PROPOSAL, needs server): "Ana revealed Nebula in the Blend with Orbit."
- The reveal button becomes "Revealed" (disabled), because a second reveal adds only people who weren't eligible before. **UNVERIFIED** whether a second tap reveals newly arrived members (the server says the reveal covers members "checked in now and in this Blend's room"; latecomers aren't in the room, so probably not).

**Display rule everywhere:** "**N revealed · M keep it private**" per side, with M = 0 rendered as "N revealed". Grammar: "1 keeps it private" vs "2 keep it private".

### 7.11 Error and edge states: one table

| State | Trigger (SERVER) | Copy (PROPOSAL) | Surface |
|---|---|---|---|
| Own 3 crews | 409 on create | "You run 3 crews — that's the most. Leave one (it passes to whoever's been in longest) to start another." | Me › Crews, before step 1 |
| In 10 crews | 409 on create or join | "You're in 10 crews — that's the most. Leave one to join this." | Invite screen, create |
| 3 made in 24 h | 429 | "That's 3 new crews today. You can make another tomorrow." | Create |
| Crew full | 409 on join (12) | "Crew Nebula is full — 12 is the most." | Invite screen |
| Invites would pass 12 | 409 on invite | "Nebula has 12 with invites still open. Room frees up when someone answers or an invite runs out." | Invite picker |
| Invite not open | 404 on join (lapsed, inviter gone, unfriended, blocked, dissolved) | "This invite isn't open any more." | Invite screen |
| Decline | DELETE join | "Done. Nobody's told." | Toast |
| Name or bio refused | 400 + sentence | The server's sentence, inline | Create or edit |
| Under 18 or onboarding | 403 | "Crews are for people 18 and over who have finished setting up." | Any crew entry |
| Not checked in | 403 `NOT_CHECKED_IN` | "Check in to see the crews here." | Room |
| Only you from your crew | `presentCount` < 2 | "You're the first from Nebula. Your crew shows up here once two of you are in." | Room strip |
| Crews off | `crewsEnabled: false`; 403 on here or like | "The host has switched crews off for this event." | Room; We're here row hidden |
| We're here twice | `repeated: true` | "Already told them tonight." | Check-in sheet |
| We're here while not checked in | 403 | "Check in first — then you can tell your crew." | Crew chat shortcut |
| Like target gone | 404 | "That crew isn't here any more." | Room |
| Blend you arrived too late for | Not in room | "This Blend is for the 3 of you who were here at 11:40." | Crew chat |
| Blend closed | `closesAt` passed | "This Blend closed at 4 am." | Banter row and room |
| Blend closed early | A side dissolved or was hidden | "This Blend has closed." (no reason) | Banter row and room |
| Crew dissolved | <2 active | "Crew Nebula has ended. There weren't two of you left." | Banter, Me › Crews |
| Crew hidden by moderator | hide | **UNVERIFIED** whether members are told; see §8 | — |
| Removed by owner | DELETE member | "You're no longer in Crew Nebula." (No reason; only the owner can re-invite) | Banter row |
| Owner left | hand-over | Crew chat line: "Rohit runs Nebula now." (**UNVERIFIED** that the server writes it) | Crew chat |
| A suspended member | not active | Disappears from every crew surface (SERVER §6 Safety) | — |
| Block across a Blend | pair removed | No notice; the people sheet just updates | Blend |
| Forming crew dissolved by the sweeper | §0.1 | Should not exist. If it does: "Crew Nebula has ended." (wrong, so fix the server) | — |

---

## 8. Open questions for the owner (to settle before drawing)

1. **§0.1:** is dissolving a crew of one with open invites intended? If it is, the create flow has to collect at least one accept before the crew exists, which is a different design.
2. **What do crews see of a solo person who is "Open to joining a crew tonight"?** A badge on the normal person card, or a separate list? The spec defines the solo → crew direction but not the crew → solo card.
3. **Should the crew chat get a line when someone reveals the crew?** (Recommended for collective accountability; needs a server line.)
4. **Is a moderator-hidden crew told?** Silence keeps reporters safe, but members will wonder why nothing matches.
5. **1:1 DMs out of a Blend:** allowed (Tinder allows them), or only after reveal through the normal reveal or request path?
6. **Do archived crew chats and closed Blends stay readable?**
7. **Can the emblem seed be shuffled at creation** (client proposes, server validates), or is it fixed?
8. **Spotify "Blend":** is the name clash acceptable? (It's on-brand, but the closing time must always be visible.)

---

## Sources

**Group and friends-together products**
- Tinder Help, Double Date: https://www.help.tinder.com/hc/en-us/articles/34712866048653-Double-Date
- Tinder Help, Group Hangouts: https://www.help.tinder.com/hc/en-us/articles/46714669437453-Group-Hangouts
- Tinder Help, Reporting profiles and content: https://www.help.tinder.com/hc/en-us/articles/115003822043-Reporting-profiles-and-content
- Tinder Newsroom, Double Date (2025-06-17): https://www.tinderpressroom.com/2025-06-17-Tinder-Launches-Double-Date-The-New-Way-to-Make-Connections-with-Your-Bestie
- Tinder Newsroom, Group Hangouts (2026-09-30): https://www.tinderpressroom.com/2026-09-30-Tinder-Launches-Group-Hangouts-A-New,-Low-Pressure-Way-to-Meet-Someone-New-With-Your-Friends
- TechCrunch, Double Date (2025-06-16): https://techcrunch.com/2025/06/16/you-can-now-arrange-a-double-date-with-friends-on-tinder
- TechCrunch, Group Hangouts (2026-09-30): https://techcrunch.com/2026/09/30/tinder-adapts-to-a-social-irl-dating-future-with-group-hangouts-feature/
- Complex, Group Hangouts: https://www.complex.com/life/a/treyalston/tinder-group-dating
- Global Dating Insights, Group Hangouts: https://www.globaldatinginsights.com/from-the-web/tinder-group-hangouts-group-dating/
- Fortune, Tinder Modes (2025-09-11): https://fortune.com/2025/09/11/tinder-gen-z-modes-feature-double-dating-college/
- The Tab, Double Date explained: https://thetab.com/2025/07/18/tinder-just-launched-a-double-date-feature-where-you-can-each-bring-your-bestie-along
- Newsweek, Double Date: https://www.newsweek.com/tinder-double-date-feature-gen-z-2085069
- TechCrunch, Tinder Social outing friends (2016-04-27): https://techcrunch.com/2016/04/27/oops-tinders-new-friend-finding-feature-tinder-social-is-outing-which-of-your-friends-use-the-app
- TechCrunch, Tinder Social global launch (2016-07-21): https://techcrunch.com/2016/07/21/tinder-social-helping-friend-groups-plan-their-night-out-launches-globally/
- TechCrunch, Bumble BFF relaunch (2025-09-18): https://techcrunch.com/2025/09/18/bumble-bffs-revamped-app-is-here-focusing-on-friend-groups-and-community-building
- BFF Help, Creating a Group: https://support.bumblebff.com/hc/en-us/articles/33945550399005-Creating-a-Group
- BFF Help, Inviting someone to a Group: https://support.bumblebff.com/hc/en-us/articles/33948277788957-Inviting-someone-to-a-Group
- BFF Help, Discovering and joining Groups: https://support.bumblebff.com/hc/en-us/articles/30291683710109-Discovering-and-joining-Groups
- BFF Help, Reporting Groups: https://support.bumblebff.com/hc/en-us/articles/30291512779677-Reporting-Groups-and-Group-activity
- BFF Help, Blocking someone: https://support.bumblebff.com/hc/en-us/articles/29878320830109-Blocking-someone
- BFF Help, Transferring or deleting a Group: https://support.bumblebff.com/hc/en-us/articles/34659283992861-Transferring-or-deleting-a-Group
- Partiful Help, Event Settings: https://help.partiful.com/hc/en-us/articles/28895223149979-What-features-are-available-to-change-in-my-Event-Settings
- Partiful Help, cohosts: https://partiful.zendesk.com/hc/en-us/articles/29936098702619-How-many-cohosts-can-I-have-on-an-event
- Partiful Help, Mutuals: https://partiful.zendesk.com/hc/en-us/articles/27354915523483-What-are-Mutuals
- Partiful Help, Crush: https://partiful.zendesk.com/hc/en-us/articles/45086026179483-How-does-Crush-work
- Partiful Help, Crush event hint: https://partiful.zendesk.com/hc/en-us/articles/45361534853019-How-can-I-tell-which-event-my-Crush-attended
- Global Dating Insights, Partiful Crush: https://www.globaldatinginsights.com/featured/partifuls-crush-tool-brings-dating-style-matching-to-event-app/
- Timeleft blog: https://timeleft.com/blog/dinner-with-strangers/
- Pratt IXD, Timeleft critique: https://ixd.prattsi.org/2025/02/design-critique-timeleft-app/
- Yahoo, Hinge Friend's Take: https://www.yahoo.com/lifestyle/articles/hinge-newest-feature-just-made-210738216.html
- Swipestats, Hinge for friends: https://www.swipestats.io/blog/hinge-for-friends
- Fortune, IRL shutdown (2023-06-25): https://fortune.com/2023/06/25/irl-shutting-down-startup-admits-95-percent-of-messaging-app-users-were-fake
- tech.co, IRL: https://tech.co/news/unicorn-irl-95-users-fake-shuts-down
- WhatsApp Blog, group privacy settings: https://blog.whatsapp.com/new-privacy-settings-for-groups
- TechCrunch, WhatsApp safety overview (2025-08-05): https://techcrunch.com/2025/08/05/whatsapp-adds-new-features-to-protect-against-scams
- Business Today, WhatsApp safety overview in India: https://www.businesstoday.in/technology/news/story/whatsapp-launches-safety-overview-in-india-to-protect-users-from-group-chat-scams-bans-68-million-accounts-487990-2025-08-06
- WhatsApp on X, silent leave: https://x.com/WhatsApp/status/1557400660450185216
- TechCrunch, WhatsApp Communities (2022-11-03): https://techcrunch.com/2022/11/03/whatsapp-officially-launches-its-new-discussion-group-feature-communities
- Discord Safety, reporting: https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord
- Moda, Discord server icon: https://moda.app/resources/sizes/discord-server-icon
- Snap Help, Group Profiles: https://help.snapchat.com/hc/en-us/articles/7012374553876-How-do-Group-Profiles-on-Snapchat-work
- Snap Help, group size: https://help.snapchat.com/hc/en-gb/articles/7012337635604-How-do-I-add-Snapchat-friends-to-a-Group-Chat
- Snap Help, Arrival Notifications: https://help.snapchat.com/hc/en-us/articles/42602082747924-How-do-I-use-Arrival-Notifications
- Snap Newsroom, expanded Arrival Notifications (2026-02-09): https://newsroom.snap.com/expanded-arrival-notifications-snap-map

**Presence and arrival**
- Life360 Help, Check In: https://support.life360.com/hc/en-us/articles/23053645947031-Check-In-With-My-Circle
- Life360 Help, Bubbles: https://support.life360.com/hc/en-us/articles/23053376685463-Life360-Bubbles-Feature
- Life360 Help, No Show Alerts: https://support.life360.com/hc/en-us/articles/34106208950935-No-Show-Alerts
- TechCrunch, Life360 No Show (2025-08-20): https://techcrunch.com/2025/08/20/life360-adds-a-new-no-show-notification-to-its-app
- Apple Support, Find My notifications: https://support.apple.com/guide/iphone/notified-friends-change-location-iph843dd79b6/ios
- Zenly Help, Bump: https://zenlyapp.zendesk.com/hc/en-us/articles/5370902963345--BUMP
- Zenly Help, Ghost Mode: https://zenlyapp.zendesk.com/hc/en-us/articles/5333128490513-The-Downlow-on-Ghost-Mode
- Zenly Help, Do friends know about Ghost Mode: https://zenlyapp.zendesk.com/hc/en-us/articles/5332032631057-Do-My-Friends-Know-If-I-ve-Enabled-Ghost-Mode
- Zenly Help, shutdown: https://zenlyapp.zendesk.com/hc/en-us/articles/11085576435857-why-is-zenly-shutting-down
- Life360 blog, what happened to Zenly: https://www.life360.com/blog/what-happened-to-zenly
- BeReal Help, Time to BeReal: https://help.bereal.com/hc/en-us/articles/7350386715165--Time-to-BeReal
- App Store, Locket: https://apps.apple.com/us/app/locket-widget/id1600525061

**Identity, emblems, covers**
- Spotify Support, Blend: https://support.spotify.com/us/article/blend/
- TechCrunch, Spotify Blend (2021-08-31): https://techcrunch.com/2021/08/31/spotify-officially-launches-blend-allowing-friends-to-match-their-musical-tastes-and-make-playlists-together/
- MakeUseOf, Blend with 10: https://www.makeuseof.com/spotify-blend-with-more-friends-musicians/
- followeran, Blend colours (secondary): https://followeran.com/en/blog/what-is-spotify-blend/
- Boring Avatars: https://github.com/boringdesigners/boring-avatars
- DiceBear: https://www.dicebear.com/
- Facehash: https://www.facehash.dev/
- Vercel avatar: https://github.com/vercel/avatar
- GitHub blog, Identicons (2013): https://github.blog/news-insights/company-news/identicons/
- Apple Newsroom, Apple Invites (2025-02): https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/

**Consent, confirmation, identity selection**
- NN/g, Confirmation dialogs: https://www.nngroup.com/articles/confirmation-dialog/
- Apple HIG, Alerts: https://developers.apple.com/design/human-interface-guidelines/components/presentation/alerts/
- DPDP Act 2023 s.6: https://dpdprules.org/act/6
- Such et al., CHI 2017 (Bath portal): https://researchportal.bath.ac.uk/en/publications/photo-privacy-conflicts-in-social-media-a-large-scale-empirical-s/
- Such et al., CHI 2017 (KCL portal): https://kclpure.kcl.ac.uk/portal/en/publications/photo-privacy-conflicts-in-social-media-a-large-scale-empirical-s/
- LinkedIn "comment as" (third-party guide): https://connectsafely.ai/articles/how-to-comment-as-company-page-linkedin-guide-2026

**Blend'n internal (origin/dev and round 1)**
- `lib/openapi/paths/mobile-crews.ts`, `lib/crews/crews.ts`, `lib/crews/sweep.ts`, `lib/chat-lifecycle.ts`, `lib/constants.ts` (`CREW`)
- `.context/redesign/audit-core-loop.md`, `audit-social.md`, `audit-discovery.md`, `research-haptics-motion.md`
