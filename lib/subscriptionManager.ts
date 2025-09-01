import { RealtimeChannel } from '@supabase/supabase-js'
import { Logger } from './logger'
import { supabase } from './supabase'

interface SubscriptionConfig {
  id: string
  table: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
  callback: (payload: any) => void
  schema?: string
}

class SubscriptionManager {
  private subscriptions = new Map<string, RealtimeChannel>()
  private activeSubscriptionIds = new Set<string>()

  /**
   * Create a new realtime subscription with automatic cleanup
   */
  subscribe(config: SubscriptionConfig): string {
    const { id, table, event = '*', filter, callback, schema = 'public' } = config

    // Unsubscribe existing subscription with same ID
    this.unsubscribe(id)

    try {
      Logger.debug('realtime', `Creating subscription: ${id}`, { table, event, filter })

      const channel = supabase
        .channel(`subscription_${id}`)
        .on(
          'postgres_changes' as any,
          {
            event,
            schema,
            table,
            ...(filter ? { filter } : {})
          },
          (payload: any) => {
            try {
              Logger.debug('realtime', `Received event for ${id}`, { 
                event: payload.eventType,
                table: payload.table 
              })
              callback(payload)
            } catch (error) {
              Logger.error('realtime', `Callback error for subscription ${id}`, { error })
            }
          }
        )
        .subscribe((status) => {
          Logger.debug('realtime', `Subscription ${id} status: ${status}`)
          
          if (status === 'SUBSCRIBED') {
            this.activeSubscriptionIds.add(id)
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            this.activeSubscriptionIds.delete(id)
            this.subscriptions.delete(id)
          }
        })

      this.subscriptions.set(id, channel)
      
      return id
    } catch (error) {
      Logger.error('realtime', `Failed to create subscription ${id}`, { error })
      throw error
    }
  }

  /**
   * Unsubscribe from a specific subscription
   */
  unsubscribe(subscriptionId: string): boolean {
    const channel = this.subscriptions.get(subscriptionId)
    
    if (!channel) {
      return false
    }

    try {
      Logger.debug('realtime', `Unsubscribing from: ${subscriptionId}`)
      
      supabase.removeChannel(channel)
      this.subscriptions.delete(subscriptionId)
      this.activeSubscriptionIds.delete(subscriptionId)
      
      return true
    } catch (error) {
      Logger.error('realtime', `Failed to unsubscribe from ${subscriptionId}`, { error })
      return false
    }
  }

  /**
   * Unsubscribe from all subscriptions
   */
  unsubscribeAll(): void {
    Logger.debug('realtime', `Unsubscribing from ${this.subscriptions.size} subscriptions`)
    
    for (const [id] of this.subscriptions) {
      this.unsubscribe(id)
    }
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
    const toRemove: string[] = []
    
    for (const [id, channel] of this.subscriptions) {
      // Check if channel is still active
      try {
        if (!this.activeSubscriptionIds.has(id)) {
          toRemove.push(id)
        }
      } catch (error) {
        Logger.warn('realtime', `Channel ${id} appears to be stale`, { error })
        toRemove.push(id)
      }
    }

    for (const id of toRemove) {
      this.unsubscribe(id)
    }

    if (toRemove.length > 0) {
      Logger.info('realtime', `Cleaned up ${toRemove.length} stale subscriptions`)
    }
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

// Cleanup on app background/foreground
if (typeof window !== 'undefined') {
  const cleanup = () => {
    Logger.info('realtime', 'App backgrounded, cleaning up subscriptions')
    subscriptionManager.cleanup()
  }
  
  // Listen for visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cleanup()
    }
  })
}