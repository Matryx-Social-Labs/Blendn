import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { BackHandler } from 'react-native'

/**
 * Android's hardware back, answered only while this screen is the focused one.
 *
 * For anything mounted under the root stack that stays mounted when a screen is pushed over it (the Room overlay):
 * a bare `useEffect` keeps its handler registered ahead of the root's, so back acts on what is hidden underneath.
 * Return `true` to say it was handled.
 */
export function useFocusedBackHandler(onBack: () => boolean): void {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack)
      return () => sub.remove()
    }, [onBack])
  )
}
