import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)![1]!;
const tokens = Object.fromEntries([...rootBlock.matchAll(/--dp-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('uses the approved brand values', () => {
    expect(tokens).toMatchObject({
      bg: '#0a0f1e',
      surface: '#111831',
      'surface-raised': '#18213f',
      border: '#26314f',
      text: '#e7ebf3',
      muted: '#9aa4bd',
      accent: '#4c8dff',
    });
  });

  const backgrounds = ['bg', 'surface', 'surface-raised', 'surface-hover'];
  const foregrounds = ['text', 'muted', 'accent', 'success', 'warning', 'danger', 'simulated'];
  const pairs = foregrounds.flatMap((fg) => backgrounds.map((bg) => [fg, bg] as const));

  it.each(pairs)('%s on %s meets WCAG AA for body text (4.5:1)', (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps text on accent fills at AA', () => {
    expect(contrast(tokens['on-accent']!, tokens.accent!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens['on-accent']!, tokens['accent-hover']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the focus ring visible against every background (3:1)', () => {
    for (const bg of backgrounds) expect(contrast(tokens.focus!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });
});
