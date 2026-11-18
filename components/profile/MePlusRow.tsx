import { Platform } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'

import { plusRowLine, showsPlus } from '../../lib/mePlus'
import { openPaywall } from '../../lib/paywall'
import { usePlusStatus } from '../../lib/plus'
import { useMonthlyPrice } from '../../lib/useMonthlyPrice'
import { SettingsGroup, SettingsRow } from '../ds/SettingsRow'

const DEVICE: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios'

/**
 * "Blend'n+" on Me (Flow 14 R4.1 · Me 01 to 03): one row under who you are that says where you stand and goes where Settings'
 * Blend'n+ row goes (Manage for somebody who has something to manage, the page otherwise). Only where it is sold (`showsPlus`):
 * an ungated city has no row at all. Never a banner, never a nag: the line is the price, the renewal, or nothing. "Passes & offers" joins it when Flow 13 does.
 */
export function MePlusRow() {
  const { status, refresh } = usePlusStatus()
  // Back from Manage or the paywall: where you stand is read again.
  useFocusEffect(useCallback(() => refresh(), [refresh]))
  const price = useMonthlyPrice(!!status && !status.active && status.gated)
  const line = plusRowLine(status, price, DEVICE)
  if (!showsPlus(status)) return null
  return (
    <SettingsGroup>
      <SettingsRow
        testID="me-plus-row"
        icon="sparkles"
        title="Blend’n+"
        hint={line ?? undefined}
        trail="chevron"
        onPress={() => void openPaywall('profile', { userInitiated: true })}
      />
    </SettingsGroup>
  )
}
