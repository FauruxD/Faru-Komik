import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const name of [".env.local", ".env"]) {
  if (existsSync(name)) process.loadEnvFile(name);
}

export function integerOption(
  value: string,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return number;
}

export function datasetPath(path: string): string {
  const target = resolve(path);
  if (!target.endsWith(".json"))
    throw new Error("Dataset path must end in .json");
  return target;
}

export function reportError(error: unknown): void {
  console.error(error instanceof Error ? error.message : "Unexpected error");
  process.exitCode = 1;
}
