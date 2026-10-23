import type { ZodError } from "zod";

/** Thrown for invalid input. The message is safe to show to the user. */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {}
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function fromZod(error: ZodError): ValidationError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    fields[key] ??= issue.message;
  }
  const first = error.issues[0];
  return new ValidationError(
    first ? `${first.path.join(".") || "Form"}: ${first.message}` : "Invalid input",
    fields
  );
}

/** Maps any thrown error to a message that is safe to show. Unknown errors never leak details. */
export function userMessage(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof Error && error.name in SAFE_NAMES) return error.message;
  return "Something went wrong. Please try again.";
}

const SAFE_NAMES: Record<string, true> = {
  ValidationError: true,
  ForbiddenError: true,
  UnauthorizedError: true,
  ThemeError: true,
  ArchiveError: true,
};
