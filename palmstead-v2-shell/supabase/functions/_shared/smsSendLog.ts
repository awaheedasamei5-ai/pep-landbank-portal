import { computeSmsSegments } from "./smsSegments.ts";

// Shared post-send logger. Called right after a real Arkesel send attempt,
// regardless of outcome -- segment/cost tracking should reflect what was
// actually attempted, not just confirmed successes (an attempt still
// consumes Arkesel's quota).
export async function logSmsSend(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: { kind: string; recipientPhone: string; providerReference: string | null; message: string },
): Promise<void> {
  const { encoding, messageLength, segmentCount } = computeSmsSegments(args.message);
  try {
    await supabase.from("sms_send_log").insert({
      kind: args.kind,
      recipient_phone: args.recipientPhone,
      provider_reference: args.providerReference,
      message_length: messageLength,
      encoding,
      segment_count: segmentCount,
    });
  } catch {
    // Never let logging failure break a real SMS send path.
  }
}
