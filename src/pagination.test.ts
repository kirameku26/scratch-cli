import { expect, spyOn, test } from "bun:test";
import { pageOffset } from "./pagination.ts";

test("pages advance by the displayed count and preserve a base offset", () => {
  expect(pageOffset(10)).toBe(0);
  expect(pageOffset(10, 0, 3)).toBe(20);
  expect(pageOffset(20, 5, 2)).toBe(25);
  expect(pageOffset(40, 7, 1)).toBe(7);
});

test.each([
  [0, 0, 1], [41, 0, 1], [10, -1, 1], [10, 0, 0], [10, 0, 1.5],
  [10, 0, Infinity], [40, 0, Number.MAX_SAFE_INTEGER], [10, Number.MAX_SAFE_INTEGER, 2],
])("rejects invalid or overflowing pagination", (limit, offset, page) => {
  const original = process.exitCode;
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(pageOffset(limit!, offset!, page!)).toBeUndefined();
    expect(process.exitCode).toBe(1);
  } finally { error.mockRestore(); process.exitCode = original ?? 0; }
});
