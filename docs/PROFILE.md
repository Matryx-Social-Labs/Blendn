# The profile

Two screens, one set of pieces.

| | route | frame |
|---|---|---|
| somebody else's | `app/user/[id].tsx` | `1141:5163` |
| your own | `app/(tabs)/profile.tsx` | `1141:5633` |

**Components:** `components/profile/ProfileSections.tsx`.
**Harness:** `exp+blendn:///preview/profile`.

---

## The own-profile half was built and never wired

`ProfileSections.tsx` says at the top that it serves *both* frames, and it
always did. Only `app/user/[id].tsx` ever imported it. `app/(tabs)/profile.tsx`
went on drawing its own hero, its own quick-action row and its own stat tiles in
`APP_COLORS` — the last screen in the app still on the old theme — while the
components for its frame sat finished a directory away.

That is the fifth time this exact thing has happened here, and it is why
`__tests__/noOrphanComponents.test.ts` exists. **The test did not catch this
one**, because `ProfileSections.tsx` *had* a non-preview importer — just not
the second one it was written for. A file can be half-orphaned and the check
only sees whole files.

---

## Three differences from the attendee view

All of them follow from it being you.

1. **Nothing is gated.** `blurred` is never set and every photo is yours, so
   there is no reveal state to render.
2. **There is nobody to Connect to.** `ProfileActions` — Connect / Message /
   Like — is replaced by `ProfileOwnCta`. The only reason to look at your own
   profile is to change what other people see, so the screen ends in
   **Edit profile**.
3. **The top bar carries Settings**, which no attendee profile has.

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
