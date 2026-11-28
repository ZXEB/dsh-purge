import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';

const codec = (name, create) => ({ mode: 'strict', typeSymbol: `dsh-local-test#${name}`, create });
const target = codec('target', () => z.string().min(1).max(4096));
const timeout = codec('timeoutMs', () => z.number().int().min(250).max(15000));
export const TYPERT_REMOTE = createTypertRemoteInfo({
  package: 'dsh-local-test',
  methods: {
    'localTest/diagnose': {
      service: 'localTest', invocation: { kind: 'direct' }, parameters: [],
      result: codec('diagnostics', () => z.strictObject({
        pluginVersion: z.string(), runtimeVersion: z.string().nullable(), supportedDsh: z.string(),
        compatibility: z.enum(['unknown', 'matched', 'unverified']), nodeVersion: z.string(),
        platform: z.string(), architecture: z.string(), transport: z.literal('official-remote'),
      })),
    },
    'localTest/check': {
      service: 'localTest', invocation: { kind: 'direct' },
      parameters: [
        { name: 'target', source: 'json', codec: target, strictCodec: target },
        { name: 'timeoutMs', source: 'json', codec: timeout, strictCodec: timeout },
      ],
      cancellation: { parameter: 'signal' },
      result: codec('websiteResult', () => z.strictObject({
        url: z.string(), reachable: z.boolean(), httpOk: z.boolean(), status: z.number().int().nullable(),
        durationMs: z.number().int().nonnegative(), redirect: z.boolean(), error: z.string().nullable(),
      })),
    },
  },
}, z);
