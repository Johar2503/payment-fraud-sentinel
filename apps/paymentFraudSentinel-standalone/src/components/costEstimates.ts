// =============================================================================
// Rough per-call cost figures for the session spend estimate.
//
// These are midpoints of observed ranges from live testing — a client-side
// guess for the header indicator, NOT real billing data. The pipeline traces
// on this deployment don't expose token/cost, so there is nothing precise to
// read back.
// =============================================================================

export const COST = {
	submitPerInvoiceLow: 0.4,
	submitPerInvoiceHigh: 0.75,
	submitPerInvoiceEst: 0.575,
	verificationLow: 0.1,
	verificationHigh: 0.2,
	verificationEst: 0.15,
} as const;

/** "~$0.40–$0.75" */
export const range = (lo: number, hi: number): string => `~$${lo.toFixed(2)}–$${hi.toFixed(2)}`;
