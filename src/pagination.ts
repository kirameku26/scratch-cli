import { fail } from "./errors.ts";

export function pageOffset(limit: number, offset = 0, page = 1): number | undefined {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 40) {
    fail("Limit must be an integer between 1 and 40."); return;
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    fail("Offset must be a non-negative integer."); return;
  }
  if (!Number.isSafeInteger(page) || page < 1) {
    fail("Page must be a positive integer."); return;
  }
  const result = offset + (page - 1) * limit;
  if (!Number.isSafeInteger(result)) { fail("Page and offset exceed the safe pagination range."); return; }
  return result;
}
