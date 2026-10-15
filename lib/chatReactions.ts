/**
 * The six reactions the server accepts; anything else is a 400. Its own module
 * so a component can draw the bar without importing the API client (which
 * throws at import without `EXPO_PUBLIC_API_BASE_URL`).
 */
export const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const
export type ChatReaction = (typeof CHAT_REACTIONS)[number]
