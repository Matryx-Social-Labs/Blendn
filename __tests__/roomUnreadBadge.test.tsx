/**
 * The disc's unread badge (Flow 4 T3), driven through the real tab layout: checked in to a room, the bar
 * reads the chat list's `unreadCount` for that event and the disc says so. The server's count and nothing
 * else: a message on the socket changes nothing until the next read.
 */
import React from "react";
import { View } from "react-native";
import {
  act,
  cleanup,
  renderRouter,
  screen,
} from "expo-router/testing-library";

const mockGroups = jest.fn();
const mockFeed = jest.fn();
let mockAuthUser: { id: string; profile: { photos: string[] } } | null = null;
jest.mock("../lib/useAuth", () => ({
  ...jest.requireActual("../lib/useAuth"),
  useAuth: () => ({ user: mockAuthUser }),
}));
jest.mock("../lib/useRoomSignalSource", () => ({ useRoomSignalSource: () => {} }));
jest.mock("../lib/apiClient", () => ({
  apiClient: {
    getCurrentUser: jest.fn(async () => null),
    getProfile: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({
      success: true,
      data: { checkIns: [{ eventId: "e1", event: { title: "Vinyl Night" } }] },
    })),
    getChatGroups: (...a: unknown[]) => mockGroups(...a),
    getNotifications: (...a: unknown[]) => mockFeed(...a),
  },
}));
jest.mock("../lib/checkIn", () => ({
  subscribeCheckInChanged: () => () => {},
}));
jest.mock("../lib/coachMarks", () => ({
  useCoachMark: () => ({ visible: false, dismiss: () => {} }),
  markCoachUsed: () => {},
}));
jest.mock("../components/blendn/BlendnScreen", () => ({
  BlendnScreen: () => null,
}));
const mockSubscribeMessage = jest.fn(() => () => {});
jest.mock("../lib/socketClient", () => ({
  subscribeToChatMessage: (...a: unknown[]) =>
    mockSubscribeMessage(...(a as [])),
  subscribeToRoomWave: () => () => {},
  subscribeToBell: () => () => {},
  subscribeToUserNotifications: () => () => {},
}));

{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mocked = require("react-native-reanimated");
  const actual = jest.requireActual("react-native-reanimated");
  for (const k of Object.keys(actual))
    if (!(k in mocked)) mocked[k] = actual[k];
  mocked.makeMutable = actual.makeMutable;
}

const stub = () =>
  function Stub() {
    return <View />;
  };

async function renderBar() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TabLayout = require("../app/(tabs)/_layout").default;
  const r = renderRouter(
    {
      "(tabs)/_layout": TabLayout,
      "(tabs)/events": stub(),
      "(tabs)/going": stub(),
      "(tabs)/chat": stub(),
      "(tabs)/profile": stub(),
    },
    { initialUrl: "/events" },
  );
  await r;
  // The poll's answers are promises: let them land (the bar reads the room, then the room's unread).
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
  }
}

beforeEach(() => {
  mockAuthUser = null;
  mockFeed.mockResolvedValue({ success: true, data: { unreadCount: 0, badgeCount: 0 } });
});

afterEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../lib/inboxBadge").resetInboxBadge();
  await cleanup();
  jest.useRealTimers();
});

describe("the disc’s unread badge", () => {
  it("says the server’s count for the room you are in", async () => {
    mockGroups.mockResolvedValue({
      success: true,
      data: [{ id: "g1", unreadCount: 3, event: { id: "e1" } }],
    });
    await renderBar();
    expect(
      screen.getByLabelText("Open the room. 3 unread messages"),
    ).toBeTruthy();
  });

  it("no unread: just the room", async () => {
    mockGroups.mockResolvedValue({
      success: true,
      data: [{ id: "g1", unreadCount: 0, event: { id: "e1" } }],
    });
    await renderBar();
    expect(screen.getByLabelText("Open the room")).toBeTruthy();
  });

  it("listens to no chat: a message is counted by the server or not at all", async () => {
    mockGroups.mockResolvedValue({
      success: true,
      data: [{ id: "g1", unreadCount: 1, event: { id: "e1" } }],
    });
    await renderBar();
    expect(mockSubscribeMessage).not.toHaveBeenCalled();
  });
});

describe("the tab bar’s own faces, through the real layout (M11)", () => {
  const room = () =>
    mockGroups.mockResolvedValue({ success: true, data: [{ id: "g1", unreadCount: 0, event: { id: "e1" } }] });
  const has = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });

  it("Me wears the signed-in user’s session photo", async () => {
    room();
    mockAuthUser = { id: "u1", profile: { photos: ["https://x/me.jpg"] } };
    await renderBar();
    expect(has("tabs-me-avatar")).toBeTruthy();
  });

  it("Me is the glyph for a user with no photo", async () => {
    room();
    mockAuthUser = { id: "u1", profile: { photos: [] } };
    await renderBar();
    expect(has("tabs-me-avatar")).toBeNull();
  });

  it("Banter shows the dot and says how many from the feed’s counts (badgeCount − unreadCount)", async () => {
    room();
    mockFeed.mockResolvedValue({ success: true, data: { unreadCount: 1, badgeCount: 4 } });
    await renderBar();
    expect(has("tabs-banter-dot")).toBeTruthy();
    expect(screen.getByLabelText("Banter, 3 new")).toBeTruthy();
  });

  it("Banter has no dot when nothing is unread", async () => {
    room();
    await renderBar();
    expect(has("tabs-banter-dot")).toBeNull();
  });
});
