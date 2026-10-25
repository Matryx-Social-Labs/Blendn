/**
 * The app's first test runner.
 *
 * There was none: no `test` script, no jest, no test directory, and eleven PRs
 * shipped in a week verified by a typecheck and a simulator. The typecheck
 * caught real bugs — it is why `scripts/typecheck.sh` exists — but it cannot
 * tell you that a function returns the wrong answer, and two of those PRs
 * shipped one that did.
 *
 * `jest-expo` rather than a bare babel-jest setup, because it is the preset
 * Expo supports and it already knows how to transform `react-native` and the
 * dozens of `expo-*` packages that any screen import drags in. A hand-rolled
 * `transformIgnorePatterns` works until the first import that needs a new entry,
 * and then fails with a syntax error in someone else's node_modules.
 *
 * ## What is tested, and what is not
 *
 * Pure logic only, for now. Screens are about to be redesigned against the
 * Figma, so component snapshots would be written to be deleted. The modules
 * covered here are the ones the next four PRs *depend* on being right: the
 * match band and its sentence, the category flattening that made
 * `user_interests` empty in production, and the distance helper whose
 * kilometre-versus-metre confusion once enabled a check-in button a kilometre
 * from the venue.
 */
module.exports = {
  preset: "jest-expo",
  /*
   * Node, not jsdom.
   *
   * `jest-expo` defaults to a jsdom environment, which pulls in `jsdom` and
   * with it three packages npm reports as deprecated — `abab`,
   * `domexception` and `whatwg-encoding`, all shimming browser APIs that
   * exist natively now. Nothing in `__tests__` renders a component or touches
   * a DOM: these are pure functions over data. Paying for a browser
   * environment to test `getDistanceMetres` is the definition of carrying
   * weight for nothing.
   *
   * Component tests arrived and did NOT need jsdom back — this comment used to
   * predict they would. React Native renders through `react-test-renderer`,
   * which is pure JavaScript, so there is no DOM to provide. What blocks a
   * render here is a missing `await`: RNTL v14's `render` is async, and the
   * Promise it returns has `undefined` for every query, which reads as a broken
   * environment. See `__tests__/renderHarness.test.tsx`.
   */
  testEnvironment: "node",
  // Only `__tests__`. `jest-expo`'s default also sweeps `**/*.test.ts` anywhere,
  // which would pick up files inside `node_modules/**/__tests__` on some
  // packages and fail for reasons that have nothing to do with this app.
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.after.js"],
  // Satoshi is gitignored (licence: never in this public repo), so CI and a
  // fresh clone have no file to resolve. Tests need its name, not its glyphs.
  moduleNameMapper: {
    "/assets/fonts/satoshi/.+\\.otf$": "<rootDir>/__mocks__/fontAsset.js",
  },
  clearMocks: true,
  /*
   * 30 s a test, not jest's 5.
   *
   * The suites that flaked under load (onboardingReady, useCheckInFlow, dsAchievementBadge, roomVisibility, tabScrollToTop…)
   * have no real timer in them: two already run on fake timers and two wait on nothing. What failed was the FIRST test in a
   * file, which pays for transforming the whole import graph of a screen, and on a busy machine that alone passes 5 s.
   * Every one of them passes alone. A longer ceiling takes the machine's load out of the verdict without touching what a
   * test asserts; a test that really hangs still fails, 30 s later.
   */
  testTimeout: 30000,
}
