import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'

import { apiClient } from './apiClient'
import { Logger } from './logger'
import type { Ticket } from './ticketing'

/*
 * The tickets on this phone (contract §6): the last `GET /me/tickets` answer, kept so the pass opens at a door with no
 * signal. Per account (the `userId` it was saved for), wiped at sign-out (`resetLocalSession` in `lib/useAuth.ts`), so the
 * next person on the phone never holds the last one's QR codes.
 *
 * AsyncStorage, not the keychain: the keychain shares one native queue with every Expo module and has stalled sign-out for
 * minutes (SCRUM-733). A QR alone admits nobody twice (the door refuses a used ticket), and the app's sandbox holds it.
 */

const KEY = 'blendn.tickets.v1'

/** What the pass says about the event, held beside the tickets: §6 carries none of it (contract gap, see the PR). */
export type TicketEvent = { title: string; startTime: string; timezone?: string; venueName?: string; coverImageUrl?: string | null }

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

/* One write at a time: a paid order and a remembered event landing together must not each overwrite the other. */
let chain: Promise<unknown> = Promise.resolve()
function update(userId: string, change: (held: Held) => Held): Promise<void> {
  const next = chain.then(async () => {
    const held = await readTicketCache(userId)
    await AsyncStorage.setItem(KEY, JSON.stringify({ userId, ...change(held) } satisfies Stored))
  })
  chain = next.catch((e) => Logger.warn('tickets', 'cache:write:failed', { error: e }))
  return chain as Promise<void>
}

/** A full `/me/tickets` answer replaces the list; with `orderId` (an order just paid) only that order's tickets are replaced. */
export function saveTickets(userId: string, tickets: Ticket[], { orderId }: { orderId?: string } = {}): Promise<void> {
  return update(userId, (held) => ({
    ...held,
    tickets: orderId ? [...held.tickets.filter((t) => t.orderId !== orderId), ...tickets] : tickets,
  }))
}

/** The event's words for its pass (title, when, where), from a screen that has them: the event page, Going. */
export function rememberTicketEvent(userId: string, eventId: string, event: TicketEvent): Promise<void> {
  return update(userId, (held) => ({ ...held, events: { ...held.events, [eventId]: event } }))
}

/** Sign-out (and an expired session): gone, whoever it belonged to. */
export async function forgetTickets(): Promise<void> {
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

  const load = useCallback(async () => {
    if (!userId) return
    const cached = await readTicketCache(userId)
    setHeld((h) => (h.tickets.length > 0 ? h : cached))
    try {
      const r = await apiClient.getMyTickets()
      if (!r.success || !Array.isArray(r.data)) throw new Error(r.error ?? 'No tickets in the answer')
      await saveTickets(userId, r.data)
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
