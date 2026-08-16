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

### The two that matter

**Pulse — 60 commits, 627ms.** Ten times the commit count of the Scene for a
screen you are only looking at. The leading suspect is already written down:
`renderEventItem` closes over `checkinStatuses`, `proximityData` and
`interestStatuses`, three maps that change whenever anybody checks in, moves, or
taps a heart, so every change gives `renderItem` a new identity and `FlatList`
re-renders every mounted row.

**Room/Grid — one 98ms commit.** Six frames dropped in a single hitch, against a
13ms mount. Something after mount is doing bulk work in one commit; the roster
arriving and rendering ~20 cards at once is the obvious candidate.

### Fine, leave alone

Scene, Going and splash/sign-in are all comfortably inside budget. Me and Banter
are acceptable — Banter's 15 commits are worth a glance eventually but are not
what anybody is feeling.

## Measuring a change

1. `exp+blendn:///preview/perf`, press **Reset**
2. walk the same flow as the baseline above
3. come back, or read `PERF ` lines from the Metro log

Compare `commits` and `total`. `worst` alone can improve while the screen still
feels bad, because sixty cheap commits and one expensive one feel different and
only one of them is visible in that column.

## A caveat about the dev bundle

These numbers are from a dev build, which carries dev-only overhead React strips
in release. They are the right numbers for *ranking* screens against each other,
and the wrong numbers for claiming an absolute cost. Before concluding a screen
is too slow for users, re-measure with `--dev=false`.
