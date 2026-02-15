import * as Haptics from 'expo-haptics'
import { useCallback } from 'react'

export function useInteractionFeedback() {
  const tap = useCallback(() => {
    Haptics.selectionAsync().catch(() => {})
  }, [])

  const success = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  }, [])

  const warning = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }, [])

  const error = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
  }, [])

  return { tap, success, warning, error }
}
