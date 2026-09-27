/**
 * Test-only helpers for reading server-rendered HTML strings in *-first-html.test.tsx /
 * *-page-seed.test.tsx suites: stripping <script> blocks before asserting on visible body
 * markup, and pulling out the JSON-LD payload those scripts carry.
 *
 * Six of these test files used to duplicate `html.replace(/<script[\s\S]*?<\/script>/g, '')`.
 * CodeQL flagged that regex on two counts: it only matches lowercase `<script>` (an attacker
 * payload spelled `<SCRIPT>` survives), and even case-matched input isn't fully sanitized by a
 * single non-global-safe pass. A real HTML parser (via a `<template>` element, which jsdom
 * gives us in this test environment) doesn't have either problem — it finds `<script>`
 * elements the same way a browser does, regardless of case or malformed nesting.
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
