export class ProviderError extends Error {
  constructor(message, { status = 500, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export function createGroqKeyPool(keys = [], { request, maxAttempts = keys.length } = {}) {
  const cleanKeys = (keys || []).map((key) => key.trim()).filter(Boolean);
  let nextIndex = 0;
  const invoke = request || (async () => { throw new Error('No Groq request function configured'); });

  return {
    get size() { return cleanKeys.length; },
    async run(payload) {
      if (!cleanKeys.length) throw new ProviderError('Groq is not configured.', { status: 503 });
      const start = nextIndex % cleanKeys.length;
      nextIndex = (start + 1) % cleanKeys.length;
      let lastError;
      const attempts = Math.min(Math.max(1, maxAttempts || cleanKeys.length), cleanKeys.length);
      for (let offset = 0; offset < attempts; offset += 1) {
        const keyIndex = (start + offset) % cleanKeys.length;
        try {
          return await invoke(cleanKeys[keyIndex], payload);
        } catch (error) {
          lastError = error;
          if (!error?.retryable) throw error;
          if (offset === attempts - 1) break;
        }
      }
      throw new ProviderError('All configured Groq keys failed.', { status: 503, retryable: false, cause: lastError });
    },
  };
}

export function isRetryableProviderStatus(status) {
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}
