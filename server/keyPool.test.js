import { describe, expect, it, vi } from 'vitest';
import { createGroqKeyPool, ProviderError } from './keyPool.js';

describe('Groq key pool', () => {
  it('starts each request at the next key in round-robin order', async () => {
    const seen = [];
    const pool = createGroqKeyPool(['a', 'b'], { request: async (key) => { seen.push(key); return key; } });
    await pool.run({}); await pool.run({}); await pool.run({});
    expect(seen).toEqual(['a', 'b', 'a']);
  });

  it('moves to the next key after a retryable provider error', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ProviderError('limited', { status: 429, retryable: true })).mockResolvedValueOnce({ ok: true });
    const pool = createGroqKeyPool(['a', 'b'], { request });
    await expect(pool.run({})).resolves.toEqual({ ok: true });
    expect(request.mock.calls.map(([key]) => key)).toEqual(['a', 'b']);
  });

  it('does not retry client/schema errors', async () => {
    const request = vi.fn().mockRejectedValue(new ProviderError('bad request', { status: 400 }));
    const pool = createGroqKeyPool(['a', 'b'], { request });
    await expect(pool.run({})).rejects.toMatchObject({ status: 400 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('returns a generic exhausted-pool failure', async () => {
    const pool = createGroqKeyPool(['a', 'b'], { request: async () => { throw new ProviderError('down', { status: 503, retryable: true }); } });
    await expect(pool.run({})).rejects.toMatchObject({ status: 503, message: 'All configured Groq keys failed.' });
  });
});
