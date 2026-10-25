#!/usr/bin/env node
/**
 * Warm up the local model before a demo and report readiness.
 *   npm run warmup                       # uses DUKAANPULSE_MODEL / DUKAANPULSE_OLLAMA_URL
 *   npm run warmup -- http://host:4173   # also checks the app's /api/llm/status
 * Loads the model with a long keep-alive and times one structured call like the agents make.
 */
const model = process.env.DUKAANPULSE_MODEL ?? 'qwen3.6:35b';
const ollama = (process.env.DUKAANPULSE_OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const app = process.argv[2];

async function call(content) {
  const t0 = Date.now();
  const res = await fetch(`${ollama}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, think: false, keep_alive: '2h', format: 'json', options: { temperature: 0 }, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const body = await res.json();
  return { seconds: (Date.now() - t0) / 1000, load: (body.load_duration ?? 0) / 1e9, text: body.message?.content ?? '' };
}

try {
  const first = await call('Reply with JSON {"ok": true}.');
  console.log(`✓ ${model} loaded (${first.seconds.toFixed(1)}s, of which ${first.load.toFixed(1)}s loading)`);
  const second = await call('Return JSON {"intent": "daypart", "steps": [{"agent": "business_analyst", "task": "Measure time of day."}]} for: Why are morning sales down?');
  console.log(`✓ structured reply in ${second.seconds.toFixed(1)}s: ${second.text.replace(/\s+/g, ' ').slice(0, 80)}`);
  console.log('  Expect about 20–45 s per agent question. If one stalls past ~45 s, press Stop and switch to "Rules only" (or open /ask?engine=rules).');
} catch (e) {
  console.error(`✗ Model not ready: ${e instanceof Error ? e.message : e}`);
  console.error('  Present with the rules-only engine: open /ask?engine=rules');
  process.exitCode = 1;
}

if (app) {
  try {
    const s = await (await fetch(`${app.replace(/\/$/, '')}/api/llm/status`, { signal: AbortSignal.timeout(5000) })).json();
    console.log(s.available ? `✓ app sees the model: ${s.model}` : `✗ app does not see the model: ${s.reason}`);
  } catch {
    console.error(`✗ app not reachable at ${app}`);
    process.exitCode = 1;
  }
}
