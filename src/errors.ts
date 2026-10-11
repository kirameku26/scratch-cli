export function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}
