import { render, screen } from "@testing-library/react-native"
import { Text, Pressable } from "react-native"

/**
 * The app can render a component in a test. It could not before this.
 *
 * Forty-eight suites existed and none of them mounted anything: the runner was
 * `testEnvironment: "node"` and the comment in `jest.config.js` predicted that
 * component tests "will need jsdom back". **They do not**, and the reason is
 * worth writing down because it cost an hour to find and would cost it again.
 *
 * React Native does not render to a DOM. It renders through
 * `react-test-renderer`, which is pure JavaScript, so a browser environment
 * buys nothing here. What actually blocked it is that **RNTL v14's `render` is
 * async** — React 19's concurrent renderer — and a missing `await` returns a
 * Promise whose queries are all `undefined`. The symptom is
 * `getByText is not a function`, which reads as a broken environment rather
 * than a missing keyword, and sends you looking for jsdom.
 *
 * So: no jsdom, no second jest project, no `testEnvironment` override. Just
 * `await`. This file exists to keep that true — if somebody adds jsdom to make
 * rendering work, this test already passes without it.
 */
describe("the render harness", () => {
  it("mounts a component under testEnvironment: node", async () => {
    await render(<Text>hello</Text>)
    expect(screen.getByText("hello")).toBeTruthy()
  })

  it("queries accessibility props, which every UI stage's criteria need", async () => {
    /*
     * The per-stage accessibility criteria are assertions about labels and
     * roles. Without a renderer they are unwritable, which is why ~260
     * unlabelled controls accumulated with nothing failing.
     */
    await render(<Pressable accessibilityLabel="Close" accessibilityRole="button" />)
    expect(screen.getByLabelText("Close")).toBeTruthy()
    expect(screen.getByRole("button")).toBeTruthy()
  })
})
