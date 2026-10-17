import { expect, mock, test } from "bun:test";
import { confirmAction, type ConfirmationIO } from "./confirmation.ts";

function io(answer = "yes"): ConfirmationIO {
  return {
    interactive: mock(() => true), readAnswer: mock(async () => answer),
    print: mock(() => {}), prompt: mock(() => {}), fail: mock(() => {}),
  };
}

test("confirmation shows the target and requires the exact answer", async () => {
  for (const answer of ["yes", " yes\n", "no", "", "YES"]) {
    const input = io(answer);
    expect(await confirmAction("Account: active_user\nAction: create", "yes", input)).toBe(answer.trim() === "yes");
    expect(input.print).toHaveBeenCalledWith("Account: active_user\nAction: create");
    expect(input.prompt).toHaveBeenCalledWith('Type "yes" to continue: ');
  }
});

test("high impact actions require their specific confirmation phrase", async () => {
  expect(await confirmAction("Delete", "delete active_user", io("yes"))).toBe(false);
  expect(await confirmAction("Delete", "delete active_user", io("delete active_user"))).toBe(true);
});

test("noninteractive input fails without reading or printing the operation", async () => {
  const input = io();
  input.interactive = () => false;
  expect(await confirmAction("Account: active_user", "yes", input)).toBe(false);
  expect(input.readAnswer).not.toHaveBeenCalled();
  expect(input.print).not.toHaveBeenCalled();
  expect(input.fail).toHaveBeenCalledWith("This action requires confirmation in an interactive terminal.");
});

test("read failures cancel and terminal controls cannot hide the target", async () => {
  const input = io();
  input.readAnswer = mock(async () => { throw new Error("private input error"); });
  expect(await confirmAction("Account: active_user\nTitle: \x1b[2Jhidden\rchanged", "yes", input)).toBe(false);
  expect(input.print).toHaveBeenCalledWith("Account: active_user\nTitle:  [2Jhidden changed");
  expect(input.fail).toHaveBeenCalledWith("Action cancelled.");
});
