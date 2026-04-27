# @vorlek/sdk

TypeScript SDK for the Vorlek API. ESM-only, Node 20+, with native `fetch` and automatic `Idempotency-Key` generation.

## Install

```bash
npm install @vorlek/sdk
# or
pnpm add @vorlek/sdk
# or
yarn add @vorlek/sdk
# or
bun add @vorlek/sdk
```

## Quickstart

```ts
import { VorlekClient } from '@vorlek/sdk';

const client = new VorlekClient({ apiKey: process.env.VORLEK_API_KEY! });
const result = await client.contact.upsert({ provider: 'sendgrid', email: 'test@example.com' });
console.log(result.contact_id);
```

## Methods

- `client.contact.upsert(input)` — create or update a contact.
- `client.send.transactional(input)` — send one transactional email where supported.
- `client.campaign.stats(input)` — fetch normalized campaign metrics.
- `client.connection.status(input)` — check live provider credential status.

Each method sends `Authorization`, `Content-Type`, `User-Agent`, and an auto-generated `Idempotency-Key` header. Pass `idempotencyKey: () => '...'` to the constructor to pin a key for explicit retry flows.

## Errors

Failed API calls throw `VorlekError` subclasses:

- `VorlekClientError` for `user_input`.
- `VorlekProviderError` for `provider_fault` and `transient`.
- `VorlekServerError` for `system` and SDK-synthesized network errors.

Use `isRetryableError(error)` or `error.retrySafe` to decide whether a retry is safe.

Full reference: <https://vorlek.dev/docs/sdk-ts>.
