import { ulid } from 'ulid';
import { errorFromEnvelope, networkError } from './errors.js';
import type {
  GetCampaignStatsInput,
  GetCampaignStatsResult,
  GetConnectionStatusInput,
  GetConnectionStatusResult,
  SendTransactionalInput,
  SendTransactionalResult,
  UpsertContactInput,
  UpsertContactResult,
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
  upsert(input: UpsertContactInput): Promise<UpsertContactResult>;
}

export interface SendNamespace {
  transactional(input: SendTransactionalInput): Promise<SendTransactionalResult>;
}

export interface CampaignNamespace {
  stats(input: GetCampaignStatsInput): Promise<GetCampaignStatsResult>;
}

export interface ConnectionNamespace {
  status(input: GetConnectionStatusInput): Promise<GetConnectionStatusResult>;
}

const DEFAULT_API_BASE = 'https://api.vorlek.com';
const DEFAULT_TIMEOUT_MS = 30_000;

export class VorlekClient {
  readonly contact: ContactNamespace;
  readonly send: SendNamespace;
  readonly campaign: CampaignNamespace;
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
      upsert: (input) => this.post('/v1/tools/upsert_contact', input),
    };
    this.send = {
      transactional: (input) => this.post('/v1/tools/send_transactional', input),
    };
    this.campaign = {
      stats: (input) => this.post('/v1/tools/get_campaign_stats', input),
    };
    this.connection = {
      status: (input) => this.post('/v1/tools/get_connection_status', input),
    };
  }

  private async post<TInput, TResult>(path: string, input: TInput): Promise<TResult> {
    const response = await this.fetchJson(path, input);
    const body = await parseJson(response);

    if (!response.ok) {
      throw errorFromEnvelope(body, response.status);
    }

    if (!isSuccessEnvelope(body)) {
      throw errorFromEnvelope(body, response.status);
    }

    return body.data as TResult;
  }

  private async fetchJson(path: string, input: unknown): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchImpl(new URL(path, this.apiBase), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': this.idempotencyKey(),
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

function isSuccessEnvelope(value: unknown): value is { status: 'success'; data: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'success' &&
    'data' in value
  );
}

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
