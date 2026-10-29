import { expect, it, vi } from 'vitest';
import { appVersion, noteServerVersion } from './appVersion';

const reply = (version?: string) => new Response(null, { headers: version ? { 'X-App-Version': version } : {} });

it('só avisa quando o servidor anuncia outra versão que não a desta página', () => {
  const listener = vi.fn();
  appVersion.subscribe(listener);
  noteServerVersion(reply('abc'), 'abc'); // a mesma
  noteServerVersion(reply(), 'abc'); // servidor sem versão (local)
  noteServerVersion(reply('xyz'), ''); // página sem versão (local)
  expect(appVersion.outdated()).toBe(false);
  noteServerVersion(reply('xyz'), 'abc');
  expect(appVersion.outdated()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
});
