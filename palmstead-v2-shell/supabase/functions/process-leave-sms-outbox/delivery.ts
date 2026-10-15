export type DeliveryOutcome = {
  status: 'accepted' | 'failed' | 'queued' | 'needs_review';
  providerReference: string | null;
  error: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function classifyProviderResponse(httpStatus: number, body: unknown, recipient: string): DeliveryOutcome {
  const response = object(body);
  const payload = response?.data;
  const item = Array.isArray(payload)
    ? payload.map(object).find((row) => String(row?.recipient ?? '').replace(/\D/g, '') === recipient)
    : object(payload);
  const reference = item?.id ?? item?.message_id;
  const providerReference = typeof reference === 'string' && reference.trim() ? reference.trim() : null;

  if (httpStatus >= 200 && httpStatus < 300 && response?.status === 'success' && providerReference) {
    return { status: 'accepted', providerReference, error: null };
  }
  if (httpStatus === 429 && response?.status !== 'success' && !providerReference) {
    return { status: 'queued', providerReference: null, error: 'SMS provider rate limit reached. A retry is queued.' };
  }
  if ([400, 401, 402, 403, 404, 413, 422].includes(httpStatus) && !providerReference) {
    return { status: 'failed', providerReference: null, error: `SMS provider rejected the request (HTTP ${httpStatus}).` };
  }
  // A timeout, server failure or unexpected success body can occur after the
  // provider has accepted the SMS. There is no documented idempotency key for
  // this endpoint, so automatic retries could send a second real message.
  return {
    status: 'needs_review',
    providerReference,
    error: `SMS outcome is uncertain (HTTP ${httpStatus}). Check the provider history before retrying.`,
  };
}
