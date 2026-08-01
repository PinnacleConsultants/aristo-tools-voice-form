import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const servers = [];
afterEach(() => servers.splice(0).forEach((server) => server.close()));

async function postJson(payload, dependencies) {
  const server = createApp(dependencies).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once('listening', resolve));
  return fetch(`http://127.0.0.1:${server.address().port}/api/op-visit/process`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}

describe('OP Visit process API', () => {
  it('accepts a browser transcript and returns a normalized visit', async () => {
    const response = await postJson({ transcript: 'Patient has fever for three days.' }, { groqPool: { run: vi.fn().mockResolvedValue({ vitals: { pulse_bpm: '80' } }) } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.transcript).toContain('fever');
    expect(body.visit.vitals.pulse_bpm).toBe(80);
    expect(body.visit.chief_complaints).toEqual([]);
  });

  it('rejects empty requests without calling the LLM', async () => {
    const run = vi.fn();
    const response = await postJson({}, { groqPool: { run } });
    expect(response.status).toBe(422);
    expect(run).not.toHaveBeenCalled();
  });

  it('accepts a base64 audio payload for Sarvam mode', async () => {
    const transcribe = vi.fn().mockResolvedValue({ transcript: 'patient has cough', languageCode: 'en-IN' });
    const response = await postJson({ audioBase64: Buffer.from('fake-audio').toString('base64'), mimeType: 'audio/webm' }, { transcribe, groqPool: { run: vi.fn().mockResolvedValue({}) } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ mimetype: 'audio/webm' }), undefined);
    expect(body.languageCode).toBe('en-IN');
  });
});
