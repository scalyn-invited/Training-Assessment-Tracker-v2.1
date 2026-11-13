import { request as httpsRequest } from 'node:https';
import { ProviderFailure, type Provider, type ProviderResult } from './ai-provider.js';
const endpoints = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/',
} as const;
type Adapter = keyof typeof endpoints;
export type ProviderHttpResponse = { status: number; body: string; requestId?: string };
export type ProviderTransport = (
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
) => Promise<ProviderHttpResponse>;
/** Fixed HTTPS destinations, no redirects, bounded body and conservative uncertainty on interrupted I/O. */
export const providerHttps: ProviderTransport = (url, headers, body, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProviderFailure('ambiguous'));
      return;
    }
    let settled = false;
    let connectTimer: ReturnType<typeof setTimeout> | undefined,
      totalTimer: ReturnType<typeof setTimeout> | undefined;
    const clean = () => {
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      signal?.removeEventListener('abort', abort);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      clean();
      reject(new ProviderFailure('ambiguous'));
    };
    const done = (value: ProviderHttpResponse) => {
      if (settled) return;
      settled = true;
      clean();
      resolve(value);
    };
    const req = httpsRequest(
      url,
      {
        method: 'POST',
        headers: {
          ...headers,
          accept: 'application/json',
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
        },
      },
      (res) => {
        clearTimeout(connectTimer);
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          res.resume();
          done({ status, body: '' });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            fail();
            res.destroy();
            req.destroy();
          } else chunks.push(chunk);
        });
        res.on('aborted', fail);
        res.on('error', fail);
        res.on('end', () =>
          done({
            status,
            body: Buffer.concat(chunks).toString('utf8'),
            requestId:
              typeof res.headers['request-id'] === 'string' ? res.headers['request-id'] : undefined,
          }),
        );
      },
    );
    const abort = () => {
      fail();
      req.destroy();
    };
    req.on('error', fail);
    req.on('socket', (socket) => {
      if (!socket.connecting) clearTimeout(connectTimer);
      else socket.once('secureConnect', () => clearTimeout(connectTimer));
    });
    connectTimer = setTimeout(abort, 10000);
    totalTimer = setTimeout(abort, 90000);
    signal?.addEventListener('abort', abort, { once: true });
    req.end(body);
  });
function usage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ProviderFailure('ambiguous');
  return value;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function textParts(value: unknown, anthropic = false): string {
  return Array.isArray(value)
    ? value
        .map((part) => {
          const p = object(part);
          return (!anthropic || p.type === 'text') && typeof p.text === 'string' ? p.text : '';
        })
        .join('')
    : '';
}
export function liveProviders(
  options: {
    enabled?: () => boolean;
    secret?: (adapter: Adapter) => string | undefined;
    transport?: ProviderTransport;
  } = {},
): Record<Adapter, Provider> {
  const transport = options.transport ?? providerHttps;
  const enabled = options.enabled ?? (() => process.env.AI_LIVE_ENABLED === 'true');
  const secret =
    options.secret ?? ((adapter) => process.env['AI_' + adapter.toUpperCase() + '_API_KEY']);
  const provider =
    (adapter: Adapter): Provider =>
    async (profile, input, signal) => {
      const key = secret(adapter);
      if (
        !enabled() ||
        profile.adapter !== adapter ||
        profile.endpoint !== endpoints[adapter] ||
        profile.secret_reference !== 'ai.secrets.' + adapter ||
        !/^[a-zA-Z0-9._-]+$/.test(profile.model) ||
        !key
      )
        throw new ProviderFailure('unavailable');
      const url =
        endpoints[adapter] + (adapter === 'gemini' ? profile.model + ':generateContent' : '');
      const headers: Record<string, string> =
        adapter === 'anthropic'
          ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
          : { 'x-goog-api-key': key };
      const body =
        adapter === 'anthropic'
          ? {
              model: profile.model,
              max_tokens: profile.max_output_tokens,
              system: profile.prompt,
              messages: [{ role: 'user', content: JSON.stringify(input) }],
            }
          : {
              systemInstruction: { parts: [{ text: profile.prompt }] },
              contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
              generationConfig: {
                maxOutputTokens: profile.max_output_tokens,
                responseMimeType: 'application/json',
              },
            };
      let response: ProviderHttpResponse;
      try {
        response = await transport(
          url,
          headers,
          JSON.stringify(body),
          signal,
        );
      } catch (e) {
        throw e instanceof ProviderFailure ? e : new ProviderFailure('ambiguous');
      }
      if (response.status === 429) throw new ProviderFailure('throttled');
      if (response.status >= 500 || response.status < 100) throw new ProviderFailure('ambiguous');
      if (response.status < 200 || response.status >= 300) throw new ProviderFailure('refused');
      if (Buffer.byteLength(response.body) > 2 * 1024 * 1024)
        throw new ProviderFailure('ambiguous');
      let parsed: Record<string, unknown>;
      try {
        parsed = object(JSON.parse(response.body));
      } catch {
        throw new ProviderFailure('ambiguous');
      }
      if (adapter === 'anthropic') {
        const counts = object(parsed.usage);
        return {
          text: textParts(parsed.content, true),
          inputTokens: usage(counts.input_tokens),
          outputTokens: usage(counts.output_tokens),
          externalId: typeof parsed.id === 'string' ? parsed.id : (response.requestId ?? null),
          refused: parsed.stop_reason !== 'end_turn',
        };
      }
      const counts = object(parsed.usageMetadata),
        inputTokens = usage(counts.promptTokenCount),
        total = usage(counts.totalTokenCount);
      if (total < inputTokens) throw new ProviderFailure('ambiguous');
      const candidate = object(Array.isArray(parsed.candidates) ? parsed.candidates[0] : null);
      return {
        text: textParts(object(candidate.content).parts),
        inputTokens,
        outputTokens: total - inputTokens,
        externalId: typeof parsed.responseId === 'string' ? parsed.responseId : null,
        refused: candidate.finishReason !== 'STOP',
      } satisfies ProviderResult;
    };
  return { anthropic: provider('anthropic'), gemini: provider('gemini') };
}
