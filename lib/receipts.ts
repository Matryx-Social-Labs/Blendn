/**
 * The tick on your own DM (SCRUM-408): ✓ sent, ✓✓ delivered, ✓✓ read.
 *
 * Delivered is the recipient's app having it — a socket delivery, or them
 * opening the thread or the inbox — and shows whatever their read-receipt
 * setting (owner, 2026-09-28). Read is `isRead`, which the server already
 * withholds when they turned receipts off. A row read before delivery was
 * recorded is still read.
 */
export type Receipt = 'sent' | 'delivered' | 'read'

export function receiptFor(
  m: { senderId: string; isRead: boolean; deliveredAt?: string | null; failed?: boolean },
  myId: string | undefined
): Receipt | null {
  if (!myId || m.senderId !== myId || m.failed) return null
  if (m.isRead) return 'read'
  return m.deliveredAt ? 'delivered' : 'sent'
}
