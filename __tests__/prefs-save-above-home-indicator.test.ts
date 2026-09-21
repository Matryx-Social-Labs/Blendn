import { readFileSync } from 'fs'
import { join } from 'path'

/*
 * The event-preferences Save button clears the home indicator (SCRUM-201).
 * Driven on an iPhone 17 Pro: with three intent cards the button's frame ran
 * to y=868 of 874, and taps on its centre went to the system. Every other
 * screen uses the library SafeAreaView; this one used react-native's.
 */
const src = readFileSync(join(__dirname, '..', 'app', 'event-preferences', '[eventId].tsx'), 'utf8')

it('uses the safe-area-context SafeAreaView, not react-native\'s', () => {
  expect(src).toContain("import { SafeAreaView } from 'react-native-safe-area-context'")
  const rnImport = src.slice(src.indexOf('import {'), src.indexOf("} from 'react-native'"))
  expect(rnImport).not.toMatch(/\bSafeAreaView\b/)
})
