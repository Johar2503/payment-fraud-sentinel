// Option B: remove both rocketride_sql nodes from payment_fraud_sentinel_v2.pipe.
//  - rocketride_sql_vendors  -> embedded VENDOR_MASTER JSON in prompt_case; agent
//    does the name match in-context. tool_python_1 (HOLD rule) UNCHANGED.
//  - rocketride_sql_feedback -> llm_feedback (llm_anthropic) emitting a synthetic ack.
// Everything else (LLM nodes, tool_python_1, verify/chat flows, webhook sources,
// project_id) is left byte-identical.

import { readFileSync, writeFileSync } from 'node:fs';

const PIPE = 'pipelines/payment_fraud_sentinel_v2.pipe';
const p = JSON.parse(readFileSync(PIPE, 'utf8'));
const vendors = JSON.parse(readFileSync('scripts/vendors_seed.json', 'utf8'));
if (vendors.length !== 50) throw new Error(`expected 50 vendors, got ${vendors.length}`);
const VENDOR_MASTER = JSON.stringify(vendors); // minified, all 50 records verbatim

const byId = (id) => p.components.find((c) => c.id === id);
const idx = (id) => p.components.findIndex((c) => c.id === id);

// ---- 1. prompt_case: swap Step 1 to embedded lookup, soften tool language ----
const pc = byId('prompt_case').config.instructions;
pc[2] =
	"You have a real Python code-execution tool. For any processable invoice (i.e. once the Step 0 gate has passed) you MUST invoke it for real for the Step 2 computation. NEVER write tool-call syntax as plain text, NEVER label output 'simulated', and NEVER invent a vendor record or a computation result. If a tool call errors, report it rather than fabricating data. Other than the Step 0 fast path, an answer whose Step 2 numbers did not come from a genuine Python tool call is invalid.";
pc[3] =
	'Step 1 - vendor lookup: the vendor master is the JSON array in the next instruction (VENDOR_MASTER) - 50 records, each { vendor_id, name, known_bank_accounts (array), historical_invoice_amounts (array of numbers), first_seen_date, risk_score, risk_history (array) }. Find the record whose name matches the invoice vendor_name: compare case-insensitively, ignore surrounding punctuation/whitespace and common company suffixes (Inc, Ltd, LLC, Co, Corp, GmbH, Group, Holdings, Partners). Accept an unambiguous close match as found. If exactly one record matches, it is the vendor row for the rest of this case. If none match or the match is ambiguous, set vendor.found=false, vendor_id=null, and treat the vendor as unknown. Do NOT call a tool for this step - read directly from VENDOR_MASTER.';
pc.splice(4, 0, 'VENDOR_MASTER = ' + VENDOR_MASTER);
// pc[5] is now the original "Step 2 ..." text, untouched.

// ---- 2. agent_rocketride_1: drop the SQL-tool reference in the tools instruction ----
const ag = byId('agent_rocketride_1').config.instructions;
ag[2] =
	"Otherwise you have a real Python code-execution tool. Do Step 1 (vendor lookup) yourself by reading the VENDOR_MASTER JSON array carried in the question - do NOT call a tool for it. Then use the Python tool for real for the Step 2 deterministic rule + amount computation: do NOT emit tool-call syntax as text, do NOT write 'simulated result', and do NOT fabricate the computation output. For a processable invoice, a run whose Step 2 numbers did not come from a genuine Python tool call is invalid.";

// ---- 3. remove rocketride_sql_vendors ----
p.components.splice(idx('rocketride_sql_vendors'), 1);

// ---- 4. feedback: prompt_feedback -> llm_feedback -> response_answers_feedback ----
byId('prompt_feedback').config.instructions = [
	"The question text is a JSON decision sent back by the Payment Fraud Sentinel UI after a human reviewed a case, or an async verification outcome. Expected fields: vendor_id, vendor_name, invoice_number, decision ('approve'|'reject'), event ('human_review'|'verification'), reviewer, note, decided_at (ISO date).",
	'This build does not persist writeback to a database. Acknowledge the decision by echoing it back as a compact JSON object and nothing else: { "feedback_ack": true, "persisted": false, "vendor_id": <vendor_id or null>, "vendor_name": <vendor_name>, "invoice_number": <invoice_number>, "decision": <decision>, "event": <event>, "recorded_at": <decided_at>, "note": "Writeback simulated - risk_history persistence is disabled in this demo build." }.',
	"Output only that JSON object. First character '{', last character '}'. No prose, no code fences.",
];

const sqlFeedback = byId('rocketride_sql_feedback');
const llmFeedback = {
	id: 'llm_feedback',
	provider: 'llm_anthropic',
	config: {
		profile: 'claude-sonnet-4-6',
		'claude-sonnet-4-6': { apikey: '${ROCKETRIDE_ANTHROPIC_KEY}', extendedThinking: false },
		parameters: {},
	},
	input: [{ lane: 'questions', from: 'prompt_feedback' }],
	ui: { position: { x: sqlFeedback.ui.position.x, y: sqlFeedback.ui.position.y }, measured: { width: 150, height: 66 } },
};
p.components.splice(idx('rocketride_sql_feedback'), 1, llmFeedback);
byId('response_answers_feedback').input = [{ lane: 'answers', from: 'llm_feedback' }];

// ---- 5. llm_control: drop the two dangling control refs to removed SQL nodes ----
const lc = byId('llm_control');
lc.control = lc.control.filter((c) => c.from !== 'rocketride_sql_vendors' && c.from !== 'rocketride_sql_feedback');

// ---- sanity checks ----
const ids = p.components.map((c) => c.id);
for (const dead of ['rocketride_sql_vendors', 'rocketride_sql_feedback']) {
	if (ids.includes(dead)) throw new Error(`${dead} still present`);
}
const refs = JSON.stringify(p);
if (refs.includes('rocketride_sql')) throw new Error('a rocketride_sql reference survived somewhere');
if (!ids.includes('tool_python_1')) throw new Error('tool_python_1 vanished');
const tp1Before = JSON.parse(readFileSync(PIPE, 'utf8')).components.find((c) => c.id === 'tool_python_1');
if (JSON.stringify(tp1Before) !== JSON.stringify(byId('tool_python_1'))) throw new Error('tool_python_1 changed');
// every input/control "from" must resolve
for (const c of p.components) {
	for (const wire of [...(c.input || []), ...(c.control || [])]) {
		if (!ids.includes(wire.from)) throw new Error(`${c.id} wires from missing node ${wire.from}`);
	}
}

writeFileSync(PIPE, JSON.stringify(p, null, '\t') + '\n');
console.log('OK — rewrote', PIPE);
console.log('components:', p.components.length, '| VENDOR_MASTER bytes:', VENDOR_MASTER.length);
console.log('llm_control.control now:', JSON.stringify(lc.control));
console.log('feedback chain: prompt_feedback ->', byId('response_answers_feedback').input[0].from, '-> response_answers_feedback');
console.log('agent tools (control tool nodes):', p.components.filter((c) => (c.control || []).some((w) => w.classType === 'tool' && w.from === 'agent_rocketride_1')).map((c) => `${c.id}(${c.provider})`).join(', '));
