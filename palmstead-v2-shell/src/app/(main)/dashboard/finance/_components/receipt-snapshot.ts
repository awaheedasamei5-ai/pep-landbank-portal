export interface ApprovedReceiptPayment {
	id: string;
	amount: number | string;
	decidedAt: string;
}

export function calculatePaidAsOf(
	payments: ApprovedReceiptPayment[],
	targetPaymentId: string,
): number | null {
	const ordered = [...payments].sort(
		(a, b) =>
			a.decidedAt.localeCompare(b.decidedAt) || a.id.localeCompare(b.id),
	);
	const targetIndex = ordered.findIndex((payment) => payment.id === targetPaymentId);
	if (targetIndex < 0) return null;
	return ordered
		.slice(0, targetIndex + 1)
		.reduce((total, payment) => total + Number(payment.amount), 0);
}

