import type { ErrorCategory } from './types.js';

export interface VorlekErrorOptions {
  message: string;
  code: string;
  retrySafe: boolean;
  category: ErrorCategory;
  httpStatus: number;
  requestId?: string;
  detail?: unknown;
}

export class VorlekError extends Error {
  readonly code: string;
  readonly retrySafe: boolean;
  readonly category: ErrorCategory;
  readonly httpStatus: number;
  readonly requestId?: string;
  readonly detail?: unknown;

  constructor(opts: VorlekErrorOptions) {
    super(opts.message);
    this.name = 'VorlekError';
    this.code = opts.code;
    this.retrySafe = opts.retrySafe;
    this.category = opts.category;
    this.httpStatus = opts.httpStatus;
    this.requestId = opts.requestId;
    this.detail = opts.detail;
  }
}

export class VorlekClientError extends VorlekError {
  constructor(opts: VorlekErrorOptions) {
    super(opts);
    this.name = 'VorlekClientError';
  }
}

export class VorlekProviderError extends VorlekError {
  constructor(opts: VorlekErrorOptions) {
    super(opts);
    this.name = 'VorlekProviderError';
  }
}

export class VorlekServerError extends VorlekError {
  constructor(opts: VorlekErrorOptions) {
    super(opts);
    this.name = 'VorlekServerError';
  }
}

export function isRetryableError(err: unknown): boolean {
  return err instanceof VorlekError && err.retrySafe;
}

export function errorFromEnvelope(envelope: unknown, httpStatus: number): VorlekError {
  if (!isErrorEnvelope(envelope)) {
    return new VorlekServerError({
      message: `Vorlek API returned HTTP ${httpStatus} without a valid error envelope.`,
      code: 'INTERNAL_ERROR',
      retrySafe: true,
      category: 'system',
      httpStatus,
    });
  }

  const opts: VorlekErrorOptions = {
    message: envelope.error.message,
    code: envelope.error.code,
    retrySafe: envelope.error.retry_safe,
    category: envelope.error.category,
    httpStatus,
    requestId: envelope.meta.request_id,
    detail: envelope.error.detail,
  };

  if (opts.category === 'user_input') return new VorlekClientError(opts);
  if (opts.category === 'system') return new VorlekServerError(opts);
  return new VorlekProviderError(opts);
}

export function networkError(err: unknown): VorlekServerError {
  return new VorlekServerError({
    message: err instanceof Error ? err.message : 'Network request failed.',
    code: 'NETWORK_ERROR',
    retrySafe: true,
    category: 'system',
    httpStatus: 0,
    detail: err,
  });
}

function isErrorEnvelope(value: unknown): value is {
  status: 'error';
  error: {
    code: string;
    message: string;
    retry_safe: boolean;
    category: ErrorCategory;
    detail?: unknown;
  };
  meta: { request_id: string };
} {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as {
    status?: unknown;
    error?: {
      code?: unknown;
      message?: unknown;
      retry_safe?: unknown;
      category?: unknown;
    };
    meta?: { request_id?: unknown };
  };
  return (
    envelope.status === 'error' &&
    typeof envelope.error?.code === 'string' &&
    typeof envelope.error.message === 'string' &&
    typeof envelope.error.retry_safe === 'boolean' &&
    isErrorCategory(envelope.error.category) &&
    typeof envelope.meta?.request_id === 'string'
  );
}

function isErrorCategory(value: unknown): value is ErrorCategory {
  return (
    value === 'user_input' ||
    value === 'provider_fault' ||
    value === 'transient' ||
    value === 'system'
  );
}
