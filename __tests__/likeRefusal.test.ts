import { likeRefusal } from "../lib/likeRefusal"

/**
 * A refused like says something, and what it says is never about them.
 *
 * Before this, `likeStateAfter({ ok: false })` returned `undefined`, the row
 * was deleted, and the heart reverted in silence. The two refusals that
 * actually occur — a lapsed check-in, and the rate limiter in a busy room —
 * were both invisible, on the mechanic the whole product rests on.
 */
describe("a refused like", () => {
  it("says something at all", () => {
    for (const code of [undefined, "FORBIDDEN", "RATE_LIMITED", "NOT_CHECKED_IN", "WHATEVER"]) {
      expect(likeRefusal(code, undefined).message.trim().length).toBeGreaterThan(0)
    }
  })

  it("never implies anything reached the other person", () => {
    /*
     * The one rule. A like is private until it is mutual, so a refusal that
     * said "they did not accept" or "your like was declined" would invent a
     * rejection the product exists to prevent — and would be a lie besides.
     */
    const forbidden = /reject|declin|refus|turned you down|not interested|they /i
    for (const code of [undefined, "FORBIDDEN", "RATE_LIMITED", "NOT_CHECKED_IN"]) {
      expect(likeRefusal(code, undefined).message).not.toMatch(forbidden)
    }
  })

  it("treats a lapsed check-in as information, not an error", () => {
    // Auto-checkout makes this ordinary: step outside, come back, likes stop.
    expect(likeRefusal("FORBIDDEN", "Check in before liking anyone here").variant).toBe("info")
    expect(likeRefusal("NOT_CHECKED_IN", undefined).variant).toBe("info")
  })

  it("does not shout at somebody for liking quickly", () => {
    const r = likeRefusal("RATE_LIMITED", "Too many requests, please retry later")
    expect(r.variant).toBe("info")
    // API copy is written for a caller, not for somebody enjoying themselves.
    expect(r.message).not.toMatch(/too many requests/i)
  })

  it("passes the server's sentence through when it has one", () => {
    expect(likeRefusal("FORBIDDEN", "Check in before liking anyone here").message).toBe(
      "Check in before liking anyone here"
    )
    expect(likeRefusal("SOMETHING_NEW", "A reason from a newer server").message).toBe(
      "A reason from a newer server"
    )
  })

  it("falls back to a sentence when the server sends none", () => {
    expect(likeRefusal(undefined, undefined).message).toMatch(/try again/i)
    expect(likeRefusal(undefined, "  ").message).toMatch(/try again/i)
  })
})

describe("the Grid tells you when a like was refused", () => {
  const { readFileSync } = require("fs")
  const { join } = require("path")
  const code = readFileSync(
    join(__dirname, "..", "components", "screens", "MatchScreen.tsx"),
    "utf8"
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

  it("surfaces the refusal instead of reverting in silence", () => {
    expect(code).toContain("likeRefusal(result.errorCode, result.error)")
    expect(code).toMatch(/showToast\(refusal\.message, refusal\.variant\)/)
  })

  it("keeps it a toast, not a tray", () => {
    /*
     * The mechanic only works if liking feels free. A modal after every failed
     * tap is what makes it expensive — the same argument `ConnectionSheet`
     * makes for being a sheet rather than the frame's full-screen takeover.
     */
    const like = code.slice(code.indexOf("likeAtEvent"), code.indexOf("likeAtEvent") + 1800)
    expect(like).not.toMatch(/showTray|ActionTray|Alert\.alert/)
  })
})
