/**
 * Minimal server-side model endpoint for the Vite dev and preview servers.
 *
 * Exposes exactly two routes and forwards them to a local Ollama:
 *   GET  /api/llm/status  → whether the configured model is installed
 *   POST /api/llm/chat    → one non-streaming chat completion with the configured model
 * Everything else under /api/llm is refused, so model management endpoints (pull, delete,
 * create, …) are never reachable from the browser. The model is fixed server-side.
 *
 * Environment:
 *   DUKAANPULSE_OLLAMA_URL  default http://127.0.0.1:11434
 *   DUKAANPULSE_MODEL       default qwen3.6:35b
 *   DUKAANPULSE_KEEP_ALIVE  how long Ollama keeps the model loaded, default 2h
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function llmProxy(): Plugin {
  const upstream = (process.env.DUKAANPULSE_OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.DUKAANPULSE_MODEL ?? 'qwen3.6:35b';

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? '').split('?')[0];
    if (!path?.startsWith('/api/llm')) return next();

    if (path === '/api/llm/status' && req.method === 'GET') {
      try {
        const r = await fetch(`${upstream}/api/tags`, { signal: AbortSignal.timeout(3000) });
        const tags = (await r.json()) as { models?: { name: string }[] };
        const installed = (tags.models ?? []).some((m) => m.name === model);
        return send(res, 200, { available: installed, model, reason: installed ? undefined : `Model ${model} is not installed in Ollama.` });
      } catch {
        return send(res, 200, { available: false, model, reason: 'Ollama is not reachable from the app server.' });
      }
    }

    if (path === '/api/llm/chat' && req.method === 'POST') {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(await readBody(req)) as Record<string, unknown>;
      } catch (e) {
        return send(res, e instanceof Error && e.message === 'too_large' ? 413 : 400, { error: 'Invalid request body.' });
      }
      const messages = parsed.messages;
      if (!Array.isArray(messages) || messages.length === 0 || messages.length > 4) return send(res, 400, { error: 'messages must be a short array.' });
      const body = {
        model,
        stream: false,
        think: false,
        // Keep the model resident between questions so a live demo does not pay reload time.
        keep_alive: process.env.DUKAANPULSE_KEEP_ALIVE ?? '2h',
        format: parsed.format,
        options: { temperature: 0, num_predict: 900 },
        messages: messages.map((m: { role?: unknown; content?: unknown }) => ({
          role: m.role === 'system' ? 'system' : 'user',
          content: String(m.content ?? '').slice(0, 24_000),
        })),
      };
      try {
        const r = await fetch(`${upstream}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        const text = await r.text();
        res.statusCode = r.status;
        res.setHeader('content-type', 'application/json');
        return res.end(text);
      } catch {
        return send(res, 502, { error: 'Model call failed.' });
      }
    }

    return send(res, 404, { error: 'Not available.' });
  };

  return {
    name: 'dukaanpulse-llm-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}
