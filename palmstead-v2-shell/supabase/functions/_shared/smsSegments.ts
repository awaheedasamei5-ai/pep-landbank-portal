// Real Arkesel segment-counting rules (confirmed against Arkesel's own
// "SMS Length and Unicode" documentation, arkesel.com/sms-length-and-unicode):
// GSM-7 messages: 160 chars for a single segment, 153 chars per segment
// once concatenated across multiple segments. Any character outside the
// GSM-7 basic/extended set (emoji, most accented Latin beyond the GSM set,
// etc.) forces the whole message into Unicode (UCS-2) encoding: 70 chars
// single-segment, 67 chars per segment when concatenated. A handful of
// GSM-7 "extended" characters (the ones below) each consume 2 characters
// of the GSM-7 budget even though they display as one.
//
// No authoritative current Arkesel GHS-per-segment rate could be confirmed
// for this account (pricing is credit-tiered); cost is computed elsewhere
// from app_config.sms_cost_per_segment_ghs, left null until the account
// owner enters their real rate.

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

function classify(message: string): { encoding: "gsm7" | "unicode"; effectiveLength: number } {
  let effectiveLength = 0;
  let isGsm7 = true;
  for (const ch of message) {
    if (GSM_BASIC.includes(ch)) {
      effectiveLength += 1;
    } else if (GSM_EXTENDED.includes(ch)) {
      effectiveLength += 2;
    } else {
      isGsm7 = false;
      break;
    }
  }
  if (!isGsm7) {
    return { encoding: "unicode", effectiveLength: Array.from(message).length };
  }
  return { encoding: "gsm7", effectiveLength };
}

export function computeSmsSegments(message: string): {
  encoding: "gsm7" | "unicode";
  messageLength: number;
  segmentCount: number;
} {
  const { encoding, effectiveLength } = classify(message);
  const singleLimit = encoding === "gsm7" ? 160 : 70;
  const multiLimit = encoding === "gsm7" ? 153 : 67;
  const segmentCount = effectiveLength <= singleLimit ? 1 : Math.ceil(effectiveLength / multiLimit);
  return { encoding, messageLength: Array.from(message).length, segmentCount };
}
