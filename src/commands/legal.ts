import { fail } from "../errors.ts";

export const LEGAL_DOCUMENTS = ["community-guidelines", "terms"] as const;

export async function legal(argv: { document: string }): Promise<void> {
  if (!LEGAL_DOCUMENTS.includes(argv.document as typeof LEGAL_DOCUMENTS[number])) {
    fail(`Document must be one of: ${LEGAL_DOCUMENTS.join(", ")}.`);
    return;
  }
  if (argv.document === "community-guidelines") {
    console.log("Scratch Community Guidelines");
    console.log("https://scratch.mit.edu/community_guidelines/");
  } else {
    console.log("Scratch Terms of Service");
    console.log("https://mitscratch.freshdesk.com/en/support/solutions/articles/4000219182-scratch-terms-of-service");
  }
}
