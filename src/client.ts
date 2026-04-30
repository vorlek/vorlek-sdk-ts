import { ulid } from 'ulid';
import { errorFromEnvelope, networkError } from './errors.js';
import type {
  GetCampaignStatsInput,
  GetCampaignStatsResult,
  GetConnectionStatusInput,
  GetConnectionStatusResult,
  ListCampaignsInput,
  ListCampaignsResult,
  ListTemplatesInput,
  ListTemplatesResult,
  RequestOptions,
  ResponseMeta,
  SendTransactionalInput,
  SendTransactionalResult,
  UpsertContactInput,
  UpsertContactResult,
  VorlekResult,
} from './types.js';
import { VERSION } from './version.js';

export interface VorlekClientOptions {
  apiKey: string;
  apiBase?: string;
  timeout?: number;
  idempotencyKey?: () => string;
  fetch?: typeof fetch;
}

export interface ContactNamespace {
  upsert(
    input: UpsertContactInput,
    options?: RequestOptions
  ): Promise<VorlekResult<UpsertContactResult>>;
}

export interface SendNamespace {
  transactional(
    input: SendTransactionalInput,
    options?: RequestOptions
  ): Promise<VorlekResult<SendTransactionalResult>>;
}

export interface CampaignNamespace {
  stats(
    input: GetCampaignStatsInput,
    options?: RequestOptions
  ): Promise<VorlekResult<GetCampaignStatsResult>>;
  list(
    input: ListCampaignsInput,
    options?: RequestOptions
  ): Promise<VorlekResult<ListCampaignsResult>>;
}

export interface TemplateNamespace {
  list(
    input: ListTemplatesInput,
    options?: RequestOptions
  ): Promise<VorlekResult<ListTemplatesResult>>;
}

export interface ConnectionNamespace {
  status(
    input: GetConnectionStatusInput,
    options?: RequestOptions
  ): Promise<VorlekResult<GetConnectionStatusResult>>;
}

const DEFAULT_API_BASE = 'https://api.vorlek.com';
const DEFAULT_TIMEOUT_MS = 30_000;

export class VorlekClient {
  readonly contact: ContactNamespace;
  readonly send: SendNamespace;
  readonly campaign: CampaignNamespace;
  readonly template: TemplateNamespace;
  readonly connection: ConnectionNamespace;

  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly timeout: number;
  private readonly idempotencyKey: () => string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: VorlekClientOptions) {
    if (!opts.apiKey) {
      throw new TypeError('VorlekClient requires an apiKey.');
    }
    this.apiKey = opts.apiKey;
    this.apiBase = normalizeBase(opts.apiBase ?? DEFAULT_API_BASE);
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
    this.idempotencyKey = opts.idempotencyKey ?? ulid;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;

    this.contact = {
      upsert: (input, options) => this.post('/v1/tools/upsert_contact', input, options),
    };
    this.send = {
      transactional: (input, options) => this.post('/v1/tools/send_transactional', input, options),
    };
    this.campaign = {
      stats: (input, options) => this.post('/v1/tools/get_campaign_stats', input, options),
      list: (input, options) => this.post('/v1/tools/list_campaigns', input, options),
    };
    this.template = {
      list: (input, options) => this.post('/v1/tools/list_templates', input, options),
    };
    this.connection = {
      status: (input, options) => this.post('/v1/tools/get_connection_status', input, options),
    };
  }

  private async post<TInput, TResult>(
    path: string,
    input: TInput,
    options?: RequestOptions
  ): Promise<VorlekResult<TResult>> {
    const response = await this.fetchJson(path, input, options);
    const body = await parseJson(response);

    if (!response.ok) {
      throw errorFromEnvelope(body, response.status);
    }

    if (!isSuccessEnvelope(body)) {
      throw errorFromEnvelope(body, response.status);
    }

    return {
      data: body.data as TResult,
      meta: extractMeta(body, response.headers),
    };
  }

  private async fetchJson(
    path: string,
    input: unknown,
    options?: RequestOptions
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchImpl(new URL(path, this.apiBase), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': options?.idempotencyKey ?? this.idempotencyKey(),
          'User-Agent': `@vorlek/sdk/${VERSION}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
    } catch (err) {
      throw networkError(err);
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isSuccessEnvelope(value: unknown): value is {
  status: 'success';
  data: unknown;
  meta?: unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'success' &&
    'data' in value
  );
}

function extractMeta(body: { meta?: unknown }, headers: Headers): ResponseMeta {
  const bodyMeta = isRecord(body.meta) ? body.meta : {};
  const quota = isRecord(bodyMeta.quota)
    ? {
        used: Number(bodyMeta.quota.used),
        limit: Number(bodyMeta.quota.limit),
        resets_at: String(bodyMeta.quota.resets_at),
        ...(typeof bodyMeta.quota.check_skipped === 'boolean'
          ? { check_skipped: bodyMeta.quota.check_skipped }
          : {}),
      }
    : undefined;
  const bodyRatelimit = isRecord(bodyMeta.ratelimit) ? bodyMeta.ratelimit : undefined;
  const headerLimit = parseIntegerHeader(headers.get('x-ratelimit-limit'));
  const headerRemaining = parseIntegerHeader(headers.get('x-ratelimit-remaining'));
  const headerReset = parseResetHeader(headers.get('x-ratelimit-reset'));
  const ratelimit =
    bodyRatelimit || headerLimit !== undefined || headerRemaining !== undefined || headerReset
      ? {
          ...(typeof bodyRatelimit?.check_skipped === 'boolean'
            ? { check_skipped: bodyRatelimit.check_skipped }
            : {}),
          ...(headerLimit !== undefined ? { limit: headerLimit } : {}),
          ...(headerRemaining !== undefined ? { remaining: headerRemaining } : {}),
          ...(headerReset ? { reset_at: headerReset } : {}),
        }
      : undefined;
  const idempotency = isRecord(bodyMeta.idempotency)
    ? { replay: bodyMeta.idempotency.replay === true }
    : undefined;
  const testMode = typeof bodyMeta.test_mode === 'boolean' ? bodyMeta.test_mode : undefined;

  return {
    request_id: typeof bodyMeta.request_id === 'string' ? bodyMeta.request_id : '',
    ...(quota ? { quota } : {}),
    ...(ratelimit ? { ratelimit } : {}),
    ...(idempotency ? { idempotency } : {}),
    ...(testMode !== undefined ? { test_mode: testMode } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseIntegerHeader(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseResetHeader(value: string | null): string | undefined {
  const parsed = parseIntegerHeader(value);
  return parsed === undefined ? undefined : new Date(parsed * 1000).toISOString();
}

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
