import test from "node:test";
import assert from "node:assert/strict";

import { calculatePaidAsOf } from "../src/app/(main)/dashboard/finance/_components/receipt-snapshot.ts";

test("receipt snapshot sums approved payments through the selected approval", () => {
	const payments = [
		{ id: "late", amount: "250", decidedAt: "2026-02-03T09:00:00Z" },
		{ id: "first", amount: 100, decidedAt: "2026-01-03T09:00:00Z" },
		{ id: "middle", amount: "75.50", decidedAt: "2026-02-01T09:00:00Z" },
	];

	assert.equal(calculatePaidAsOf(payments, "middle"), 175.5);
	assert.equal(calculatePaidAsOf(payments, "late"), 425.5);
});

test("receipt snapshot returns null if the target payment is outside the approved ledger", () => {
	assert.equal(
		calculatePaidAsOf(
			[{ id: "approved", amount: 100, decidedAt: "2026-01-01T09:00:00Z" }],
			"pending",
		),
		null,
	);
});

