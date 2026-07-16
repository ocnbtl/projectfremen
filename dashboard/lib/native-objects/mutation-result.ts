export type MutationErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "conflict"
  | "stale"
  | "read_only"
  | "network"
  | "server"
  | "unknown";

export type MutationError = {
  code: MutationErrorCode;
  message: string;
  retryable: boolean;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  details?: Readonly<Record<string, string | number | boolean | null>>;
};

export type MutationSuccess<Data> = {
  ok: true;
  data: Data;
  auditEventId?: string;
  undoToken?: string;
};

export type MutationFailure = {
  ok: false;
  error: MutationError;
};

export type MutationResult<Data> = MutationSuccess<Data> | MutationFailure;

export function mutationSuccess<Data>(
  data: Data,
  metadata: Pick<MutationSuccess<Data>, "auditEventId" | "undoToken"> = {}
): MutationSuccess<Data> {
  return { ok: true, data, ...metadata };
}

export function mutationFailure(error: MutationError): MutationFailure {
  return { ok: false, error };
}

export function isMutationSuccess<Data>(result: MutationResult<Data>): result is MutationSuccess<Data> {
  return result.ok;
}

export function mapMutationResult<Input, Output>(
  result: MutationResult<Input>,
  map: (data: Input) => Output
): MutationResult<Output> {
  return result.ok ? { ...result, data: map(result.data) } : result;
}

