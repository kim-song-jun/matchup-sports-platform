import { describe, expect, it } from 'vitest';
import { parseJsonLd, stripScriptTags } from './html-sanitize';

describe('stripScriptTags', () => {
  it('removes a lowercase <script> block', () => {
    expect(stripScriptTags('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  it('removes an uppercase <SCRIPT> block (the case the old regex missed)', () => {
    expect(stripScriptTags('<p>hi</p><SCRIPT>alert(1)</SCRIPT>')).toBe('<p>hi</p>');
  });

  it('removes a script element carrying attributes', () => {
    expect(stripScriptTags('<p>hi</p><script type="application/ld+json">{"a":1}</script>')).toBe('<p>hi</p>');
  });

  it('removes every script element when several are nested among other markup', () => {
    const html = '<div><script>one()</script><p>keep</p><Script>two()</Script></div>';
    expect(stripScriptTags(html)).toBe('<div><p>keep</p></div>');
  });

  it('leaves non-script markup and attributes untouched', () => {
    const html = '<a href="/matches/1" data-x="y">Link</a>';
    expect(stripScriptTags(html)).toBe(html);
  });
});

describe('parseJsonLd', () => {
  it('parses the ld+json payload', () => {
    const html = '<script type="application/ld+json">{"itemListElement":[{"name":"a"}]}</script>';
    expect(parseJsonLd<{ itemListElement: Array<{ name: string }> }>(html)?.itemListElement).toEqual([{ name: 'a' }]);
  });

  it('returns null when there is no ld+json script', () => {
    expect(parseJsonLd('<p>no structured data</p>')).toBeNull();
  });
});
