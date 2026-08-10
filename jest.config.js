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
  // Only `__tests__`. `jest-expo`'s default also sweeps `**/*.test.ts` anywhere,
  // which would pick up files inside `node_modules/**/__tests__` on some
  // packages and fail for reasons that have nothing to do with this app.
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  clearMocks: true,
}
