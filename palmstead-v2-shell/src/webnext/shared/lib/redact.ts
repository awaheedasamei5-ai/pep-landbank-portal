// Strips patterns that could carry a client's real contact details out of
// free-text staff notes before they're ever sent to an external AI
// provider -- the master spec's privacy rule explicitly calls out phone
// numbers as something never to send on a free tier. Notes are genuine
// free text (an agent could type a number into them at any point), so
// this is a real technical backstop alongside never sending the client's
// name/id at all, not just a policy statement.
const PHONE_PATTERN = /(\+?\d[\d\s-]{6,}\d)/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

export function redactPII(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email removed]').replace(PHONE_PATTERN, '[number removed]');
}
