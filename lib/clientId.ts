/**
 * The app's own id for a send (SCRUM-410).
 *
 * Sent with every message so a retry after a lost response returns the first
 * write instead of writing a second. Uniqueness per sender is all it needs, so
 * Math.random's v4 is enough — no native crypto module for one field.
 */
export function newClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
