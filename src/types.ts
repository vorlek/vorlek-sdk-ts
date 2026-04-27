import type { paths } from './types.generated.js';

type JsonRequest<
  TPath extends keyof paths,
  TMethod extends keyof paths[TPath],
> = paths[TPath][TMethod] extends {
  requestBody: { content: { 'application/json': infer Body } };
}
  ? Body
  : never;

type JsonSuccess<
  TPath extends keyof paths,
  TMethod extends keyof paths[TPath],
> = paths[TPath][TMethod] extends {
  responses: { 200: { content: { 'application/json': infer Body } } };
}
  ? Body
  : never;

type EnvelopeData<TEnvelope> = TEnvelope extends { data: infer Data } ? Data : never;

export interface ResponseMeta {
  request_id: string;
  quota?: {
    used: number;
    limit: number;
    resets_at: string;
    check_skipped?: boolean;
  };
  ratelimit?: {
    limit?: number;
    remaining?: number;
    reset_at?: string;
    check_skipped?: boolean;
  };
  idempotency?: { replay: boolean };
}

export interface VorlekResult<TData> {
  data: TData;
  meta: ResponseMeta;
}

export interface RequestOptions {
  idempotencyKey?: string;
}

export type UpsertContactInput = JsonRequest<'/v1/tools/upsert_contact', 'post'>;
export type UpsertContactResult = EnvelopeData<JsonSuccess<'/v1/tools/upsert_contact', 'post'>>;

export type SendTransactionalInput = JsonRequest<'/v1/tools/send_transactional', 'post'>;
export type SendTransactionalResult = EnvelopeData<
  JsonSuccess<'/v1/tools/send_transactional', 'post'>
>;

export type GetCampaignStatsInput = JsonRequest<'/v1/tools/get_campaign_stats', 'post'>;
export type GetCampaignStatsResult = EnvelopeData<
  JsonSuccess<'/v1/tools/get_campaign_stats', 'post'>
>;

export type GetConnectionStatusInput = JsonRequest<'/v1/tools/get_connection_status', 'post'>;
export type GetConnectionStatusResult = EnvelopeData<
  JsonSuccess<'/v1/tools/get_connection_status', 'post'>
>;

export type ErrorEnvelope =
  paths['/v1/tools/upsert_contact']['post']['responses']['400']['content']['application/json'];
export type ErrorBody = ErrorEnvelope['error'];
export type ErrorCategory = ErrorBody['category'];

export type { components, operations, paths } from './types.generated.js';
