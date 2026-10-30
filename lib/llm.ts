/**
 * Chat client adapted from Rekord's llm.ts: Groq (OpenAI-compatible) or Chrome's built-in LanguageModel.
 * Never logs or returns a key, and never logs a prompt. Errors are LLMError with a `code`.
 */
import type { AiMode } from './types';
import { getKey, getSettings } from './settings';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Same model as Rekord's Groq default.
export const GROQ_MODEL = 'llama-3.3-70b-versatile';

/** The slice of Chrome's built-in AI (`LanguageModel`) Motikord uses. */
export interface LanguageModelLike {
  availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(opts: { initialPrompts?: ChatMessage[]; temperature?: number; topK?: number; signal?: AbortSignal }): Promise<{
    prompt(input: string, opts?: { signal?: AbortSignal; responseConstraint?: object }): Promise<string>;
    destroy?(): void;
  }>;
}

export interface ChatOptions {
  json?: boolean;           // ask for a JSON object reply
  maxTokens?: number;
  temperature?: number;     // default 0.2
  signal?: AbortSignal;
  fetch?: FetchLike;        // injected in tests and the scoring script
  ai?: AiMode;              // instead of Settings.ai
  key?: string;             // instead of the session key
  languageModel?: LanguageModelLike;
}

export type LLMErrorCode = 'no-key' | 'offline' | 'auth' | 'rate-limited' | 'server' | 'bad-reply' | 'local-unavailable' | 'cancelled';

export class LLMError extends Error {
  constructor(message: string, readonly code: LLMErrorCode, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'LLMError';
  }
}

export interface ChatReply { text: string; by: 'groq' | 'builtin' }

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Sends `messages` to the chosen AI and returns the reply text. Throws LLMError. */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatReply> {
  const ai = opts.ai ?? (await getSettings()).ai;
  if (ai === 'local') return { text: await chatLocal(messages, opts), by: 'builtin' };
  return { text: await chatGroq(messages, opts), by: 'groq' };
}

interface GroqError { status: number; code?: string; type?: string; message?: string }

async function readGroqError(res: Response): Promise<GroqError> {
  let body: { error?: { code?: unknown; type?: unknown; message?: unknown } } | undefined;
  try { body = (await res.json()) as typeof body; } catch { /* not JSON */ }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return { status: res.status, code: str(body?.error?.code), type: str(body?.error?.type), message: str(body?.error?.message) };
}

// Groq refuses a request whose prompt plus max_tokens would pass the tokens-per-minute limit (413, or 429 of type "tokens").
const tooManyTokens = (e: GroqError) =>
  e.status === 413 || (e.status === 429 && (e.type === 'tokens' || /tokens per minute|request too large|\bTPM\b/i.test(e.message ?? '')));
const MIN_TOKENS = 800;

function retryAfter(res: Response): number | undefined {
  const after = Number(res.headers.get('retry-after'));
  return Number.isFinite(after) && after > 0 ? after * 1000 : undefined;
}

async function chatGroq(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const key = opts.key ?? (await getKey('groq'));
  if (!key) throw new LLMError('No Groq key in this session.', 'no-key');
  const fetchFn = opts.fetch ?? ((u, i) => fetch(u, i));
  let json = !!opts.json;
  let maxTokens = opts.maxTokens;
  let shrunk = false;
  let unjsoned = false;
  for (;;) {
    let res: Response;
    try {
      res = await fetchFn(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: opts.temperature ?? 0.2,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages,
        }),
        signal: opts.signal,
      });
    } catch (e) {
      if (isAbort(e)) throw new LLMError('Cancelled.', 'cancelled');
      throw new LLMError('Could not reach Groq.', 'offline');
    }
    if (!res.ok) {
      const err = await readGroqError(res);
      if (opts.signal?.aborted) throw new LLMError('Cancelled.', 'cancelled');
      console.error('Motikord: could not reach Groq', err.status, err.code ?? err.type ?? '');
      if (err.status === 401 || err.status === 403) throw new LLMError('Groq did not accept the key.', 'auth');
      // JSON mode failed (bad or cut-off JSON): ask once more without it; callers pull the object out of the text.
      if (err.code === 'json_validate_failed') {
        if (json && !unjsoned) { json = false; unjsoned = true; continue; }
        throw new LLMError('Groq could not write valid JSON.', 'bad-reply');
      }
      if (tooManyTokens(err)) {
        if (!shrunk && maxTokens && maxTokens > MIN_TOKENS) { maxTokens = Math.max(MIN_TOKENS, Math.floor(maxTokens / 2)); shrunk = true; continue; }
        throw new LLMError('Groq is busy.', 'rate-limited', retryAfter(res));
      }
      if (err.status === 429) throw new LLMError('Groq is busy.', 'rate-limited', retryAfter(res));
      if (err.status === 400 || err.status === 422) throw new LLMError(`Groq refused the request (${err.code ?? err.type ?? err.status}).`, 'bad-reply');
      throw new LLMError(`Groq returned ${err.status}.`, 'server');
    }
    let choice: { message?: { content?: unknown }; finish_reason?: unknown } | undefined;
    try {
      choice = ((await res.json()) as { choices?: (typeof choice)[] }).choices?.[0];
    } catch (e) {
      if (isAbort(e) || opts.signal?.aborted) throw new LLMError('Cancelled.', 'cancelled');
    }
    const content = choice?.message?.content;
    if (typeof content !== 'string') throw new LLMError('Groq sent an unexpected reply.', 'bad-reply');
    // A JSON reply cut off by max_tokens cannot parse; say so instead of returning half an object.
    if (opts.json && choice?.finish_reason === 'length') {
      console.error('Motikord: could not reach Groq', res.status, 'length');
      throw new LLMError('Groq cut the reply off.', 'bad-reply');
    }
    return content;
  }
}

async function chatLocal(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const lm = opts.languageModel ?? (globalThis as { LanguageModel?: LanguageModelLike }).LanguageModel;
  const availability = lm ? await lm.availability().catch(() => 'unavailable' as const) : 'unavailable';
  // Never start a model download from here.
  if (!lm || availability !== 'available') throw new LLMError('Built-in AI is not available.', 'local-unavailable');
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') throw new LLMError('The last message must be from the user.', 'bad-reply');
  let session: Awaited<ReturnType<LanguageModelLike['create']>>;
  try {
    session = await lm.create({ initialPrompts: messages.slice(0, -1), signal: opts.signal });
  } catch (e) {
    if (isAbort(e) || opts.signal?.aborted) throw new LLMError('Cancelled.', 'cancelled');
    throw new LLMError('Built-in AI is not available.', 'local-unavailable');
  }
  try {
    if (opts.json) {
      try { return await session.prompt(last.content, { signal: opts.signal, responseConstraint: { type: 'object' } }); } catch (e) {
        if (isAbort(e) || opts.signal?.aborted) throw e;
        // This Chrome does not take responseConstraint; ask again without it.
      }
    }
    return await session.prompt(last.content, { signal: opts.signal });
  } catch (e) {
    if (isAbort(e) || opts.signal?.aborted) throw new LLMError('Cancelled.', 'cancelled');
    throw new LLMError('Built-in AI could not answer.', 'bad-reply');
  } finally {
    session.destroy?.();
  }
}
