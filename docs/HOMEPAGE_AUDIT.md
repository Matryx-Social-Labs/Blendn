# The Pulse / The Scene / The Grid — design audit

Against the Updates canvas frames, read before any code is written. Figma file
`Zi2KcUzhEcLRdqyit22LdQ`.

| Screen | Frame | Audited |
|---|---|---|
| The Pulse | `1141:4643` | ✅ full structure + screenshot |
| The Scene | `1141:4853` | ✅ screenshot |
| The Grid | `1141:4951` | ✅ screenshot |
| Attendee / profile view | `1141:5163` | ✅ screenshot |
| The Banter | `1141:5247` | ✅ screenshot |
| Match notification | `1141:5389` | ✅ screenshot |
| DM / chat | `1141:5430` | ✅ screenshot |
| Anonymous chatroom | `1141:5498` | ✅ screenshot |
| User profile | `1141:5633` | ⛔ blocked (rate limit) |

Eight of nine read. Only the user profile page is outstanding.

---

## The second identity conflict: the "anonymous chatroom" is not anonymous

Frame `1141:5498` is labelled the anonymous chatroom. It renders **"Julian
Ember"** and **"Sarah Chen"** with photographs, and a system line reading
*"Julian Ember pinned a location for the after-party"*.

This is the same conflict as The Grid, in the room where it matters most —
and it is a *pre-event* room (the header counts down `02:44:12` to the start),
so nobody in it has even arrived yet, let alone chosen to reveal.

`lib/anonymous-names.ts` assigns the pseudonym and `chat_group_members`
carries it. The frame bypasses both.

**Resolution follows D1: reveal-gated.** A revealed member shows their name and
face; everyone else shows their pseudonym. The system line has the same rule —
*"Cosmic Panda pinned a location"* unless that person is revealed.

---

## Three different bottom navigations

| Frame | Nav |
|---|---|
| The Pulse `1141:4643` | 4 links + a raised centre button |
| The Grid `1141:4951` | 5 items, first is a share glyph |
| The Banter / chatroom | **Feed · Explore · Create · Circles · Me** |

Three shapes, and the third names tabs nothing else uses. **One has to win
before any screen is built**, because the nav is the one component every screen
embeds.

Recommendation: take the Banter's five-item shape as the reference — it is the
most fully drawn — but rename to the product's own vocabulary (Pulse, Explore,
Create, Circles, Me), and settle what **Create** does before shipping it.

**"Create" is the open one.** Attendees cannot create events; that is an
organiser action on the dashboard. Either the button is organiser-only, or it
creates something else, or it goes.

---

## More things with no backend

### 9. "PRO MEMBER" — a membership tier

`1141:5163` shows a **PRO MEMBER** badge under the name. No tier, plan, or
subscription exists anywhere in the schema. Reads like monetisation.

### 10. "@blendn_julia" — a username, which contradicts D2

The same frame shows an **@handle**. You have chosen rotatable profile *codes*
specifically so people cannot be searched and found by a stable public name. A
visible @handle is exactly the stable public name a code avoids.

**These cannot both ship.** Recommendation: drop the handle. The code is
private, rotatable, and shared deliberately; a handle is permanent and printed
on the profile.

### 11. "Appreciate" — a second action beside Connect

An unknown verb. Possibly a like, a kudos, or a peer-rating gesture. Note that
`peer_ratings` exists and is **deliberately never surfaced** — the standing
decision is that visible peer ratings are unsafe. If Appreciate is that in a
friendlier coat, it inherits that decision.

### 12. Voice and video calling

`1141:5430` puts a **video-call** and a **phone-call** button in the DM header.
No calling infrastructure exists — no WebRTC, no TURN, no signalling beyond the
chat socket. This is a project, not a button.

### 13. Voice messages

The same composer has a **microphone**. No audio recording, upload, storage, or
moderation path. Note the moderation angle: audio cannot go through the image
check or the text classifier, so it would ship unmoderated.

### 14. Pinned conversations and an EVENT badge

`1141:5247` shows a **Pinned** row with an `EVENT` badge on one entry, mixing
event rooms and DMs in one list. Pinning does not exist. The mixing is right —
both belong in one inbox — but note that event rooms are **not persistent**
while DMs are, so a pinned room can vanish.

### 15. "Mark all read"

Bulk-read across conversations. `unread` tracking exists per conversation; a
bulk endpoint does not.

---

## What is genuinely already built

Worth stating, because it is more than the gaps suggest:

| Design element | Backed by |
|---|---|
| Match notification, "A new spark" | `event_likes` mutual → `private_conversations` |
| "You and X are connected" | the mutual-like flow, already live |
| DM thread, bubbles, timestamps | `private_messages` |
| Read receipts (double tick) | `profiles.read_receipts` |
| "ACTIVE NOW" presence | `profiles.show_online` + socket presence |
| Typing indicator | socket, and it is already reveal-gated |
| Image in a message | `private_messages` media |
| Event room chat + countdown | `chat_groups` / `chat_messages` |
| Unread badges | per-conversation unread |
| Profile: bio, interests, occupation, education, gallery, age | all real columns |

The chat half of this design is largely a re-skin of working features. The
gaps are concentrated in **calling, voice, membership tiers, and the social
graph** — all four of which are new products rather than new screens.

---

## The one that stops everything: The Grid shows real names and faces

The Grid renders four attendee cards — **Julian Ember**, **Elena Vance**,
**Marcus Thorne**, **Sophia Chen** — each with a photograph, a real name, and a
job title (*"Head of Product @ Nexus"*).

That is the opposite of what the server does. `maySeeIdentity` gives you
someone's real name and face when **one** of these is true:

- it is you
- you matched — a mutual like at a shared event
- you are in a conversation with them
- they chose to reveal themselves in a room you were in

**Co-presence is deliberately not enough.** Sharing a room is what lets you send
a message request; it is not consent to be identified. The roster returns
`"Attendee"` and no image, and `GET /users/:userId` does the same — both written
after a real leak where two requests turned a pseudonym into a named person with
a face, for the whole room at once.

So a Grid built as drawn would undo the anonymity work deliberately, at the
exact moment it matters most: right after check-in, to everyone in the room.

**This has to be resolved before The Grid is built.** Three shapes:

| | What the Grid shows | Cost |
|---|---|---|
| **A. Pseudonymous Grid** | pseudonym, blurred/absent photo, work field, shared interests, intents | consistent with the room; the design's visual richness mostly survives — names and faces are the only losses |
| **B. Reveal-gated** | real name+face **only** for people who revealed themselves in this room; pseudonym for everyone else | already supported, mixed-state UI, and most cards will be pseudonymous |
| **C. Grid is public** | as drawn | inverts the identity model; needs its own decision and a privacy-policy change |

The frame `1141:5163` — *"Attendee/profile view based on if there are anonymous
or not, blurred photo or real"* — suggests **B** was the intent. That frame is
one of the six I could not read, so this is inference, not fact.

---

## Things the design shows that have no backend

Listed with what exists today, and what building it would actually mean.

### 1. "12 MUTUAL CONNECTIONS" — no social graph exists

There is no friends, follows, or connections model in the schema. Nothing to
count.

The nearest thing is `event_likes` (mutual like → conversation) and
`private_conversations`. "Mutual connections" in the LinkedIn sense — *people
you both know* — would need a whole new relation, plus a decision about whether
one person's connection list is visible to another.

**Question for you: do we want a social graph at all?** It is a large feature
and it changes what the product is. Right now Blend'n connects people *at an
event*; a connections graph makes it a network that persists between them.

### 2. "CORE VERTICALS" — we store one, the design shows several

Cards show two tags each (*"Spatial Web" + "Cybernetics"*). We have
`profiles.work_field`: **one** slug from a server-owned list of eighteen.

That single field was a deliberate decision — free text was the mistake
`profiles.interests` made, where "Software" and "software engineering" never
matched. Going to multiple is a small change (`work_field` → `work_fields[]`);
going to free text is not, and should not happen.

**Question: multiple work fields, or is one enough with shared interests
carrying the rest?**

### 3. "Consult Solaris" — unknown feature

Bottom of The Grid, under *"Expand Your Circle — Unlock more profiles"*. No
equivalent exists. Reads like either an AI concierge or a paywall.

**Question: what is Solaris?** I have not built anything toward it and do not
want to guess.

### 4. "Expand Your Circle / Unlock more profiles" — a gate with no mechanic

Implies the Grid is limited and something unlocks more. No such limit or unlock
exists. If this is monetisation it needs its own conversation; if it is a
"complete your profile to see more" nudge, that is buildable today.

### 5. "ATTENDING LIVE: Quantum Downstage Lounge" — sub-locations in an event

A person is shown as being at a named area *inside* the event. Events have one
geofence; there is no concept of zones within one.

Buildable — it is a table of named sub-areas plus a check-in refinement — but it
is a real feature, not a display detail.

### 6. "$45" and "Join the Experience" — **there is no price**

The Scene's bottom bar shows a price and a purchase-shaped CTA.

There is **no price column anywhere** in the schema, and you have already said
so directly. This is the second time a price has appeared in a design; the first
was `EventCard.tsx` rendering `price_cents` the server never sends, so every
card silently said "Free".

**Recommendation: drop it.** If ticketing is coming, it is a payments project
with tax, refunds and a provider — not a line on a card.

### 7. "Open Bar / Premium Spirits", "Pro Photo / Digital Gallery" — amenities

Two chips on The Scene. No amenities or perks model. Small to add as a
free-text list on the event; worth confirming it is wanted before the organiser
form grows a field.

### 8. "LIMITED ACCESS" badge — probably capacity, possibly visibility

`events.max_capacity` and `current_capacity` exist, so "limited" can be derived.
But `visibility` (public/private) also exists, and the badge could mean either.

**Assumption unless told otherwise:** it derives from capacity.

### 9. "124+" attendees with an avatar stack

Already filed as **SCRUM-25**. `interestedPreview` returns real photographs to
any caller with no identity gate, and the count comes from *favourites*, not
check-ins — so "attending" is the wrong word for the set it is built from.

---

## The Pulse — mostly buildable, two gaps

| Element | Backed by | Status |
|---|---|---|
| "Search experiences…" | `GET /events/search` | ✅ |
| Featured carousel | `events.is_featured` | ✅ exists |
| Upcoming bento, prev/next | `GET /events` | ✅ |
| Card meta: time, location | `start_time`, `city`, `venue_name` | ✅ |
| Card description | `short_description` | ✅ |
| "Nearby Experiences" | `GET /events?city=` | ✅ |
| Large local card avatar + caption | ? | ⚠️ unclear whose avatar |
| **"Explore the Grid / Launch Map / 24 hidden gems within walking distance"** | — | ⛔ **contradiction** |

### The Grid contradiction

The Pulse contains a card that says:

> **Explore the Grid** — Discover 24 hidden gems within walking distance of your
> current coordinates. **[Launch Map]**

That describes a **map of nearby venues**. You have told me The Grid is the
screen that appears **after check-in**, showing the people in the room — and
frame `1141:4951` confirms that reading.

Those are two different screens with one name. One of them is also the venues
section you said to hold back.

**Question: is the Pulse's "Explore the Grid" the venues map we are deferring?**
If so it should be cut from The Pulse for now rather than shipped as a dead
button.

---

## Check-in: what you asked to remove

> *"remove the rules and etc info while checking in — its not required now"*

Noted. Check-in goes straight to The Grid with no interstitial. The GPS
validation itself is unchanged — that is mandatory for physical events and is
not what is being removed here.

---

## What is missing from the design

For the designer, in the same spirit as the onboarding notes.

1. **Empty states.** Every list is drawn full. The Pulse with no events in your
   city, The Grid with four people instead of 240, The Scene for an event with
   no gallery — none are drawn. This is the failure that produced the original
   full-screen *"No events nearby"*, so it matters.
2. **Loading and error states.** No skeletons, no failed-fetch state.
3. **The check-in moment itself.** The Grid is drawn as the destination; there is
   no design for the transition, for a check-in that fails the geofence, or for
   an event you are near but not inside.
4. **Blocked and reported people** in the Grid. If someone blocks another
   attendee, what does the Grid show?
5. **The ended-event state.** The Scene for an event that has finished, and the
   Grid for a room that has closed.
6. **Two illustrations** still unexported from the onboarding permission screens.

---

## Where this leaves the build

Buildable now, no decisions needed:

- **The Pulse**, minus the "Explore the Grid" card
- **The Scene**, minus price, minus the amenity chips, with the attendee stack
  resolved per SCRUM-25

Blocked on your answers:

- **The Grid** — identity model first, then mutual connections, verticals,
  Solaris, the unlock gate, and sub-locations
- The remaining six screens — blocked on Figma access
