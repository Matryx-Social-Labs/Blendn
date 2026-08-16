# The profile — designer notes

Frames `1141:5163` (attendee) and `1141:5633` (own), on the **Updates** canvas.

Components: `components/profile/ProfileSections.tsx`. Screen: `app/user/[id].tsx`
(rebuilt from scratch — the 748-line version it replaced was a different design).
Fixture harness at `exp+blendn:///__preview-profile`, with a toggle, because the
screen's whole point is that it has two faces.

---

## One screen, three states, none of them decided here

`app/api/mobile/profiles/[userId]` gates on `maySeeIdentity`. The split is not
"show less" — it is a different set of facts:

| | Unrevealed | Revealed | Self |
|---|---|---|---|
| Name | pseudonym | real name, age | ✓ |
| Hero | **blurred derivative** | photos, cycling | ✓ |
| Age, interests, location | ✓ | ✓ | ✓ |
| `work_field` | ✓ | ✓ | ✓ |
| Bio, occupation, education | — | ✓ | ✓ |
| Gallery | — | ✓ | ✓ |
| Email, dating fields | — | — | ✓ |

`work_field` sits **outside** the gate deliberately, and the route says why:

> "Works in design" is an attribute; "Principal Designer at Swiggy" is an address.

So an unrevealed profile is not an empty one. It carries what the grid card
carried, which is what makes the reveal worth something.

The screen re-derives none of this. A missing field is simply not drawn, and
never drawn as a fault — "no bio" and "not allowed to see the bio" are identical
in the payload by design, and inventing a distinction would leak the one the
server withheld.

---

## The blur is a derivative, not a filter

The matched-but-unrevealed state is **"pseudonyms + blurred photos"** — the state
diagram on `private_conversations` has said so from the start.

`profiles.blur_photo` holds a 40px, quality-0.4 copy made by
`createBlurDerivative` and uploaded as its own object. The server sends it
**instead of** `photos`, never alongside.

> **Never blur in the app.** The real URL would already be on the device — in the
> payload and the image cache — so a proxy or devtools undoes it in one step.
> This repo shipped that bug before; `MatchScreen.tsx` still carries the comment
> *"the anonymity was one tap deep"*.

**One still, not the pager.** You cannot tell blurred frames apart, so cycling
them reads as a rendering fault rather than a gallery.

**With no derivative, the generated mark.** `blur_photo` is null for every
existing row, so until people re-upload, unrevealed profiles show the
`pseudonymAvatar` mark — the same colour and creature they have on the grid, in
the match sheet and in the Banter.

### Where blur is *not* used

The Scene's attendee discs stay marks, not blurs. That is not an inconsistency:
there you have **no relationship** with the strangers in the room, and a blurred
face still carries skin tone, hair colour and build. A matched pair have both
opted in. Different trust levels, different answers.

---

## What the frame draws that the product cannot back

| Frame | Status |
|---|---|
| `@blendn_julia` (`1141:5176`) | **No username column.** The accent line carries `work_field • location` instead. |
| "PRO MEMBER" / the "PRO" pill (`1141:5645`) | **No membership tier.** Deferred with subscriptions. |
| **"Appreciate"** (`1141:5246`) | Nothing appreciates a profile. The like that exists is the match mechanic on the grid — a different gesture. A button that does nothing, or silently means "like", is worse than the gap. |
| Occupation as two lines | `profiles.occupation` is one string. Rendered on one line; splitting it is two nullable columns and an onboarding change. |
| Education as two lines | Same. |

---

## Where this departs from the frame, and why

### The action does not float

The frame calls it a "Floating Actions Container". Built that way it collided
with the hero: the hero is `751/390` of the width, so on a 956pt screen it is
847 tall and its name block lands exactly where the pill sits. The first version
needed 100pt of clearance *inside the hero* purely to hold the button off the
name — a whole prop existing to serve the float.

Floating also costs ~100pt of every scroll position, permanently, on a screen
whose entire job is reading.

And it buys nothing here. A floating CTA is right when the decision is urgent —
the Scene's "Blend in" floats because you are standing at the venue and the event
is now. Connecting to a person is considered, which is the whole reason this
screen exists. **The fast path already exists**: the grid card carries a like, so
anyone who does not need to read can act without opening this. Reaching the
bottom of a profile *is* the signal that you read enough.

### The interests bento wraps

The frame absolutely-positions five chips into a fixed 168pt box. That
arrangement only holds for those five strings; real interests are any number of
any length. Same chip, same gaps, same highlight — as a wrapping row.

**The highlighted chip means something.** On the artboard the one gradient chip is
decoration. Driven by the server's already-intersected `sharedInterests`, it
marks an interest you both picked — which turns an accent into the most useful
thing on the screen.

### Measurements kept exactly

Hero `751/390`. Page gutter 12, section gap 64, heading-to-content 24.
Bio at Manrope Regular 16/**26** — 26, not the 24 everything else uses, because
it is the only long-form text here. Occupation is a filled `#141313` card at
radius 32 with p32; education is a bare block with a left hairline at
`rgba(73,71,71,0.1)` and `pl-33`. Keeping that asymmetry is what stops two
adjacent facts reading as a table. Gallery: two columns, gap 16, radius 32, 163pt
cells. Name at Plus Jakarta Bold 60/60, tracking -3. Accent line at Manrope
Medium 16/24, tracking 0.4.

---

## The Connect sheet's copy — a rule, not a string

The composer that sends a message request must name the other person with the
**server-resolved display name** (`person.name`), never a real name the client
assumed. Before a reveal that value *is* the pseudonym; after it, the real name.
One variable, correct in both states, because the server already decided which.

Getting this wrong is not a typo. Writing "Priya will see your name and photo"
on a pseudonymous roster means treating an unrevealed person as having a
knowable real name — the same mistake in prose that the identity gate exists to
prevent in code.

It also has to say what you do **not** get back, or "Connect" reads as a mutual
reveal:

> Cosmic Panda will see your name and photo. You'll still see them as Cosmic
> Panda until they choose to reveal.

The asymmetry is the design — you are making the unsolicited approach, so you
are the one who is accountable — but an asymmetry nobody was told about is a
surprise that lands on the wrong person, after the fact.

## Still open

- **My Profile** (`1141:5633`) is not built yet. Same components; adds the 192pt
  gradient-ringed avatar, an attended-events gallery and a CTA block.
- **The profile tap from the match sheet** is still not wired — it was left out
  deliberately while this screen did not exist.
- **The "PRO" pill** returns with subscriptions.
