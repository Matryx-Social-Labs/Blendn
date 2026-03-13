import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDirtyDomains, hasDirtyDomain, LiveSyncDomain, subscribeDirtyDomains } from './liveSyncState'
import { getConnectionStatus, SocketConnectionStatus, subscribeConnectionStatus } from './socketClient'

interface UseLiveSyncOptions {
  enabled?: boolean
  onSync: () => void | Promise<void>
  domains?: LiveSyncDomain[]
  connectedIntervalMs?: number
  disconnectedIntervalMs?: number
  maxDisconnectedIntervalMs?: number
  syncOnFocus?: boolean
  syncOnReconnect?: boolean
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
  } = options

  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>(() => getConnectionStatus())
  const lastSocketStateRef = useRef(socketStatus.state)
  const socketStateRef = useRef(socketStatus.state)
  const onSyncRef = useRef(onSync)
  const domainsRef = useRef(domains)
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)

  // Update refs synchronously so stale closures always see current values
  onSyncRef.current = onSync
  domainsRef.current = domains

  const runSync = useCallback(async () => {
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
        void runSync()
      }
    }
  }, [enabled])

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
      enabled,
      maxDisconnectedIntervalMs,
      runSync,
      syncOnFocus,
    ])
  )

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
    if (enabled && syncOnReconnect && socketStatus.state === 'connected' && previousState !== 'connected') {
      void runSync()
    }
    lastSocketStateRef.current = socketStatus.state
    socketStateRef.current = socketStatus.state
  }, [enabled, runSync, socketStatus.state, syncOnReconnect])

  useEffect(() => {
    if (!enabled) return () => {}
    const unsub = subscribeDirtyDomains((domain) => {
      if (domainsRef.current.length > 0 && !domainsRef.current.includes(domain)) return
      if (socketStateRef.current === 'connected') {
        void runSync()
      }
    })
    return () => {
      unsub()
    }
  }, [enabled, runSync])

  return socketStatus
}
