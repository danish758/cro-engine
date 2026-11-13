import { CroEngineClient } from '@cro-engine/sdk';

const apiKey = process.env.DEMO_API_KEY;
const experimentKey = process.env.DEMO_EXPERIMENT ?? 'new-checkout-button';

if (!apiKey) {
  console.error('Set DEMO_API_KEY to an environment API key');
  process.exit(1);
}

const client = new CroEngineClient({ apiKey, apiUrl: 'http://localhost:3000' });

console.log('--- Mobile visitors (should be assigned) ---');
for (let i = 1; i <= 10; i++) {
  const result = await client.assign(experimentKey, {
    userId: `visitor-${i}`,
    attributes: { device: 'mobile' },
  });
  console.log(`visitor-${i}`, result);
}

console.log('--- Same visitor again (same variant, every time) ---');
for (let i = 0; i < 3; i++) {
  const result = await client.assign(experimentKey, {
    userId: 'visitor-1',
    attributes: { device: 'mobile' },
  });
  console.log('visitor-1', result);
}

console.log('--- Desktop visitor (targeting should exclude) ---');
console.log(
  'visitor-1',
  await client.assign(experimentKey, { userId: 'visitor-1', attributes: { device: 'desktop' } }),
);