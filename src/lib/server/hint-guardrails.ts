/**
 * Guardrails for /api/hint. The threat model is:
 *  - users trying to coerce Claude into emitting the *full* snippet (defeats the practice loop)
 *  - users abusing the endpoint to free-form chat with Claude on our API key
 *  - prompt injection inside the snippet body itself
 *
 * The two-sided strategy: validate the request *before* spending tokens, then
 * sanitize the response *after*. See README §"Claude prompt guardrails".
 */

const MAX_QUESTION_LEN = 280;
const MAX_HINT_LEN = 400;
const ALLOWED_TOPIC = /^[a-z0-9\-]{1,40}$/i;

export interface HintRequest {
  snippetId: number;
  topic: string;
  question: string;
}

export type HintCheck =
  | { ok: true; sanitized: HintRequest }
  | { ok: false; reason: string };

export function checkHintRequest(raw: unknown): HintCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'invalid payload' };
  const r = raw as Record<string, unknown>;
  const snippetId = Number(r.snippetId);
  if (!Number.isInteger(snippetId) || snippetId <= 0) {
    return { ok: false, reason: 'invalid snippetId' };
  }
  const topic = typeof r.topic === 'string' ? r.topic.trim() : '';
  if (!ALLOWED_TOPIC.test(topic)) return { ok: false, reason: 'invalid topic' };
  const question = typeof r.question === 'string' ? r.question.trim() : '';
  if (!question) return { ok: false, reason: 'empty question' };
  if (question.length > MAX_QUESTION_LEN) {
    return { ok: false, reason: `question over ${MAX_QUESTION_LEN} chars` };
  }
  // Block obvious "give me the answer" pivots.
  const forbidden = [
    /full\s+(code|solution|snippet)/i,
    /write\s+the\s+(entire|whole|complete)/i,
    /ignore\s+(previous|prior)\s+instructions/i,
    /system\s+prompt/i
  ];
  if (forbidden.some((re) => re.test(question))) {
    return { ok: false, reason: 'question violates guardrails' };
  }
  return { ok: true, sanitized: { snippetId, topic, question } };
}

export function sanitizeHint(hint: string): string {
  let out = hint.trim();
  // Strip any fenced code block longer than 2 lines — hints, not solutions.
  out = out.replace(/```[\s\S]*?```/g, (block) => {
    const lines = block.split('\n');
    return lines.length > 4 ? '[code omitted: hint only]' : block;
  });
  if (out.length > MAX_HINT_LEN) out = out.slice(0, MAX_HINT_LEN) + '…';
  return out;
}

/** Build the system prompt — kept here so README §guardrails can link a single source of truth. */
export function buildSystemPrompt(topic: string): string {
  return [
    'You are a typing-practice coach for the codetype-race app.',
    'Your job: nudge the user toward the answer with conceptual hints, NEVER write the full solution.',
    `The topic being practiced is "${topic}".`,
    'Hard rules:',
    '- At most one short code fragment of <=2 lines.',
    '- Never reveal variable names or exact API signatures from the target snippet.',
    '- If the user asks for the answer, refuse politely and offer a conceptual hint instead.',
    '- Keep responses under 80 words.'
  ].join('\n');
}
