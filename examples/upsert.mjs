import { VorlekClient } from '@vorlek/sdk';

const apiKey = process.env.VORLEK_API_KEY;
if (!apiKey) {
  console.error('Set VORLEK_API_KEY before running this example.');
  process.exit(1);
}

const client = new VorlekClient({ apiKey });
const result = await client.contact.upsert({
  provider: 'sendgrid',
  email: `sdk-example-${Date.now()}@test.vorlek.ci`,
  first_name: 'SDK',
});

console.log(JSON.stringify(result, null, 2));
