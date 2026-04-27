import { describe, expect, it } from 'vitest';
import {
  VorlekClientError,
  VorlekProviderError,
  VorlekServerError,
  isRetryableError,
} from './errors.js';

describe('VorlekError subclasses', () => {
  it('supports instanceof checks for client errors', () => {
    const err = new VorlekClientError({
      message: 'Invalid input',
      code: 'INVALID_PARAMS',
      retrySafe: false,
      category: 'user_input',
      httpStatus: 400,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VorlekClientError);
  });

  it('supports instanceof checks for provider errors', () => {
    const err = new VorlekProviderError({
      message: 'Provider unavailable',
      code: 'PROVIDER_UNAVAILABLE',
      retrySafe: true,
      category: 'transient',
      httpStatus: 503,
    });
    expect(err).toBeInstanceOf(VorlekProviderError);
  });

  it('supports instanceof checks for server errors', () => {
    const err = new VorlekServerError({
      message: 'Internal error',
      code: 'INTERNAL_ERROR',
      retrySafe: true,
      category: 'system',
      httpStatus: 500,
    });
    expect(err).toBeInstanceOf(VorlekServerError);
  });

  it('returns true for retry-safe Vorlek errors', () => {
    const err = new VorlekProviderError({
      message: 'Provider unavailable',
      code: 'PROVIDER_UNAVAILABLE',
      retrySafe: true,
      category: 'transient',
      httpStatus: 503,
    });
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns false for non-retry-safe Vorlek errors', () => {
    const err = new VorlekClientError({
      message: 'Invalid input',
      code: 'INVALID_PARAMS',
      retrySafe: false,
      category: 'user_input',
      httpStatus: 400,
    });
    expect(isRetryableError(err)).toBe(false);
  });

  it('returns false for non-Vorlek errors', () => {
    expect(isRetryableError(new Error('plain'))).toBe(false);
  });
});
