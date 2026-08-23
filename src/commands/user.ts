import { getLoggedInUser } from "../python/user.ts";

export async function user(argv: {
  user?: string;
}) {
  await getLoggedInUser(argv);
}