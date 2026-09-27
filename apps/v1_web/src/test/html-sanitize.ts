/**
 * Test-only readers for server-rendered HTML strings. Parse with a `<template>` element (jsdom)
 * instead of regexes: regex tag stripping misses `<SCRIPT>` and nested/malformed markup (CodeQL).
 */

function parseIntoTemplate(html: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
}

/** Removes every <script> element (any case, any attributes) and returns the remaining markup. */
export function stripScriptTags(html: string): string {
  const template = parseIntoTemplate(html);
  template.content.querySelectorAll('script').forEach((script) => script.remove());
  return template.innerHTML;
}

/**
 * Parses the first `<script type="application/ld+json">` block's JSON payload, or `null` if
 * the HTML has none (e.g. a loading/error render that never seeds structured data).
 */
export function parseJsonLd<T = unknown>(html: string): T | null {
  const template = parseIntoTemplate(html);
  const script = template.content.querySelector('script[type="application/ld+json"]');
  if (!script?.textContent) return null;
  return JSON.parse(script.textContent) as T;
}
