import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useBackFromBackground } from './backFromBackground'
import { clearDirtyDomains, hasDirtyDomain, LiveSyncDomain, subscribeDirtyDomains } from './liveSyncState'
import { getConnectionStatus, SocketConnectionStatus, subscribeConnectionStatus } from './socketClient'
import { useLatest } from './useLatest'

/**
 * A dirty mark re-reads the screen in front at most once per this long, the last mark in a window still read at its end
 * (SCRUM-1173). Every `chat:message` marks `chat` and every check-in marks `events` and `match`: unthrottled, a room of
 * N phones was N re-reads of the page per message.
 */
const DIRTY_SYNC_MIN_MS = 10_000
/** A reconnect re-reads after a random wait of up to this long: a deploy drops every phone at once. */
const RECONNECT_SYNC_JITTER_MS = 5_000

interface UseLiveSyncOptions {
  enabled?: boolean
  onSync: () => void | Promise<void>
  domains?: LiveSyncDomain[]
  connectedIntervalMs?: number
  disconnectedIntervalMs?: number
  maxDisconnectedIntervalMs?: number
  syncOnFocus?: boolean
  syncOnReconnect?: boolean
  /** Off for a screen whose own socket handlers already apply what the mark is about (a room's or a DM's messages). */
  syncOnDirty?: boolean
  /** After more than a minute in the background, sync once on return so counts roll once to now (motion #49). */
  syncOnReturn?: boolean
}

export function useLiveSync(options: UseLiveSyncOptions): SocketConnectionStatus {
  const {
    enabled = true,
    onSync,
    domains = [],
    connectedIntervalMs = 0,
    disconnectedIntervalMs = 0,
    maxDisconnectedIntervalMs = 60000,
    syncOnFocus = true,
    syncOnReconnect = true,
    syncOnDirty = true,
    syncOnReturn = true,
  } = options

  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>(() => getConnectionStatus())
  const lastSocketStateRef = useRef(socketStatus.state)
  const socketStateRef = useRef(socketStatus.state)
  // Stale closures read the newest values through these. Declared before every
  // effect below, so their sync runs first in each commit.
  const onSyncRef = useLatest(onSync)
  const domainsRef = useLatest(domains)
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)

  const runSync = useCallback(() => {
    // Named inner function so the pending re-run can call itself without
    // runSync referencing its own binding. The re-run stays un-awaited.
    const run = async (): Promise<void> => {
      if (!enabled) return
      if (inFlightRef.current) {
        pendingRef.current = true
        return
      }
      inFlightRef.current = true
      try {
        await onSyncRef.current()
        if (domainsRef.current.length > 0) {
          clearDirtyDomains(domainsRef.current)
        }
      } catch {}
      finally {
        inFlightRef.current = false
        if (pendingRef.current) {
          pendingRef.current = false
          void run()
        }
      }
    }
    return run()
  }, [domainsRef, enabled, onSyncRef])

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return () => {}

      if (syncOnFocus) {
        void runSync()
      }

      const connectedBase = Math.max(0, connectedIntervalMs)
      const disconnectedBase = Math.max(0, disconnectedIntervalMs)
      if (connectedBase <= 0 && disconnectedBase <= 0) {
        return () => {}
      }

      let active = true
      let timeout: ReturnType<typeof setTimeout> | null = null
      let disconnectedBackoffStep = 0

      const schedule = () => {
        if (!active) return
        const connected = socketStateRef.current === 'connected'

        let delay = 0
        if (connected) {
          disconnectedBackoffStep = 0
          if (connectedBase <= 0) return
          delay = connectedBase
        } else {
          if (disconnectedBase <= 0) return
          const exponential = disconnectedBase * Math.pow(2, disconnectedBackoffStep)
          delay = Math.min(maxDisconnectedIntervalMs, exponential)
        }

        const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(delay * 0.15)))

        timeout = setTimeout(async () => {
          if (!active) return
          const currentlyConnected = socketStateRef.current === 'connected'

          if (currentlyConnected) {
            if (domainsRef.current.length === 0 || hasDirtyDomain(domainsRef.current)) {
              await runSync()
            }
          } else {
            await runSync()
            disconnectedBackoffStep = Math.min(disconnectedBackoffStep + 1, 8)
          }

          schedule()
        }, delay + jitter)
      }

      schedule()

      return () => {
        active = false
        if (timeout) clearTimeout(timeout)
      }
    }, [
      connectedIntervalMs,
      disconnectedIntervalMs,
      domainsRef,
      enabled,
      maxDisconnectedIntervalMs,
      runSync,
      syncOnFocus,
    ])
  )

  // Only the screen in front catches up on return, on a reconnect or on a dirty mark: the ones behind it do on their own next focus.
  const focusedRef = useRef(false)
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true
      return () => {
        focusedRef.current = false
      }
    }, [])
  )
  useBackFromBackground(() => {
    if (focusedRef.current) void runSync()
  }, enabled && syncOnReturn)

  useEffect(() => {
    const unsub = subscribeConnectionStatus((status) => {
      setSocketStatus(status)
    })
    return () => {
      unsub()
    }
  }, [])

  useEffect(() => {
    const previousState = lastSocketStateRef.current
    lastSocketStateRef.current = socketStatus.state
    socketStateRef.current = socketStatus.state
    const reconnected = socketStatus.state === 'connected' && previousState !== 'connected'
    if (!enabled || !syncOnReconnect || !reconnected || !focusedRef.current) return
    const timer = setTimeout(() => {
      if (focusedRef.current) void runSync()
    }, Math.random() * RECONNECT_SYNC_JITTER_MS)
    return () => clearTimeout(timer)
  }, [enabled, runSync, socketStatus.state, syncOnReconnect])

  const lastDirtySyncRef = useRef(0)
  useEffect(() => {
    if (!enabled || !syncOnDirty) return () => {}
    let trailing: ReturnType<typeof setTimeout> | null = null
    const live = () => focusedRef.current && socketStateRef.current === 'connected'
    const sync = () => {
      trailing = null
      if (!live()) return
      lastDirtySyncRef.current = Date.now()
      void runSync()
    }
    const unsub = subscribeDirtyDomains((domain) => {
      if (domainsRef.current.length > 0 && !domainsRef.current.includes(domain)) return
      // Same millisecond as the sync just started: its read leaves after this task, so it already covers this mark (often the same mark naming another domain).
      if (!live() || trailing || lastDirtySyncRef.current === Date.now()) return
      const wait = lastDirtySyncRef.current + DIRTY_SYNC_MIN_MS - Date.now()
      if (wait <= 0) sync()
      else trailing = setTimeout(sync, wait)
    })
    return () => {
      unsub()
      if (trailing) clearTimeout(trailing)
    }
  }, [domainsRef, enabled, runSync, syncOnDirty])

  return socketStatus
}
