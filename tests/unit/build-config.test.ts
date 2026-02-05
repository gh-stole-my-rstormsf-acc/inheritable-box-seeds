// @vitest-environment node
import { describe, expect, it } from 'vitest';
import configFactory from '../../vite.config';

type Command = 'build' | 'serve';

const getConfig = (command: Command) => {
  if (typeof configFactory === 'function') {
    return configFactory({ command, mode: command === 'build' ? 'production' : 'development' }) as any;
  }
  return configFactory as any;
};

const sampleHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'">
  </head>
  <body></body>
</html>`;

const getCspTokens = (html: string) => {
  const match = html.match(/content="([^"]+)"/i);
  if (!match) return [] as string[];
  return match[1].split(/\s+/).map((token) => token.replace(/;$/, ''));
};

describe('build config', () => {
  it('uses relative base for GitHub Pages', () => {
    const config = getConfig('build');
    expect(config.base).toBe('./');
  });

  it('drops unsafe-eval in production CSP', () => {
    const config = getConfig('build');
    const transform = config.transformIndexHtml as (html: string) => string;
    const output = transform(sampleHtml);
    const tokens = getCspTokens(output);
    expect(tokens).toContain("'wasm-unsafe-eval'");
    expect(tokens).not.toContain("'unsafe-eval'");
  });

  it('keeps unsafe-eval in dev CSP for HMR', () => {
    const config = getConfig('serve');
    const transform = config.transformIndexHtml as (html: string) => string;
    const output = transform(sampleHtml);
    const tokens = getCspTokens(output);
    expect(tokens).toContain("'unsafe-eval'");
  });
});
