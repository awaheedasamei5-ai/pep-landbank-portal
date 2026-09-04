import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Real LLM-backed intelligence layer -- one function serves every AI
// feature across the app via a `kind` discriminator, so adding a new
// AI-powered surface (commission insights, chat suggestions) never needs
// a new deployment, just a new prompt branch here. Groq
// (https://console.groq.com), not a paid provider: genuinely free tier,
// no credit card, 14,400 requests/day, and fast enough (300+ tokens/sec)
// to feel instant in the UI rather than a spinner. The API key lives
// ONLY as a server-side Edge Function secret (GROQ_API_KEY) -- never
// shipped to the client, same discipline as this project's existing
// send-sms function's ARKESEL_API_KEY. Until that secret is set, every
// call gracefully returns "not configured yet" (never a 500 that breaks
// the caller's UI) -- same pattern send-sms already established for a
// not-yet-configured provider. GROQ_API_KEY confirmed live on staging
// 2026-09-05.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Groq retired the old llama-3.3-70b-versatile model from this account's
// available list (confirmed live via /v1/models, 2026-09-05) -- replaced
// with the openai/gpt-oss family Groq now hosts. 120b for real quality on
// short business-coaching/summary text.
const GROQ_MODEL = "openai/gpt-oss-120b";

interface AiRequest {
  kind: string;
  context: Record<string, unknown>;
}

// Each `kind` is a fixed, reviewed system prompt -- the client sends
// structured data, never free-text instructions, so this never becomes
// a general-purpose prompt-injection surface. Keep responses short: this
// is a one-line coaching nudge / insight, not a chat transcript.
function systemPromptFor(kind: string): string | null {
  switch (kind) {
    case "streak_coaching":
      return (
        "You are a warm, sharp sales coach for a Ghanaian land-sales agency called Palmstead. " +
        "You'll receive one JSON object describing a sales agent's current daily activity streak and this month's pipeline risk. " +
        "Reply with ONE short sentence (max 22 words), second person, specific to the numbers given -- never generic filler like 'keep up the good work'. " +
        "Reference an actual number from the data (days, count, or a concrete next step) so it reads as genuinely aware of their situation. " +
        "No emoji, no hashtags, no quotation marks around your reply -- plain text only."
      );
    case "colleague_availability":
      return (
        "You help staff at a Ghanaian land-sales agency called Palmstead decide whether it's a good idea to assign a task to a colleague on a given date. " +
        "You'll receive one JSON object with the colleague's name, the target date, whether they're on approved or pending leave that day, and how many tasks they already have that day. " +
        "Reply with ONE short, direct sentence (max 24 words) telling the user whether the colleague looks free, busy, or unavailable, and WHY, citing the actual leave status or task count given. " +
        "If nothing in the data suggests a conflict, say plainly that they appear free -- don't invent caution that isn't in the data. " +
        "No emoji, no hashtags, no quotation marks -- plain text only."
      );
    case "manager_daily_briefing":
      return (
        "You are a sharp, concise chief-of-staff for the Management team at a Ghanaian land-sales agency called Palmstead. " +
        "You'll receive one JSON object with today's real company-wide numbers: total leads, outstanding balance, fully-paid count, open complaints, total pipeline value, site visits logged, this month's collected amount and its trend vs last month, the pipeline stage funnel, and a ranked list of agents by their pipeline value. " +
        "Reply with a short briefing of 2-3 sentences (max 60 words total), plain prose, no headers or bullet points. " +
        "Lead with whatever most deserves Management's attention today (a real risk like open complaints, or a real win like a strong collection trend or a standout agent) -- cite the actual numbers given, never invent figures not in the data. " +
        "No emoji, no hashtags, no quotation marks -- plain text only."
      );
    case "companion_qa":
      return (
        "You are a personal AI companion embedded in the staff app for a Ghanaian land-sales agency called Palmstead, speaking directly and warmly to one sales agent about their own real, already-computed numbers -- never a client's. " +
        "You'll receive one JSON object with a `question` field, one of: next_action, month_progress, pipeline_health -- that tells you which single thing to focus your reply on -- plus the agent's real current numbers: name, lead count, pipeline value, cold-lead count, near-allocation-trigger count, ready-for-allocation count, stalled-high-priority count, this month's collected amount, last month's collected amount, and a next-month forecast if given. " +
        "Reply with exactly 2 sentences (max 45 words total), second person, addressing only the asked question and citing the real numbers given -- never invent a figure not in the data. " +
        "next_action: name the single highest-leverage thing to do right now. month_progress: assess the real money trend plainly. pipeline_health: assess the real lead-quality signals (cold / near-trigger / ready / stalled counts). " +
        "No emoji, no hashtags, no quotation marks -- plain text only."
      );
    case "login_greeting":
      return (
        "You write the single welcome line on the staff sign-in screen for a Ghanaian land-sales agency called Palmstead, shown before anyone signs in -- so you know nothing about the specific person yet. " +
        "You'll receive one JSON object with the real day of week, time of day (morning/afternoon/evening/night), and whether it's a weekday or weekend where the company operates. " +
        "Reply with ONE short, warm line (max 14 words) that feels genuinely aware of that real moment -- a Monday reset, a Friday push, a quiet Sunday, a late-night sign-in -- never generic filler like 'Welcome back' alone. " +
        "Plain text, second person plural or neutral (no name to address), no emoji, no hashtags, no quotation marks."
      );
    default:
      return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  try {
    const { kind, context } = (await req.json()) as AiRequest;
    const systemPrompt = kind ? systemPromptFor(kind) : null;
    if (!systemPrompt) {
      return new Response(JSON.stringify({ error: `Unknown insight kind: ${kind}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI insights are not configured on the server yet" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let resp: Response;
    try {
      resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(context ?? {}) },
          ],
          temperature: 0.6,
          // Bumped from 300 -- companion_qa's 2-sentence replies were
          // landing right at the edge and once came back empty (reasoning
          // ate the whole budget), confirmed live 2026-09-04. More
          // headroom for the reasoning field costs nothing but a few
          // extra ms on this model.
          max_tokens: 400,
          // gpt-oss is a reasoning model -- without this it burns its whole
          // token budget on internal chain-of-thought and never emits the
          // actual reply (confirmed live: finish_reason 'length', 198 of 200
          // tokens spent on `reasoning`, empty `content`). This task never
          // needs deep reasoning, just a short, grounded sentence.
          reasoning_effort: "low",
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "AI provider error", detail: data }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const message = String(data?.choices?.[0]?.message?.content ?? "").trim();
    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
