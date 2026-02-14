# UI Improvements Backlog (Prioritized)

Scope: code audit of current React Native screens/components. Priorities are based on user impact, clarity, accessibility, and UI consistency.

## P0 (Fix First)

| Priority | Area | Improvement | Why it matters | References |
|---|---|---|---|---|
| P0 | Accessibility / Contrast | Fix low-contrast back buttons in onboarding (`#f0f0f0` background + white arrow text). | Back navigation is visually hard to see, especially in bright environments. | `app/onboarding/basic-info.tsx:158`, `app/onboarding/basic-info.tsx:165`, `app/onboarding/interests.tsx:155`, `app/onboarding/interests.tsx:162` |
| P0 | Accessibility / Contrast | Fix dark-mode contrast bugs in chat requests section (`#333/#666` text on dark background). | Request sender/message text becomes hard to read and can be missed entirely. | `app/(tabs)/chat.tsx:645`, `app/(tabs)/chat.tsx:1146`, `app/(tabs)/chat.tsx:1151`, `app/(tabs)/chat.tsx:1155` |
| P0 | Cross-platform UX | Replace `Alert.prompt` with a cross-platform input flow (custom modal/bottom sheet). | On Android this pattern is unreliable/unsupported, breaking add-interest/goal UX. | `app/edit-profile.tsx:119`, `app/edit-profile.tsx:145`, `app/edit-profile.tsx:171` |
| P0 | Primary nav accessibility | Add explicit tab `accessibilityLabel` per tab icon and keep selected announcements. | Icon-only tabs without labels reduce screen-reader clarity and discoverability. | `app/(tabs)/_layout.tsx:34`, `app/(tabs)/_layout.tsx:136` |
| P0 | Touch target size | Ensure all top-bar icon buttons meet minimum touch target (44x44) with hitSlop. | Current settings button in events header is too small and easy to mis-tap. | `app/(tabs)/events.tsx:1452`, `app/(tabs)/events.tsx:2168` |

## P1 (High Impact)

| Priority | Area | Improvement | Why it matters | References |
|---|---|---|---|---|
| P1 | Profile authenticity | Remove hardcoded profile fields (role/education/subtitle) and use real user data + placeholders. | Static fake text damages trust and makes profile screen feel unfinished. | `app/(tabs)/profile.tsx:366`, `app/(tabs)/profile.tsx:398`, `app/(tabs)/profile.tsx:402` |
| P1 | Visual consistency | Replace text hearts (`♥︎`/`♡`) with icon buttons and selected states, plus labels. | Text glyphs are inconsistent across devices and are less accessible. | `components/EventCard.tsx:156`, `app/(tabs)/events.tsx:127`, `app/(tabs)/events.tsx:617`, `app/(tabs)/events.tsx:1011`, `app/(tabs)/events.tsx:1200` |
| P1 | Settings trust | Persist toggles (push/read receipts/location/online status) via backend + loading states. | Current toggles appear functional but are local-only, causing confusion. | `app/settings.tsx:57`, `app/settings.tsx:58`, `app/settings.tsx:59` |
| P1 | CTA hierarchy | Standardize primary/secondary/destructive button styles across screens. | Inconsistent CTA colors/shapes reduce predictability and scan speed. | `app/settings.tsx:150`, `app/edit-profile.tsx:523`, `app/onboarding/basic-info.tsx:223`, `app/onboarding/location.tsx:92` |
| P1 | Empty states | Replace plain empty blocks with contextual actions and illustrations in all key tabs. | Better recovery path when users have no chats/events/matches. | `app/(tabs)/events.tsx:1573`, `components/screens/MatchScreen.tsx:438`, `app/(tabs)/chat.tsx:907` |
| P1 | Loading UX | Add progressive skeleton-to-content transitions with stable layout for all major screens. | Reduces perceived jank and layout shifts while data hydrates. | `app/(tabs)/events.tsx:1517`, `app/(tabs)/chat.tsx:748`, `app/(tabs)/profile.tsx:225`, `app/user/[id].tsx:155` |
| P1 | Copy consistency | Replace mixed system `alert()` usage with `Alert.alert()` and consistent copy tone. | Prevents inconsistent platform behavior and mixed UX voice. | `app/onboarding/interests.tsx:38`, `app/onboarding/interests.tsx:51`, `app/(tabs)/chat.tsx:684` |
| P1 | Typography scale | Harmonize heading sizes across tabs to a type scale token system. | Current h1/h2 usage varies heavily and weakens visual rhythm. | `app/(tabs)/events.tsx:1704`, `app/(tabs)/chat.tsx:1214`, `components/screens/MatchScreen.tsx:714`, `app/(tabs)/profile.tsx:519` |
| P1 | Brand consistency | Replace external safety/help links pointing to Bumble docs with product-owned resources. | Off-brand links break product confidence and continuity. | `app/settings.tsx:62`, `app/settings.tsx:63`, `app/settings.tsx:66`, `app/settings.tsx:69`, `app/settings.tsx:70`, `app/settings.tsx:71` |

## P2 (Medium)

| Priority | Area | Improvement | Why it matters | References |
|---|---|---|---|---|
| P2 | Theme system | Centralize colors, spacing, radii in design tokens and remove scattered hex values. | Makes UI coherent and easier to maintain/change globally. | `app/(tabs)/events.tsx:1680`, `app/(tabs)/chat.tsx:926`, `components/screens/MatchScreen.tsx:697`, `app/settings.tsx:140` |
| P2 | Card density | Reduce visual overload in events home by simplifying repeated carousel patterns. | Too many horizontal sections can create fatigue and decision paralysis. | `app/(tabs)/events.tsx:539`, `app/(tabs)/events.tsx:588`, `app/(tabs)/events.tsx:909`, `app/(tabs)/events.tsx:1382` |
| P2 | Accessibility labels | Add missing `accessibilityLabel`/role hints to all tappable cards/chips/icon buttons. | Improves assistive navigation and automation testing coverage. | `components/NearbyEventCard.tsx:38`, `components/EventCard.tsx:74`, `components/screens/MatchScreen.tsx:54` |
| P2 | Micro-feedback | Add subtle haptics and pressed/active states for high-frequency actions (interest, check-in, accept/reject). | Improves action confidence and responsiveness. | `components/EventCard.tsx:131`, `app/(tabs)/events.tsx:293`, `app/(tabs)/chat.tsx:845` |
| P2 | Chat segmentation | Rename tab labels (“Recent Chats”, “Go Anonymous”) to clearer, behavior-based labels. | “Go Anonymous” is unclear compared to actual content (group chats). | `app/(tabs)/chat.tsx:764`, `app/(tabs)/chat.tsx:770` |
| P2 | Realtime indicators | Add presence/typing/read status visual language consistency across private and group chat. | Improves clarity of conversation state and immediacy. | `app/private-chat/[conversationId].tsx:161`, `app/private-chat/[conversationId].tsx:188`, `app/chat/[id].tsx:70` |
| P2 | Form UX | Add inline validation text below fields instead of interruptive alerts for edit/profile onboarding forms. | Reduces interruption and improves completion rate. | `app/edit-profile.tsx:203`, `app/edit-profile.tsx:210`, `app/onboarding/basic-info.tsx:27`, `app/onboarding/basic-info.tsx:32` |
| P2 | CTA states | Add disabled/loading visual states to all async buttons consistently. | Prevents double actions and uncertainty during network calls. | `app/edit-profile.tsx:284`, `app/onboarding/location.tsx:67`, `app/user/[id].tsx:90` |

## P3 (Polish)

| Priority | Area | Improvement | Why it matters | References |
|---|---|---|---|---|
| P3 | Tab bar affordance | Add optional labels/tooltips for first-run to support icon-only bottom nav learning. | Helps onboarding and reduces tab misinterpretation. | `app/(tabs)/_layout.tsx:136` |
| P3 | Motion consistency | Standardize list/card entrance animations duration/easing across tabs. | Creates a more intentional, premium feel. | `components/EventCard.tsx:67`, `components/screens/MatchScreen.tsx:192` |
| P3 | Avatar fallback quality | Replace generic placeholders with initials + gradient fallback style used consistently app-wide. | Keeps UI polished when image URLs fail. | `app/(tabs)/events.tsx:1436`, `app/(tabs)/chat.tsx:596`, `app/(tabs)/profile.tsx:326` |
| P3 | Information architecture | Reduce duplicate “edit profile” entry points and clarify account vs profile scope. | Simplifies navigation model and reduces choice clutter. | `app/settings.tsx:46`, `app/settings.tsx:123`, `app/(tabs)/profile.tsx:291` |

## Suggested Implementation Order

1. P0 accessibility/contrast/cross-platform fixes.
2. P1 trust and consistency fixes (hardcoded profile text, persistent settings, icon/CTA consistency).
3. P2 systematization (tokens, labels, validation UX).
4. P3 polish pass (motion, fallback visuals, IA cleanup).

