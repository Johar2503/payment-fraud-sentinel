import { readFileSync, writeFileSync } from 'node:fs';
const PIPE = 'pipelines/payment_fraud_sentinel_v2.pipe';
const p = JSON.parse(readFileSync(PIPE, 'utf8'));
const PROFILE = 'gemini-flash-latest';
let swapped = [];
for (const c of p.components) {
  if (c.provider === 'llm_anthropic') {
    c.provider = 'llm_gemini';
    c.config = { profile: PROFILE, [PROFILE]: { apikey: '${ROCKETRIDE_GEMINI_KEY}' }, parameters: {} };
    swapped.push(c.id);
  }
}
if (JSON.stringify(p).includes('llm_anthropic')) throw new Error('an llm_anthropic reference survived');
writeFileSync(PIPE, JSON.stringify(p, null, '\t') + '\n');
console.log('swapped llm_anthropic -> llm_gemini on:', swapped.join(', '));
console.log('components:', p.components.length, '| any llm_anthropic left:', JSON.stringify(p).includes('llm_anthropic'));
