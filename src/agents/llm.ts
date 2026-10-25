/**
 * Model access. The browser talks only to the app's own /api/llm endpoint (see
 * server/llmProxy.ts), which forwards a restricted set of requests to a local Ollama.
 * No credentials exist or reach the browser.
 */

export interface ChatRequest {
  system: string;
  user: string;
  /** JSON schema the reply must follow (sent as Ollama's format; not all models honour it). */
  schema: Record<string, unknown>;
  /** A filled-in example reply; models follow examples more reliably than schemas. */
  example: unknown;
}

export interface ModelClient {
  readonly model: string;
  chat(request: ChatRequest, signal: AbortSignal): Promise<unknown>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'timeout' | 'bad_output' | 'aborted',
  ) {
    super(message);
  }
}

export interface ModelStatus {
  available: boolean;
  model: string | null;
  reason?: string;
}

export function isTimeout(reason: unknown): boolean {
  return reason === 'timeout' || (typeof reason === 'object' && reason !== null && (reason as { name?: string }).name === 'TimeoutError');
}

/** Client for the app's /api/llm proxy (or Ollama directly in Node tests). */
export class OllamaClient implements ModelClient {
  constructor(
    readonly model: string,
    private readonly baseUrl = '/api/llm',
    private readonly direct = false,
  ) {}

  async chat(request: ChatRequest, signal: AbortSignal): Promise<unknown> {
    const url = this.direct ? `${this.baseUrl}/api/chat` : `${this.baseUrl}/chat`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          format: request.schema,
          options: { temperature: 0, num_predict: 900 },
          messages: [
            { role: 'system', content: `${request.system}\n\nReply with one JSON object with exactly the same keys and structure as this example (fill in your own values):\n${JSON.stringify(request.example)}` },
            { role: 'user', content: request.user },
          ],
        }),
      });
    } catch (e) {
      if (signal.aborted) throw new ModelError('Model call was stopped.', isTimeout(signal.reason) ? 'timeout' : 'aborted');
      throw new ModelError(e instanceof Error ? e.message : 'Model unreachable.', 'unavailable');
    }
    if (!res.ok) throw new ModelError(`Model endpoint returned ${res.status}.`, 'unavailable');
    const body = (await res.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (typeof content !== 'string') throw new ModelError('Model reply had no content.', 'bad_output');
    try {
      return JSON.parse(content);
    } catch {
      throw new ModelError('Model reply was not valid JSON.', 'bad_output');
    }
  }
}

/** Asks the app's proxy whether a model is configured and loaded in Ollama. */
export async function fetchModelStatus(signal?: AbortSignal): Promise<ModelStatus> {
  try {
    const res = await fetch('/api/llm/status', { signal });
    if (!res.ok) return { available: false, model: null, reason: `Status endpoint returned ${res.status}.` };
    const body = (await res.json()) as ModelStatus;
    return { available: body.available === true, model: typeof body.model === 'string' ? body.model : null, reason: body.reason };
  } catch {
    return { available: false, model: null, reason: 'The model endpoint is not reachable from this page.' };
  }
}
