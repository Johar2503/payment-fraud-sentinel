// Deploy dist/ to Vercel production via the REST API (no CLI).
//   node scripts/vercel_deploy.mjs <token>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const TOKEN = process.argv[2] || process.env.VERCEL_TOKEN;
if (!TOKEN) { console.error('need token as arg 1'); process.exit(1); }
const NAME = 'payment-fraud-sentinel';
const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const H = { Authorization: `Bearer ${TOKEN}` };

function walk(dir, base = dir, out = []) {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) walk(p, base, out);
		else out.push({ abs: p, rel: relative(base, p).replace(/\\/g, '/') });
	}
	return out;
}

const files = walk(DIST).map((f) => {
	const buf = readFileSync(f.abs);
	return { file: f.rel, data: buf, sha: createHash('sha1').update(buf).digest('hex'), size: buf.length };
});
console.log('files:', files.map((f) => `${f.file} (${f.size}b)`).join(', '));

// 1. upload each file
for (const f of files) {
	const r = await fetch('https://api.vercel.com/v2/files', {
		method: 'POST',
		headers: { ...H, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': f.sha },
		body: f.data,
	});
	if (!r.ok && r.status !== 200) { console.error('file upload failed', f.file, r.status, await r.text()); process.exit(1); }
	console.log('uploaded', f.file, r.status);
}

// 2. create production deployment
const body = {
	name: NAME,
	files: files.map((f) => ({ file: f.file, sha: f.sha, size: f.size })),
	target: 'production',
	projectSettings: { framework: null, buildCommand: null, outputDirectory: null, installCommand: null },
};
const dr = await fetch('https://api.vercel.com/v13/deployments?forceNew=1', {
	method: 'POST',
	headers: { ...H, 'Content-Type': 'application/json' },
	body: JSON.stringify(body),
});
const dj = await dr.json();
if (!dr.ok) { console.error('deployment failed', dr.status, JSON.stringify(dj, null, 2)); process.exit(1); }
console.log('\ndeployment id :', dj.id);
console.log('url           :', 'https://' + dj.url);
console.log('aliases       :', (dj.alias || []).map((a) => 'https://' + a).join(', ') || '(assigned after ready)');
console.log('state         :', dj.readyState || dj.status);
console.log('\nInspect: https://vercel.com/dashboard');
