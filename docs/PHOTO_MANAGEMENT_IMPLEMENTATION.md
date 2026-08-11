# Profile photos

> Rewritten 2026-08-11. The previous version of this file described a
> **Supabase** implementation with "photo verification" and "quality scoring".
> The app has no Supabase dependency (`grep supabase package.json` → nothing),
> and none of that verification existed. It is replaced rather than amended,
> because a document that confidently describes the wrong storage backend sends
> the next person the wrong way faster than no document at all.

## Where photos live

Tigris (S3-compatible), via a presigned URL. The client uploads **directly**;
the server never sees the bytes.

```
  app                          API                        Tigris
   │                            │                            │
   ├─ POST /uploads/presigned-url ─────────────►             │
   │  ◄───────── { uploadUrl, publicUrl, key } ─┤            │
   ├─ PUT the bytes ─────────────────────────────────────────►
   ├─ PUT /profiles/:id { photos: [publicUrl] } ►            │
   │                            ├─ validate, size, moderate ─►
   │  ◄──────────── accepted, or a named rejection ──────────┤
```

Keys are `profile/<userId>/<timestamp>-<random>-<name>`, which is what makes
ownership provable from a URL without a database lookup.

## What the server checks

Three gates, cheapest and most certain first (`blendn-admin/lib/photos.ts`):

| Gate | Rejection | Why |
|---|---|---|
| Ours, and yours | `not_ours` | The next two gates **fetch** the URL. Without this, `photos` is an SSRF primitive — `http://169.254.169.254/` is a valid URL |
| Not blank | `too_small` | One `HeadObject`. A solid colour compresses to a few KB where a photograph is hundreds |
| Not harmful | `unsafe` | OpenAI omni-moderation, free for images |

Only URLs not already on the profile are checked, and they run concurrently.
Moderation **degrades open** — an outage must not stop somebody having a
profile picture — and the outcome is recorded in `photo_checks` so it can be
swept later.

**It does not check that the photo is of you, or of a person.** Moderation
scores harm, not subject matter: a photo of a dog passes cleanly.

## The primary photo

`photos[0]` **is** the primary. There is no separate flag, and `User.image` is
a mirror the server writes from it — so the match card, the DM avatar and the
profile cannot disagree.

`PhotoManager` shows a **Make main** control on every non-primary tile; it
reorders the array and saves through `PUT /profiles`. Provider avatars from
Google are no longer taken at signup: an avatar is not a choice, and it had
never been through the gates above.

## The blurred copy

Somebody who has not revealed is served a **40px derivative**, never the full
URL. `createBlurDerivative` makes it at upload time with
`expo-image-manipulator`.

The size *is* the anonymity. `blurRadius` on the real image would mean the real
URL had already reached the device — recoverable from a proxy or a cache dump,
which is the bug `MatchScreen.tsx:513` still carries a comment about.

## What is deliberately not here

- **Face detection.** Needs `node-canvas` (Cairo, a native dependency in the
  Railway image) plus several MB of model weights. Worth revisiting when photos
  carry more weight than they do now.
- **A completeness meter.** `docs/PLACEHOLDER_SCREENS.md` bans profile-strength
  framing. A photo is required at exactly one moment — revealing — and named
  there, because that is the one feature that cannot work without it.
