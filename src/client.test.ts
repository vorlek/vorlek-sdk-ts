import { describe, expect, it, vi } from 'vitest';
import { VorlekClient } from './client.js';
import { VorlekClientError, VorlekProviderError, VorlekServerError } from './errors.js';

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function ok(data: unknown, meta: Record<string, unknown> = {}): Response {
  return Response.json({
    status: 'success',
    data,
    meta: { request_id: '01HV0000000000000000000000', ...meta },
    tip: null,
  });
}

function errorResponse(
  code: string,
  category: 'user_input' | 'provider_fault' | 'transient' | 'system',
  retrySafe: boolean,
  status = 400
): Response {
  return Response.json(
    {
      status: 'error',
      error: {
        code,
        message: `${code} message`,
        category,
        retry_safe: retrySafe,
        detail: { code },
      },
      meta: { request_id: '01HV0000000000000000000000' },
    },
    { status }
  );
}

function requestParts(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
  const headers = new Headers(init.headers);
  return {
    url,
    init,
    headers,
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  };
}

describe('VorlekClient request shape', () => {
  it('sends contact.upsert to /v1/tools/upsert_contact', async () => {
    const fetchMock = vi.fn(async () => ok({ contact_id: 'c1' }));
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    await client.contact.upsert({ provider: 'sendgrid', email: 'a@example.com' });

    const req = requestParts(fetchMock);
    expect(req.url.href).toBe('https://api.vorlek.com/v1/tools/upsert_contact');
    expect(req.init.method).toBe('POST');
    expect(req.headers.get('authorization')).toBe('Bearer vk_test_x');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(req.headers.get('user-agent')).toMatch(/^@vorlek\/sdk\//);
    expect(req.headers.get('idempotency-key')).toMatch(ULID_RE);
    expect(req.body).toEqual({ provider: 'sendgrid', email: 'a@example.com' });
  });

  it('sends send.transactional to /v1/tools/send_transactional', async () => {
    const fetchMock = vi.fn(async () => ok({ message_id: 'm1', action: 'sent' }));
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    await client.send.transactional({
      provider: 'sendgrid',
      to: 'a@example.com',
      subject: 'Hello',
      text: 'Hi',
    });

    const req = requestParts(fetchMock);
    expect(req.url.href).toBe('https://api.vorlek.com/v1/tools/send_transactional');
    expect(req.body).toMatchObject({ provider: 'sendgrid', subject: 'Hello' });
  });

  it('sends campaign.stats to /v1/tools/get_campaign_stats', async () => {
    const fetchMock = vi.fn(async () => ok({ campaign_id: 'cmp_1' }));
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    await client.campaign.stats({ provider: 'sendgrid', campaign_id: 'cmp_1' });

    const req = requestParts(fetchMock);
    expect(req.url.href).toBe('https://api.vorlek.com/v1/tools/get_campaign_stats');
    expect(req.body).toEqual({ provider: 'sendgrid', campaign_id: 'cmp_1' });
  });

  it('sends connection.status to /v1/tools/get_connection_status', async () => {
    const fetchMock = vi.fn(async () => ok({ provider: 'sendgrid', status: 'active' }));
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    await client.connection.status({ provider: 'sendgrid' });

    const req = requestParts(fetchMock);
    expect(req.url.href).toBe('https://api.vorlek.com/v1/tools/get_connection_status');
    expect(req.body).toEqual({ provider: 'sendgrid' });
  });

  it('supports apiBase override', async () => {
    const fetchMock = vi.fn(async () => ok({ contact_id: 'c1' }));
    const client = new VorlekClient({
      apiKey: 'vk_test_x',
      apiBase: 'https://example.test/api/',
      fetch: fetchMock,
    });

    await client.contact.upsert({ email: 'a@example.com' });

    expect(requestParts(fetchMock).url.href).toBe('https://example.test/v1/tools/upsert_contact');
  });

  it('supports idempotency-key override', async () => {
    const fetchMock = vi.fn(async () => ok({ contact_id: 'c1' }));
    const client = new VorlekClient({
      apiKey: 'vk_test_x',
      idempotencyKey: () => 'CUSTOMKEY',
      fetch: fetchMock,
    });

    await client.contact.upsert({ email: 'a@example.com' });

    expect(requestParts(fetchMock).headers.get('idempotency-key')).toBe('CUSTOMKEY');
  });

  it('supports per-call idempotency-key override', async () => {
    const fetchMock = vi.fn(async () => ok({ contact_id: 'c1' }));
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    await client.contact.upsert(
      { provider: 'sendgrid', email: 'a@example.com' },
      { idempotencyKey: 'METHODKEY' }
    );

    expect(requestParts(fetchMock).headers.get('idempotency-key')).toBe('METHODKEY');
  });

  it('lets per-call idempotency-key override beat the client default', async () => {
    const fetchMock = vi.fn(async () => ok({ contact_id: 'c1' }));
    const client = new VorlekClient({
      apiKey: 'vk_test_x',
      idempotencyKey: () => 'CLIENTKEY',
      fetch: fetchMock,
    });

    await client.contact.upsert(
      { provider: 'sendgrid', email: 'a@example.com' },
      { idempotencyKey: 'METHODKEY' }
    );

    expect(requestParts(fetchMock).headers.get('idempotency-key')).toBe('METHODKEY');
  });

  it('returns the envelope data and meta object', async () => {
    const fetchMock = vi.fn(async () =>
      ok(
        { contact_id: 'c1', action: 'upserted' },
        {
          quota: { used: 7, limit: 1000, resets_at: '2026-05-01T00:00:00.000Z' },
        }
      )
    );
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    const result = await client.contact.upsert({ email: 'a@example.com' });

    expect(result).toEqual({
      data: { contact_id: 'c1', action: 'upserted' },
      meta: {
        request_id: '01HV0000000000000000000000',
        quota: { used: 7, limit: 1000, resets_at: '2026-05-01T00:00:00.000Z' },
      },
    });
  });

  it('merges rate-limit headers into response meta', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          status: 'success',
          data: { contact_id: 'c1' },
          meta: { request_id: '01HV0000000000000000000000', ratelimit: { check_skipped: false } },
          tip: null,
        },
        {
          headers: {
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '47',
            'X-RateLimit-Reset': '1770000000',
          },
        }
      )
    );
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    const result = await client.contact.upsert({ email: 'a@example.com' });

    expect(result.meta.ratelimit).toEqual({
      check_skipped: false,
      limit: 60,
      remaining: 47,
      reset_at: '2026-02-02T02:40:00.000Z',
    });
  });

  it('surfaces idempotency replay metadata', async () => {
    const fetchMock = vi.fn(async () =>
      ok({ contact_id: 'c1' }, { idempotency: { replay: true } })
    );
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    const result = await client.contact.upsert({ email: 'a@example.com' });

    expect(result.meta.idempotency?.replay).toBe(true);
  });
});

describe('VorlekClient error mapping', () => {
  const cases: Array<
    [
      string,
      'user_input' | 'provider_fault' | 'transient' | 'system',
      boolean,
      number,
      typeof VorlekClientError | typeof VorlekProviderError | typeof VorlekServerError,
    ]
  > = [
    ['AUTH_MISSING', 'user_input', false, 401, VorlekClientError],
    ['AUTH_INVALID', 'user_input', false, 401, VorlekClientError],
    ['AUTH_REVOKED', 'user_input', false, 401, VorlekClientError],
    ['AUTH_FORBIDDEN', 'user_input', false, 403, VorlekClientError],
    ['EMAIL_TAKEN', 'user_input', false, 409, VorlekClientError],
    ['ACCOUNT_NOT_FOUND', 'user_input', false, 404, VorlekClientError],
    ['PROVIDER_ALREADY_CONNECTED', 'user_input', false, 409, VorlekClientError],
    ['PROVIDER_AUTH_INVALID', 'user_input', false, 400, VorlekClientError],
    ['CONNECTION_NOT_FOUND', 'user_input', false, 404, VorlekClientError],
    ['CONNECTION_INVALID', 'user_input', false, 400, VorlekClientError],
    ['CONNECTION_DECRYPT_FAILED', 'system', false, 500, VorlekServerError],
    ['INVALID_PARAMS', 'user_input', false, 400, VorlekClientError],
    ['FIELD_TYPE_MISMATCH', 'user_input', false, 400, VorlekClientError],
    ['NOT_FOUND', 'user_input', false, 404, VorlekClientError],
    ['PAYLOAD_TOO_LARGE', 'user_input', false, 413, VorlekClientError],
    ['TOOL_NOT_SUPPORTED', 'user_input', false, 501, VorlekClientError],
    ['TOOL_NOT_CONFIGURED', 'user_input', false, 400, VorlekClientError],
    ['QUOTA_EXCEEDED', 'user_input', true, 429, VorlekClientError],
    ['RATE_LIMITED', 'user_input', true, 429, VorlekClientError],
    ['IDEMPOTENCY_CONFLICT', 'user_input', false, 409, VorlekClientError],
    ['PROVIDER_RATE_LIMITED', 'transient', true, 429, VorlekProviderError],
    ['PROVIDER_UNAVAILABLE', 'transient', true, 503, VorlekProviderError],
    ['PROVIDER_FAILED', 'provider_fault', false, 502, VorlekProviderError],
    ['INTERNAL_ERROR', 'system', true, 500, VorlekServerError],
  ];

  it.each(cases)(
    'maps %s to the right subclass',
    async (code, category, retrySafe, status, klass) => {
      const fetchMock = vi.fn(async () => errorResponse(code, category, retrySafe, status));
      const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

      await expect(client.contact.upsert({ email: 'a@example.com' })).rejects.toMatchObject({
        code,
        retrySafe,
        category,
        httpStatus: status,
        requestId: '01HV0000000000000000000000',
      });
      await expect(client.contact.upsert({ email: 'a@example.com' })).rejects.toBeInstanceOf(klass);
    }
  );

  it('maps non-envelope error responses to VorlekServerError INTERNAL_ERROR', async () => {
    const fetchMock = vi.fn(async () => Response.json({ unexpected: true }, { status: 502 }));
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    await expect(client.contact.upsert({ email: 'a@example.com' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      httpStatus: 502,
    });
  });

  it('maps network TypeError to VorlekServerError NETWORK_ERROR', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const client = new VorlekClient({ apiKey: 'vk_test_x', fetch: fetchMock });

    await expect(client.contact.upsert({ email: 'a@example.com' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retrySafe: true,
      category: 'system',
      httpStatus: 0,
    });
  });

  it('aborts hanging requests after the configured timeout', async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    const client = new VorlekClient({ apiKey: 'vk_test_x', timeout: 5, fetch: fetchMock });

    await expect(client.contact.upsert({ email: 'a@example.com' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(signal?.aborted).toBe(true);
  });
});
