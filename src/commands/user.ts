import { getUser } from "../python/user.ts";

export async function user(argv: {
  user?: string;
}) {
  await getUser(argv);
}