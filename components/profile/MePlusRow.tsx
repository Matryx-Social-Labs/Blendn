import { Platform } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'

import { mePlusLine } from '../../lib/mePlus'
import { openPaywall } from '../../lib/paywall'
import { usePlusStatus } from '../../lib/plus'
import { PLUS_FREE_SHEET } from '../../lib/plusFree'
import { showSheet } from '../../lib/sheet'
import { useMonthlyPrice } from '../../lib/useMonthlyPrice'
import { SettingsGroup, SettingsRow } from '../ds/SettingsRow'

const DEVICE: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios'

/**
 * "Blend'n+" on Me (Flow 14 R4.1 · Me 01 to 03): one row under who you are that says where you stand and goes where Settings'
 * Blend'n+ row goes (Manage for somebody who has something to manage, the page otherwise; the free-launch sheet where nothing is
 * sold). Never a banner, never a nag: the line is the price, the renewal, or nothing. "Passes & offers" joins it when Flow 13 does.
 */
export function MePlusRow() {
  const { status, refresh } = usePlusStatus()
  // Back from Manage or the paywall: where you stand is read again.
  useFocusEffect(useCallback(() => refresh(), [refresh]))
  const price = useMonthlyPrice(!!status && !status.active && status.gated)
  const line = mePlusLine(status, price, DEVICE)
  return (
    <SettingsGroup>
      <SettingsRow
        testID="me-plus-row"
        icon="sparkles"
        title="Blend’n+"
        hint={line.hint ?? undefined}
        trail="chevron"
        onPress={line.free ? () => showSheet(PLUS_FREE_SHEET) : () => void openPaywall('profile', { userInitiated: true })}
      />
    </SettingsGroup>
  )
}
