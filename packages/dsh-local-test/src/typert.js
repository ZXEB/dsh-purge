import { TYPERT_REMOTE } from './remote.js';

// Explicit public protocol metadata shared with the browser contribution.
export const TYPERT = {
  package: 'dsh-local-test', face: 'host', schemas: [],
  get invocations() { return TYPERT_REMOTE.descriptors; },
  model: { services: [{ key: 'localTest', exportName: 'default', tags: [], types: [], members: [
    { kind: 'method', name: 'diagnose', signature: 'diagnose(): object' },
    { kind: 'method', name: 'check', signature: 'check(target: string, timeoutMs: number, signal: AbortSignal): Promise<object>' },
  ] }], events: [], objects: [] },
};
