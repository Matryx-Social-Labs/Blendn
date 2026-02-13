# Blendn App Performance & Smoothness Improvements (Feb 3, 2026)

Goal: reduce loading time, improve scroll smoothness, and cut unnecessary network/UI work. This checklist is based on current app code (not the old improvements file).

## Checklist

### Quick Wins (1-3 days)
- [ ] Replace `ImageBackground` with `OptimizedImage` + overlay views in `app/(tabs)/events.tsx`.
- [ ] Standardize `cachePolicy="memory-disk"` and `transition` for list thumbnails; reserve `priority="high"` for above-the-fold.
- [ ] Prefetch top-of-list images using `preloadImages` after list data loads.
- [ ] Move inline styles in render loops to `StyleSheet` or memoized objects.
- [ ] Add `getItemLayout` for fixed-height lists (Chat rows, Match tiles, Event cards).
- [ ] Precompute carousel lists with `useMemo` (avoid `.filter().map()` inside render).
- [ ] Gate `loadCheckinStatusesBatch`, `loadInterestData`, `loadInterestCounts` on stable event IDs, not array identity.

### Network & Data Fetching (High Impact)
- [ ] Consolidate Events list + check-in status + interest status + interest counts into a single API response.
- [x] Add in-flight request de-duplication in `lib/apiClient.ts`.
- [x] Add stale-while-revalidate caching for list data (Events, Chat).
- [x] Add per-screen TTLs to avoid refetch on rapid tab switches.
- [ ] Reduce list payload fields; fetch full details on detail screens only.

### Images & Media (Major Load Driver)
- [x] Remove signed URL generation from the client (Supabase stub). Move to backend or public CDN transforms.
- [x] Ensure all thumbnails pass explicit width/height to `OptimizedImage`.
- [x] Disable progressive loading for small thumbnails to avoid double downloads.
- [x] Prefetch only the first-screen images (top 6–10), not the full list.

### Lists & Layout (Scroll Smoothness)
- [ ] Replace nested horizontal `ScrollView` carousels with horizontal `FlatList` or `FlashList`.
- [x] Replace remaining horizontal `ScrollView` carousels in Profile/User screens.
- [ ] Use `VirtualizedList` for large lists currently using bare `FlatList`.
- [ ] Consider a single `SectionList` on Events to reduce multiple list trees.
- [ ] Keep `removeClippedSubviews` enabled where compatible.
- [ ] Memoize list item components (`EventCard`, chat rows, match tiles).

### Navigation & Startup
- [x] Defer location permissions/geocoding until needed (scroll or “Nearby” tap).
- [ ] Lazy-load heavy screens (Match, Event detail) with `Suspense` fallback.
- [ ] Compress/preload critical assets and reduce large background images on initial route.

### Realtime & Background Work
- [ ] Remove or replace Supabase realtime stub usage in `lib/subscriptionManager.ts`.
- [ ] Pause polling/refresh when app is backgrounded via `AppState`.

### Measurement & Guardrails
- [ ] Add time-to-first-render logging per screen via `Logger`.
- [ ] Add list render duration logging for large lists.
- [ ] Add dev-only “Performance HUD” (API queue length, cache hit rate, list render counts).

## Suggested Order of Attack

1. Image pipeline: `ImageBackground` -> `OptimizedImage`, move signed URLs to backend.
2. Consolidate Events API calls into one response.
3. Convert horizontal carousels to `FlatList` and add `getItemLayout`.
4. Add SWR caching + request de-dup in `apiClient`.

---

If you want, I can add owners/estimates or start implementing the top 1–2 items.
