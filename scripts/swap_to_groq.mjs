// Swap the pipeline's 4 LLM nodes from llm_gemini -> llm_openai_api (Groq).
//
// Groq's free tier is ~1,000 requests/day on llama-3.3-70b-versatile (vs the
// 20/day that gemini-3.8-flash now enforces), and a Groq key with no billing
// attached is exactly as safe to expose in the public bundle as the Gemini one.
//
//   node scripts/swap_to_groq.mjs [--model=<id>] [--baseurl-field=<name>] [--url=<endpoint>]
//
// The base-URL field name for llm_openai_api is not documented in the stripped
// workspace schema; --baseurl-field lets us correct it from the probe's error
// without re-editing this file. Defaults below are the best guess.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PIPE = fileURLToPath(new URL('../pipelines/payment_fraud_sentinel_v2.pipe', import.meta.url));

const arg = (k, d) => {
	const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : d;
};

const MODEL = arg('model', 'openai/gpt-oss-120b');
const URL_FIELD = arg('baseurl-field', 'base_url');
const BASE_URL = arg('url', 'https://api.groq.com/openai/v1');
const TOTAL_TOKENS = Number(arg('total-tokens', '131072'));
const OUTPUT_TOKENS = Number(arg('output-tokens', '8192')); // Groq free-tier completion cap
const KEY_REF = '${ROCKETRIDE_GROQ_KEY}';

const p = JSON.parse(readFileSync(PIPE, 'utf8'));
let n = 0;
for (const c of p.components) {
	// llm_gemini on the first run; llm_openai_api on re-runs (retune model / field).
	if (c.provider !== 'llm_gemini' && c.provider !== 'llm_openai_api') continue;
	c.provider = 'llm_openai_api';
	c.config = {
		profile: 'custom',
		custom: {
			model: MODEL,
			modelTotalTokens: TOTAL_TOKENS,
			outputTokens: OUTPUT_TOKENS,
			apikey: KEY_REF,
			[URL_FIELD]: BASE_URL,
		},
		parameters: {},
	};
	n++;
	console.log(`  ${c.id} -> llm_openai_api (${MODEL})`);
}

if (n !== 4) {
	console.error(`\n⚠ expected 4 llm_gemini nodes, swapped ${n}. Aborting write.`);
	process.exit(1);
}

writeFileSync(PIPE, JSON.stringify(p, null, '\t') + '\n');
console.log(`\n✓ ${n} nodes swapped. baseURL field = "${URL_FIELD}" = ${BASE_URL}`);
