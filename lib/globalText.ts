// React Native 0.79 removed Text.defaultProps support, so there is no global
// default fontFamily patch point. Use components/Typography.tsx (backed by
// lib/typography.ts, which applies APP_FONTS per variant) for themed text.
// This file is kept as a no-op to avoid breaking the import in _layout.tsx.

export {}
