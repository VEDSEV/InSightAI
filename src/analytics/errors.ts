import type {
  AnalyticsError,
  AnalyticsErrorCode,
  AnalyticsErrorSeverity,
  AnalyticsStage,
} from "./types.ts";

export type AnalyticsErrorInput = {
  readonly code: AnalyticsErrorCode;
  readonly stage: AnalyticsStage;
  readonly message: string;
  readonly severity?: AnalyticsErrorSeverity;
  readonly rowNumber?: number | null;
  readonly field?: string | null;
  readonly value?: string | null;
};

export function createAnalyticsError(input: AnalyticsErrorInput): AnalyticsError {
  return Object.freeze({
    kind: "analytics_error",
    code: input.code,
    severity: input.severity ?? "error",
    stage: input.stage,
    message: input.message,
    rowNumber: input.rowNumber ?? null,
    field: input.field ?? null,
    value: input.value ?? null,
  });
}

export function isAnalyticsError(value: unknown): value is AnalyticsError {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<AnalyticsError>;
  return (
    candidate.kind === "analytics_error" &&
    typeof candidate.code === "string" &&
    (candidate.severity === "error" || candidate.severity === "warning") &&
    typeof candidate.stage === "string" &&
    typeof candidate.message === "string"
  );
}

export function partitionAnalyticsErrors(errors: readonly AnalyticsError[]): {
  readonly errors: readonly AnalyticsError[];
  readonly warnings: readonly AnalyticsError[];
} {
  return Object.freeze({
    errors: Object.freeze(errors.filter((error) => error.severity === "error")),
    warnings: Object.freeze(errors.filter((error) => error.severity === "warning")),
  });
}
