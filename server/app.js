import { createServer } from 'node:http';
import { VISIT_SCHEMA, normalizeVisit } from './visitSchema.js';
import { ProviderError, createGroqKeyPool, isRetryableProviderStatus } from './keyPool.js';

const MEDICAL_PROMPT = 'Medical OP visit dictation: vitals, complaints, history, clinical assessment, diagnosis, prescriptions, treatments, advice, tests, referral and follow-up.';
const EXTRACTION_PROMPT = 'Extract only explicitly spoken facts into the JSON schema. Never diagnose, infer, autocomplete, or fabricate. Input will be a transcription from english/hindi/hinglsih/marathi or other common indian languages. Use null for missing scalar values and [] for missing lists. Normalize spoken numbers to numbers and unambiguous dates to YYYY-MM-DD. Return only the schema object.';
const MAX_BODY_BYTES = 35 * 1024 * 1024;

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on('data', (chunk) => { size += chunk.length; if (size > MAX_BODY_BYTES) reject(new ProviderError('Request is too large.', { status: 413 })); else chunks.push(chunk); });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function responseBody(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

async function callSarvam(audio, languageCode) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new ProviderError('Sarvam is not configured.', { status: 503 });
  const form = new FormData();
  form.append('file', new Blob([audio.buffer], { type: audio.mimetype || 'audio/webm' }), audio.filename || 'dictation.webm');
  form.append('model', 'saaras:v3'); form.append('mode', 'translit'); form.append('language_code', languageCode || 'unknown'); form.append('prompt', MEDICAL_PROMPT);
  let response;
  try { response = await fetch('https://api.sarvam.ai/speech-to-text', { method: 'POST', headers: { 'api-subscription-key': key }, body: form }); } catch (error) { throw new ProviderError('Sarvam request failed.', { status: 502, retryable: true, cause: error }); }
  const data = await responseBody(response);
  if (!response.ok) throw new ProviderError('Sarvam transcription failed. Ensure the recording is under 30 seconds.', { status: response.status, retryable: response.status >= 500 || response.status === 429 });
  if (!data.transcript?.trim()) throw new ProviderError('No speech was detected in the recording.', { status: 422 });
  return { transcript: data.transcript.trim(), languageCode: data.language_code || languageCode || null };
}

function createGroqPool() {
  return createGroqKeyPool((process.env.GROQ_API_KEYS || '').split(','), {
    request: async (key, payload) => {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        const data = await responseBody(response);
        if (!response.ok) throw new ProviderError('Groq request failed.', { status: response.status, retryable: isRetryableProviderStatus(response.status) });
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new ProviderError('Groq returned no extraction.', { status: 502, retryable: true });
        try { return JSON.parse(content); } catch { throw new ProviderError('Groq returned invalid JSON.', { status: 502, retryable: true }); }
      } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError('Groq request failed.', { status: 502, retryable: true, cause: error }); } finally { clearTimeout(timer); }
    },
  });
}

export function createApp({ groqPool = createGroqPool(), transcribe = callSarvam } = {}) {
  return createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/op-visit/process') return sendJson(response, 404, { error: 'Not found.' });
    try {
      const body = JSON.parse(await readBody(request));
      let transcript = String(body.transcript || '').trim(); let languageCode = body.languageCode || null;
      if (body.audioBase64) {
        const audioBuffer = Buffer.from(body.audioBase64, 'base64');
        if (audioBuffer.byteLength > MAX_BODY_BYTES) return sendJson(response, 413, { error: 'Audio file is too large.' });
        const audio = { buffer: audioBuffer, mimetype: body.mimeType || 'audio/webm', filename: body.filename || 'op-visit.webm' };
        const result = await transcribe(audio, body.languageCode); transcript = result.transcript; languageCode = result.languageCode;
      }
      if (!transcript) return sendJson(response, 422, { error: 'Please provide a transcript or an audio recording.' });
      const rawVisit = await groqPool.run({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b', temperature: 0, messages: [{ role: 'system', content: EXTRACTION_PROMPT }, { role: 'user', content: transcript }], response_format: { type: 'json_schema', json_schema: { name: 'op_visit', strict: true, schema: VISIT_SCHEMA } } });
      return sendJson(response, 200, { transcript, languageCode, visit: normalizeVisit(rawVisit) });
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : 400;
      return sendJson(response, status >= 400 && status < 500 ? status : 503, { error: error.message || 'Unable to process dictation. Please try again.' });
    }
  });
}
