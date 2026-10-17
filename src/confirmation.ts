import { fail } from "./errors.ts";

export type ConfirmationIO = {
  interactive: () => boolean;
  readAnswer: () => Promise<string>;
  print: (message: string) => void;
  prompt: (message: string) => void;
  fail: typeof fail;
};

async function readAnswer(): Promise<string> {
  const reader = Bun.stdin.stream().getReader();
  try {
    const { value } = await reader.read();
    return new TextDecoder().decode(value).trim();
  } finally {
    reader.releaseLock();
  }
}

export const confirmationIO: ConfirmationIO = {
  interactive: () => Boolean(process.stdin.isTTY), readAnswer,
  print: (message) => console.log(message), prompt: (message) => { process.stdout.write(message); }, fail,
};

export function requireInteractiveConfirmation(io = confirmationIO): boolean {
  if (io.interactive()) return true;
  io.fail("This action requires confirmation in an interactive terminal.");
  return false;
}

export async function confirmAction(description: string, expectedAnswer = "yes", io = confirmationIO): Promise<boolean> {
  if (!requireInteractiveConfirmation(io)) return false;
  // Preserve line breaks, but do not allow terminal controls to hide the target.
  io.print(description.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, " "));
  io.prompt(`Type "${expectedAnswer}" to continue: `);
  try {
    if ((await io.readAnswer()).trim() === expectedAnswer) return true;
  } catch {
    // EOF, an interrupted terminal, and read errors all cancel safely.
  }
  io.fail("Action cancelled.");
  return false;
}
