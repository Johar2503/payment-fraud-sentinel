// =============================================================================
// friendlyError — translate a small set of KNOWN raw pipeline/SDK error strings
// into plain language for the UI.
//
// Deliberately conservative: if the raw message doesn't match a known pattern we
// return it unchanged (`translated: false`) rather than guess. A wrong friendly
// message is worse than a raw one. Callers should keep the raw text reachable
// (e.g. behind a "details" toggle) whenever `translated` is true.
// =============================================================================

export interface FriendlyError {
	/** what to show as the primary message */
	friendly: string;
	/** the original, unmodified error string */
	raw: string;
	/** true only when a known pattern matched and `friendly` !== `raw` */
	translated: boolean;
}

const RULES: ReadonlyArray<{ test: RegExp; message: string }> = [
	{
		test: /db broker|database resolution failed|urlopen error timed out/i,
		message:
			'The vendor database is temporarily unreachable. This is a platform-side issue — try again in a few minutes.',
	},
	{
		test: /password authentication failed/i,
		message:
			"The pipeline's database connection isn't authenticated correctly. This needs a configuration fix, not a retry.",
	},
	{
		test: /pipeline is not running|dead.?token/i,
		message: 'The connection to the pipeline expired. Try the action again — it should reconnect automatically.',
	},
];

export function friendlyError(raw: string | null | undefined): FriendlyError {
	const text = (raw ?? '').trim();
	for (const rule of RULES) {
		if (rule.test.test(text)) return { friendly: rule.message, raw: text, translated: true };
	}
	return { friendly: text, raw: text, translated: false };
}
