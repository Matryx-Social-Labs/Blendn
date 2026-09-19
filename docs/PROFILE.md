# The profile

Two screens, one set of pieces.

| | route | frame |
|---|---|---|
| somebody else's | `app/user/[id].tsx` | `1141:5163` |
| your own | `app/(tabs)/profile.tsx` | `1141:5633` |

**Components:** `components/profile/ProfileSections.tsx`.
**Harness:** `exp+blendn:///preview/profile`.

---

## The Me tab does not render `ProfileSections` directly, on purpose

This section used to say the own-profile half was built and never wired —
`app/(tabs)/profile.tsx` drawing its own hero in `APP_COLORS` while
`ProfileSections.tsx` sat finished a directory away. That has since been
resolved, but not by making the Me tab import `ProfileSections` the way
`app/user/[id].tsx` does.

Instead `app/(tabs)/profile.tsx` was re-themed onto `EMBER` and rebuilt as a
compact **control panel**: avatar and name leading to a "Preview" action,
three stat counts, **Edit profile**, **Settings**. Tapping the identity card
routes to `/user/<own id>`, which renders `ProfileSections` in its `'self'`
mode — the same component the attendee view uses. There is still exactly one
implementation of the full profile layout; the Me tab is a launcher in front
of it, not a second copy of it.

`__tests__/noOrphanComponents.test.ts` still does its job here — it exists
because this app has had the "component built, nothing imports it" mistake
happen four times before, and this is not a fifth: `ProfileSections.tsx` has
its intended importer, reached through a navigation hop rather than a direct
render.

---

## Where everything lives

| surface | job |
|---|---|
| **Me tab** | identity card → Preview, three counts, **Edit profile**, **Settings** |
| **Preview** (`/user/<own id>`) | how others see you — literally the attendee screen, in its `'self'` mode |
| **Edit profile** | photos, name, age, occupation, education, bio, interests, **and the five matching fields** |
| **Settings** | Privacy · Notifications · Safety · About · Account, then Danger zone |

### There used to be two editors and three doors

`edit-profile` owned your photos, bio and details. **`about-you` owned every
field the matching engine reads** — intent, work field, gender, orientation,
`interested_in` — and was reachable only from Settings → Discovery → "You and
matching", three taps deep under a heading that did not name it.

Three ways in, too: a row on the Me tab, a row at the top of Settings, and a
card above that row whose *outer* press went back to the Me tab while a nested
one inside went to the editor.

Now: `components/profile/MatchingFields.tsx` is one block that both onboarding
and the editor render, so the two cannot drift into asking differently.

**It opened blank, and that was a client bug rather than an API limit.**
`about-you` read only name and age, so every chip was unselected however you had
answered — "networking" looked the same as "nothing chosen". The fields were
always in the payload for your own profile: the route spreads
`selfProfileFields`, the whole row minus `date_of_birth`. Its "withheld from
everyone" rule governs the **public** branch; self is the exception it is
written against. They simply were not typed or read.

**Saving sends only what moved.** A blanket send would write
`intent_default: []` for anyone who opened the screen and saved without touching
the chips, which silently switches their matching off. And the dating three stop
being written once dating is unticked — they are special-category data, so
continuing to write them would keep it current for somebody who just opted out.

---

## Settings, reorganised

Five sections, each named after what is under it:

**Privacy** (online status, read receipts, location) · **Notifications** (push) ·
**Safety** (blocked users, safety tips, guidelines) · **About** (help, terms,
privacy policy) · **Account** (sign out) — then **Danger zone**, alone at the
bottom behind a 40pt gap, holding Delete account.

What that replaced: an "Account" section containing **no account settings** —
Blocked users, Sign out, Delete account — with the two destructive rows adjacent
and both red, at the top of the screen where the thumb lands. Blocked users sat
there while "Safety" held two links to a web page. "Discovery" mixed a
navigation row with three toggles. "Notifications" was a header over one switch.
Terms and Privacy were filed under "Support".

**Sign out is no longer red.** Reserving that colour for the single irreversible
row is what makes it mean anything, and a test pins that exactly one row carries
it.

---

## Two differences from the attendee view

Both follow from it being you. (A third difference used to be listed here —
"the top bar carries Settings" — but Settings now lives one level up, on the
Me tab itself, never on this screen in either mode. See the section above.)

1. **Nothing is gated.** `blurred` is never set and every photo is yours, so
   there is no reveal state to render.
2. **There is nobody to Connect to.** `ProfileActions` — Connect / Message /
   Like — is simply omitted in `'self'` mode rather than swapped for a
   dedicated own-profile CTA component. (An earlier draft of this doc named
   that component `ProfileOwnCta`; it was never built — the omission is the
   whole story.) The only reason to look at your own profile from here is to
   change what other people see, and that action — **Edit profile** — lives
   on the Me tab that got you here, not on this screen.

---

## `bottomInset`, and why the hero needed one

The name is anchored to the bottom of the hero. That is right on
`app/user/[id].tsx`: a full-screen route where the hero *is* the first screen,
and the name sits on the fold.

`app/(tabs)/profile.tsx` has a tab bar over that same edge. The second line of
"Sagar Kishore, 28" rendered underneath it — the hero is `751/390` of the
screen width, which is taller than the space above an 88pt bar.

`ProfileHero` takes a `bottomInset` rather than looking one up: the component
has no idea which navigator it is in, and `TAB_BAR_CLEARANCE` is the caller's
fact. The attendee route passes nothing and is unchanged.

---

## The CTA is black, and that is deliberate

`1141:5734` is `bg-black` where every other card on the screen is `#141313` or
`#211F1F`. It is the one place the page goes **darker than its own background**,
and that inversion is what makes it read as the end of the scroll rather than
one more section. The 80pt vertical padding does the same job and is kept for
the same reason.

The frame sets "Circle" in gradient-filled text. React Native cannot fill glyphs
with a gradient without masking the whole line — a native view, and it breaks
text selection — so it takes the gradient's warm end as a flat colour, which is
what `EMBER.accent` is.

---

## What the frame draws that nothing backs

Each of these needs a decision, and in two cases a schema change, before it can
be built. None was invented to fill the space.

1. **`@blendn_julia`** — there is no username or handle anywhere in the product.
   Profiles are keyed by id and displayed by name.
2. **The `PRO` badge** — there is no subscription or tier. Nothing distinguishes
   one account from another this way.
3. **`CIRCLE PRESENCE`** — three event cards with image, date, city and blurb.
   `stats.eventsAttended` is a **count** and there is no endpoint that returns
   the list. `getEvents` has no "attended" filter. This needs an API before it
   needs a component.
4. **The interests cloud has one gradient-filled chip** (`1141:5684`,
   "Atmospheric UI") among five outlined ones. Nothing in the data says which
   interest is special, and `ProfileInterests` already uses that treatment for
   **shared** interests on somebody else's profile — where it means something.
   On your own profile there is nobody to share with.

---

## Open asks for the designer

1. **`CIRCLE PRESENCE` is the big one** — see 3 above. It is the most
   substantial thing on the frame and the only one that needs backend work, so
   it should be decided before it is drawn again.
2. **Does a handle exist as a product idea, or is it set dressing?** If it is
   real it belongs in onboarding, not just on this screen.
3. **Is `PRO` a plan?** If so it is a much larger decision than a badge.
4. **The gradient chip needs a meaning or should be dropped** — see 4 above.
