import type { ValidationReport } from "@/lib/themes/validate";

export type ThemeErrorCode =
  | "not-found"
  | "invalid"
  | "already-installed"
  | "active"
  | "protected"
  | "no-previous"
  | "activation-failed"
  | "bad-setting";

export class ThemeError extends Error {
  constructor(
    readonly code: ThemeErrorCode,
    message: string,
    readonly report?: ValidationReport
  ) {
    super(message);
    this.name = "ThemeError";
  }
}
