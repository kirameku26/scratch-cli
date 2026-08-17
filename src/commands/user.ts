import { getLoggedInUser } from "../python/user.ts";

export async function user() {
  await getLoggedInUser();
}