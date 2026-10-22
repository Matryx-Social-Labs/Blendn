import { readFileSync } from 'fs'
import { join } from 'path'

/*
 * The event-preferences Save button clears the home indicator (SCRUM-201).
 * Driven on an iPhone 17 Pro: with three intent cards the button's frame ran
 * to y=868 of 874, and taps on its centre went to the system. Save now lives in
 * the design system's Dock, which pads by the bottom inset itself; the screen
 * must not go back to react-native's own SafeAreaView.
 */
const src = readFileSync(join(__dirname, '..', 'app', 'event-preferences', '[eventId].tsx'), 'utf8')
const dock = readFileSync(join(__dirname, '..', 'components', 'ds', 'Dock.tsx'), 'utf8')

it('docks Save in the Dock, which clears the bottom inset', () => {
  expect(src).toContain("import { Dock } from '../../components/ds/Dock'")
  expect(dock).toContain('insets.bottom')
  expect(dock).toContain("from 'react-native-safe-area-context'")
})

it("never uses react-native’s SafeAreaView", () => {
  const rnImport = src.slice(src.indexOf('import {'), src.indexOf("} from 'react-native'"))
  expect(rnImport).not.toMatch(/\bSafeAreaView\b/)
})
