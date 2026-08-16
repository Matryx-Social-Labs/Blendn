# Render performance

How to measure it, and what it measured.

## The instrument

`lib/perf.tsx` wraps each screen in React 19's own `<Profiler>`. No dependency,
no native module, nothing that can drift from the React version.

```
exp+blendn:///preview/perf      the table, and Reset
```

Slow commits (≥16ms, one frame at 60Hz) log as they happen:

```
PERF-SLOW pulse update 50.9ms (frame budget 16ms)
```

Everything is aggregated regardless, and the preview route prints the table to
the Metro log as well as to the screen — the log is the half a script can read,
which is what makes before/after something you run rather than eyeball.

In production `ScreenProfiler` returns its children untouched. Not a wrapper
that checks a flag; no wrapper at all.

### What it does not measure

Native layout, image decode, and the JS↔native bridge. A screen that reads fast
here and janky on device is telling you the cost is **below** React, which is a
useful answer rather than a gap.

## Why this exists

Three perf changes shipped before it did, each justified by *reading* the code:

- `force: true` on mount paths, bypassing live SWR caches (#212)
- the whole response cache cleared on every foreground (#213)
- `renderItem` rebuilding its props every render (#214)

All three were real. None was measured, so none could answer the only question
that mattered: **which one was the lag you could feel?** Reading finds
candidates; it cannot rank them.

## Baseline — 2026-08-16, dev bundle, iPhone 17 Pro Max simulator

Walked: Pulse → Scene → Pulse → Going → Banter → Me → Room.

| screen | commits | total | worst | mount |
|---|---|---|---|---|
| **pulse** | **60** | **627ms** | 71ms | — |
| **room-grid** | 8 | 203ms | **98ms** | 13ms |
| me | 7 | 71ms | 24ms | 24ms |
| banter | 15 | 48ms | 17ms | 17ms |
| scene | 5 | 35ms | 16ms | 12ms |
| going | 10 | 6ms | 3ms | 3ms |
| splash-signin | 4 | 4ms | 3ms | 3ms |

**Read `commits` first.** A screen with a modest worst case and sixty commits is
re-rendering on something it has no business watching, and that is the shape
that reads as *lag* rather than as a wait.

**This walk visits the Pulse twice**, so its row is two visits and every other
row is one. A single visit measures **27 commits / 257ms**. That is not a
detail: 60 was read as a runaway loop and chased as one for an afternoon, when
the number was simply counted over two visits and is close to linear in them.
**Compare a walk only against the same walk.**

### The two that matter

**Pulse — 27 commits per visit.** Five times the Scene's, for a screen you are
only looking at. The leading suspect is already written down: `renderEventItem`
closes over `checkinStatuses`, `proximityData` and `interestStatuses`, three
maps that change whenever anybody checks in, moves, or taps a heart, so every
change gives `renderItem` a new identity and `FlatList` re-renders every mounted
row.

`useWhyRender` puts a number on it: **six state objects change identity together,
seventeen times in one visit** — `events`, `checkinStatuses`, `proximityData`,
`interestStatuses`, `interestCounts`, `checkedInEvents`. Together, because
`fetchEvents` sets five of them after one `await` and React batches them, and
the sixth follows from the `[userLocation, events]` proximity effect. So the
question is not "which six things are wrong" but **"why does the load cascade
run seventeen times".**

Four answers have been *disproved*, and are listed so nobody spends the
afternoon again:

| ruled out | how |
|---|---|
| `setState` in a loop | no such loop exists |
| the JS scroll handler / `setScrollProgress` | inspection |
| `filters` unstable in the fetch effect's deps | it is `useState`, so stable |
| `useLiveSync` restarting on a new `onSync` | it refs the callback; deps are `[enabled]` |
| the screen remounting | `mounts=0` for the walk — every commit is an update |

The fetch effect's own deps were probed directly and changed **once**. So the
seventeen cascades are not that effect refiring, and `fetchEvents` has only four
call sites. That is where the next session starts.

**Room/Grid — one 98ms commit. Fixed (#219).** Six frames dropped in a single
hitch, against a 13ms mount. The mount was cheap because the roster was not
there yet; the 98ms was the *update* where it arrived.

The arithmetic: `getEventMatches` asks for `limit: 20`, the roster was rendered
by a plain `shown.map()` inside a `ScrollView`, and each `GridCard` draws
**three `LinearGradient`s**. Twenty cards is sixty native gradient views in one
commit, ~5ms a card — and a `GridCard` is a full-width card over 280pt tall, so
**three fill the screen and seventeen were built where nobody could see them.**
Nothing was virtualised, so the cost was linear in how busy the night was: a
60-person event paid three times it.

Now a `FlatList` with `initialNumToRender={4}`. One column and no `numColumns` —
`styles.list` sets no `flexDirection`, so the Grid has always been full-width
cards, and two columns would be a different design rather than a faster one.

| | before | after |
|---|---|---|
| worst commit | **98ms** | **43ms** |
| roster arrival | one 98ms commit | 39.9ms + 34.7ms |
| mounts | 1 | 1 |

`commits` and `total` are **not** comparable between those two runs — the
after-run sat in the room for ~35s with a live socket where the baseline passed
through. `worst` is the like-for-like number, and it is the one the defect was.

### Fine, leave alone

Scene, Going and splash/sign-in are all comfortably inside budget. Me and Banter
are acceptable — Banter's 15 commits are worth a glance eventually but are not
what anybody is feeling.

## Measuring a change

1. `exp+blendn:///preview/perf`, press **Reset**
2. walk the same flow as the baseline above
3. come back, or read `PERF ` lines from the Metro log

`mounts` is the column to check before any of that. Above 1 for a screen you
visited once means the tree was torn down and rebuilt, which presents as a pile
of commits and sends you hunting for state that never changed.

Compare `commits` and `total`. `worst` alone can improve while the screen still
feels bad, because sixty cheap commits and one expensive one feel different and
only one of them is visible in that column.

## A caveat about the dev bundle

These numbers are from a dev build, which carries dev-only overhead React strips
in release. They are the right numbers for *ranking* screens against each other,
and the wrong numbers for claiming an absolute cost. Before concluding a screen
is too slow for users, re-measure with `--dev=false`.
