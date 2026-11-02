import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'

import { apiClient } from './apiClient'
import { Logger } from './logger'
import type { Ticket, TicketEvent } from './ticketing'

export type { TicketEvent }

/*
 * The tickets on this phone (contract §6): the last `GET /me/tickets` answer, kept so the pass opens at a door with no
 * signal. Per account (the `userId` it was saved for), wiped at sign-out (`resetLocalSession` in `lib/useAuth.ts`), so the
 * next person on the phone never holds the last one's QR codes.
 *
 * AsyncStorage, not the keychain: the keychain shares one native queue with every Expo module and has stalled sign-out for
 * minutes (SCRUM-733). A QR alone admits nobody twice (the door refuses a used ticket), and the app's sandbox holds it.
 */

const KEY = 'blendn.tickets.v1'

/** The event's words for the pass, held beside the tickets: for a ticket from a server before §8.4, which carried none. */
type Held = { tickets: Ticket[]; events: Record<string, TicketEvent> }
type Stored = Held & { userId: string }

const EMPTY: Held = { tickets: [], events: {} }

async function read(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Stored>
    if (typeof v.userId !== 'string' || !Array.isArray(v.tickets)) return null
    return { userId: v.userId, tickets: v.tickets, events: v.events && typeof v.events === 'object' ? v.events : {} }
  } catch {
    return null
  }
}

/** This account's copy; nothing (never another account's) when the phone holds someone else's or nothing readable. */
export async function readTicketCache(userId: string): Promise<Held> {
  const s = await read()
  return s && s.userId === userId ? { tickets: s.tickets, events: s.events } : EMPTY
}

/*
 * The session the copy belongs to: `forgetTickets` (sign-out) moves it on, and a write begun in an older one is dropped.
 * Without it a `/me/tickets` answer or a paid order landing after sign-out wrote the last account's QR codes back
 * (security review). `since`: the session the caller's read began in, when it began before this call.
 */
let session = 0
export const ticketSession = () => session

/* One write at a time: a paid order and a remembered event landing together must not each overwrite the other. */
let chain: Promise<unknown> = Promise.resolve()
function update(userId: string, change: (held: Held) => Held, since = session): Promise<void> {
  const next = chain.then(async () => {
    if (since !== session) return
    const held = await readTicketCache(userId)
    await AsyncStorage.setItem(KEY, JSON.stringify({ userId, ...change(held) } satisfies Stored))
  })
  chain = next.catch((e) => Logger.warn('tickets', 'cache:write:failed', { error: e }))
  return chain as Promise<void>
}

/** A full `/me/tickets` answer replaces the list; with `orderId` (an order just paid) only that order's tickets are replaced. */
export function saveTickets(userId: string, tickets: Ticket[], { orderId, since }: { orderId?: string; since?: number } = {}): Promise<void> {
  return update(
    userId,
    (held) => ({
      ...held,
      tickets: orderId ? [...held.tickets.filter((t) => t.orderId !== orderId), ...tickets] : tickets,
    }),
    since
  )
}

/** The event's words for its pass (title, when, where), from a screen that has them: the event page, Going. */
export function rememberTicketEvent(userId: string, eventId: string, event: TicketEvent): Promise<void> {
  return update(userId, (held) => ({ ...held, events: { ...held.events, [eventId]: event } }))
}

/** Sign-out (and an expired session): gone, whoever it belonged to. */
export async function forgetTickets(): Promise<void> {
  session += 1
  await chain
  await AsyncStorage.removeItem(KEY).catch(() => {})
}

/**
 * My tickets, from the phone's copy at once and then the server's answer, which replaces the copy. `offline`: the server
 * could not be asked, so what is shown is the copy (still valid at the door). `loaded`: both have been tried.
 */
export function useMyTickets(userId: string | null | undefined) {
  const [held, setHeld] = useState<Held>(EMPTY)
  const [offline, setOffline] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Another account (or none): nothing of the last one's is drawn, from the first render for it.
  const [heldFor, setHeldFor] = useState(userId)
  if (heldFor !== userId) {
    setHeldFor(userId)
    setHeld(EMPTY)
    setOffline(false)
    setLoaded(false)
  }

  const load = useCallback(async () => {
    if (!userId) return
    // Signed out (or another account) while this read was out: its answer is the last account's, and goes nowhere.
    const since = ticketSession()
    const cached = await readTicketCache(userId)
    if (since !== ticketSession()) return
    setHeld((h) => (h.tickets.length > 0 ? h : cached))
    try {
      const r = await apiClient.getMyTickets()
      if (since !== ticketSession()) return
      if (!r.success || !Array.isArray(r.data)) throw new Error(r.error ?? 'No tickets in the answer')
      await saveTickets(userId, r.data, { since })
      if (since !== ticketSession()) return
      setHeld({ tickets: r.data, events: cached.events })
      setOffline(false)
    } catch (e) {
      Logger.warn('tickets', 'mine:read:failed', { error: e instanceof Error ? e.message : String(e) })
      setOffline(true)
    } finally {
      setLoaded(true)
    }
  }, [userId])

  useEffect(() => {
    // Every write in `load` comes after an await (the copy, then the server): none is synchronous in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { tickets: held.tickets, events: held.events, offline, loaded, refresh: load }
}
