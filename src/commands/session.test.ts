import { expect, mock, spyOn, test } from "bun:test";
import { sessionWithDependencies } from "./session.ts";

test.each([
  { payload: {}, expected: "invalid session response" },
  { payload: { user: null }, expected: "Not logged in." },
  { payload: { user: { username: "active_user" } }, expected: "Username: active_user" },
])("session reports malformed, anonymous, and authenticated responses distinctly", async ({ payload, expected }) => {
  const fail = mock(() => {});
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    await sessionWithDependencies({
      loadConfig: async () => ({ scratchsessionsid: "private-session" }),
      fetch: async () => Response.json(payload), fail,
    });
    if (expected === "invalid session response") {
      expect(fail).toHaveBeenCalledWith("Scratch returned an invalid session response.");
      expect(output).not.toHaveBeenCalledWith("Not logged in.");
    } else {
      expect(fail).not.toHaveBeenCalled();
      expect(output).toHaveBeenCalledWith(expected);
    }
  } finally { output.mockRestore(); }
});
