/* global jest */
// Reanimated 4 runs its animations on react-native-worklets, whose JS entry
// calls into a native module at import time. Jest has no native side, so any
// test that imports a module importing Reanimated dies before its first line
// ("Cannot read properties of undefined (reading 'loadUnpackers')") — even a
// test that only reads a pure function out of that module. The package ships
// this mock for exactly that.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))
