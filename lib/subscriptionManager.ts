import { Logger } from './logger'

interface SubscriptionConfig {
  id: string
  table: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
  callback: (payload: any) => void
  schema?: string
}

class SubscriptionManager {
  private subscriptions = new Map<string, SubscriptionConfig>()
  private activeSubscriptionIds = new Set<string>()

  /**
   * Create a new realtime subscription with automatic cleanup.
   * Supabase realtime has been removed, so this is a no-op stub.
   */
  subscribe(config: SubscriptionConfig): string {
    const { id, table, event = '*', filter } = config

    // Unsubscribe existing subscription with same ID
    this.unsubscribe(id)

    Logger.info('realtime', 'Realtime disabled; subscription ignored', { id, table, event, filter })

    this.subscriptions.set(id, config)
    this.activeSubscriptionIds.add(id)

    return id
  }

  /**
   * Unsubscribe from a specific subscription
   */
  unsubscribe(subscriptionId: string): boolean {
    if (!this.subscriptions.has(subscriptionId)) {
      return false
    }

    Logger.debug('realtime', 'Realtime disabled; unsubscribed stub', { subscriptionId })

    this.subscriptions.delete(subscriptionId)
    this.activeSubscriptionIds.delete(subscriptionId)

    return true
  }

  /**
   * Unsubscribe from all subscriptions
   */
  unsubscribeAll(): void {
    Logger.debug('realtime', `Realtime disabled; clearing ${this.subscriptions.size} subscriptions`)

    this.subscriptions.clear()
    this.activeSubscriptionIds.clear()
  }

  /**
   * Get active subscription count
   */
  getActiveCount(): number {
    return this.activeSubscriptionIds.size
  }

  /**
   * Get list of active subscription IDs
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.activeSubscriptionIds)
  }

  /**
   * Check if a subscription is active
   */
  isActive(subscriptionId: string): boolean {
    return this.activeSubscriptionIds.has(subscriptionId)
  }

  /**
   * Cleanup inactive subscriptions
   */
  cleanup(): void {
    if (this.subscriptions.size === 0) return

    Logger.info('realtime', 'Realtime disabled; cleanup clears all subscriptions')
    this.unsubscribeAll()
  }
}

// Global subscription manager instance
export const subscriptionManager = new SubscriptionManager()

/**
 * React hook for managing component-specific subscriptions
 */
export function useRealtimeSubscription(
  config: SubscriptionConfig | null,
  deps: React.DependencyList = []
) {
  const React = require('react')

  React.useEffect(() => {
    if (!config) return

    const subscriptionId = subscriptionManager.subscribe(config)

    // Cleanup on unmount or deps change
    return () => {
      subscriptionManager.unsubscribe(subscriptionId)
    }
  }, deps)

  // Cleanup all subscriptions on unmount
  React.useEffect(() => {
    return () => {
      // Final cleanup in case individual unsubscribe didn't work
      if (config?.id) {
        subscriptionManager.unsubscribe(config.id)
      }
    }
  }, [])
}
