/* global jest */
// Reanimated 4 runs its animations on react-native-worklets, whose JS entry
// calls into a native module at import time. Jest has no native side, so any
// test that imports a module importing Reanimated dies before its first line
// ("Cannot read properties of undefined (reading 'loadUnpackers')") — even a
// test that only reads a pure function out of that module. The package ships
// this mock for exactly that.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))
// Same for gesture handler: `GestureHandlerRootView` installs a native module on
// mount. `ActionTray` carries one (a Modal is its own native root), so every
// screen that draws a tray needs the package's own mock to render in a test.
require('react-native-gesture-handler/jestSetup')
// RevenueCat (Blendn+, step 11) is a native module with no JS side under Jest.
// Every call resolves to "nothing bought, nobody known"; a test that cares
// replaces the function it needs (`__tests__/purchases.test.ts`).
jest.mock('react-native-purchases', () => {
  const Purchases = {
    configure: jest.fn(),
    logIn: jest.fn(async () => ({ customerInfo: {}, created: false })),
    logOut: jest.fn(async () => ({})),
    isAnonymous: jest.fn(async () => true),
    getAppUserID: jest.fn(async () => '$RCAnonymousID:test'),
    getOfferings: jest.fn(async () => ({ current: null, all: {} })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(async () => ({ entitlements: { active: {} }, activeSubscriptions: [] })),
    getCustomerInfo: jest.fn(async () => ({ managementURL: null })),
  }
  // The SDK's own codes (purchases-typescript-internal, generated/error-codes).
  const PURCHASES_ERROR_CODE = {
    PURCHASE_CANCELLED_ERROR: '1',
    PURCHASE_NOT_ALLOWED_ERROR: '3',
    PRODUCT_ALREADY_PURCHASED_ERROR: '6',
    RECEIPT_ALREADY_IN_USE_ERROR: '7',
    NETWORK_ERROR: '10',
    PAYMENT_PENDING_ERROR: '20',
  }
  return { __esModule: true, default: Purchases, PURCHASES_ERROR_CODE }
})

// The in-app browser (expo-web-browser) is native; every call resolves as if it opened and was dismissed.
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
}))

// The keyboard's frame is native; the package ships its own mock (plain Views, a no-op provider).
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'))

// AsyncStorage is native. Screens that only reach it through `lib/pushAsk` (a like, an RSVP) should load without each
// test mocking it; a test that cares mocks it itself and wins.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

// iOS and Android call a Modal's `onShow` once it is on screen; React Native's test Modal never does. The Modal turn
// (lib/modalTurn) takes a Modal that never says so for one iOS refused, so here it says so as it is drawn, as a phone
// does. A test that wants a refusal mocks the Modal itself (`__tests__/sheetOneAtATime.test.tsx`).
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react')
  const Base = jest.requireActual('@react-native/jest-preset/jest/mocks/Modal').default
  function Modal(props) {
    const onShow = React.useRef(props.onShow)
    onShow.current = props.onShow
    const shown = props.visible !== false
    React.useEffect(() => {
      if (shown) onShow.current?.()
    }, [shown])
    return React.createElement(Base, props)
  }
  return { __esModule: true, default: Modal }
})

// The OS's time zone: expo-localization's native `getCalendars`, which `lib/time` reads for every "phone's time" (never
// the engine's default, which Hermes caches). Under Jest it is `process.env.TZ` — Jest does not pass an assignment of it
// to the engine — so a test moves the phone with `process.env.TZ = …` then `refreshPhoneZone()`; unset, the engine's.
globalThis.expo = globalThis.expo ?? {}
globalThis.expo.modules = globalThis.expo.modules ?? {}
globalThis.expo.modules.ExpoLocalization = {
  getCalendars: () => [{ calendar: 'gregory', timeZone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone, uses24hourClock: false, firstWeekday: 1 }],
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US', textDirection: 'ltr' }],
}
