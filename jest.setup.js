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
  return { __esModule: true, default: Purchases, PURCHASES_ERROR_CODE: { PAYMENT_PENDING_ERROR: '20' } }
})
