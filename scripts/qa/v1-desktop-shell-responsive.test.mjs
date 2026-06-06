import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');
const shell = await readFile('apps/v1_web/src/components/v1-ui/shell.tsx', 'utf8');
const openDesignShellCss = await readFile('/Users/sungjun/Library/Application Support/Open Design/namespaces/release-stable/data/projects/dc57a253-6a77-4c01-b76b-6a4d1a9037d7/assets/shell.css', 'utf8');
const openDesignShellHtml = await readFile('/Users/sungjun/Library/Application Support/Open Design/namespaces/release-stable/data/projects/dc57a253-6a77-4c01-b76b-6a4d1a9037d7/assets/shell.html', 'utf8');

test('Given desktop AppChrome When rendered at desktop widths Then it exposes a desktop navigation surface', () => {
  assert.match(shell, /function DesktopNav\(/);
  assert.match(shell, /<DesktopNav activeTab=\{activeTab\} \/>/);
  assert.match(css, /\.tm-desktop-nav\s*{/);
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*\.tm-desktop-nav\s*{[\s\S]*display:\s*flex/);
});

test('Given the Open Design desktop shell When inspected Then the canonical workspace is 1280 with a 240px sidebar', () => {
  assert.match(openDesignShellCss, /--nav-w:\s*240px/);
  assert.match(openDesignShellCss, /grid-template-columns:\s*240px 1fr/);
  assert.match(openDesignShellCss, /max-width:\s*1280px/);
  assert.match(openDesignShellHtml, /<aside class="sidebar">/);
  assert.match(openDesignShellHtml, /class="nav-item"/);
});

test('Given the Open Design desktop shell Then v1 uses a 240px sidebar inside a fluid desktop workspace', () => {
  assert.match(css, /--v1-desktop-nav-width:\s*240px/);
  assert.match(css, /--v1-desktop-content-max:\s*100vw/);
  assert.match(css, /@media \(min-width:\s*1024px\)\s*{[\s\S]*?\.tm-app-frame\s*{[^}]*--v1-app-chrome-frame-width:\s*min\(100vw,\s*var\(--v1-desktop-content-max\)\);[^}]*width:\s*var\(--v1-app-chrome-frame-width\);[^}]*max-width:\s*none;[^}]*grid-template-columns:\s*var\(--v1-desktop-nav-width\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /@media \(min-width:\s*1024px\)\s*{[\s\S]*?\.tm-app-frame\s*{[^}]*max-width:\s*var\(--v1-desktop-content-max\)/);
  assert.match(css, /@media \(min-width:\s*1024px\)\s*{[\s\S]*?\.tm-fixed-cta\s*{[^}]*left:\s*calc\(\(100vw - var\(--v1-app-chrome-frame-width\)\) \/ 2 \+ var\(--v1-desktop-nav-width\)\);[^}]*width:\s*calc\(var\(--v1-app-chrome-frame-width\) - var\(--v1-desktop-nav-width\)\)/);
  assert.doesNotMatch(css, /@media \(min-width:\s*1024px\)\s*{[\s\S]*?\.tm-fixed-cta\s*{[^}]*left:\s*var\(--v1-desktop-nav-width\);[^}]*width:\s*calc\(100vw - var\(--v1-desktop-nav-width\)\)/);
});

test('Given the Open Design mobile-first contract When mapped to v1 Then the desktop shell must still preserve mobile-first visibility rules', () => {
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*\.tm-bottom-nav\s*{[\s\S]*display:\s*none/);
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*\.tm-floating-fab\s*{[\s\S]*display:\s*none/);
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*\.tm-scroll-area\s*{[\s\S]*bottom:\s*0/);
});
