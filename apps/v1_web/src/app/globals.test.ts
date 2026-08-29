import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsCss = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('mobile floating action button layout', () => {
  it('keeps the FAB above both the bottom navigation and the native safe inset', () => {
    const rule = globalsCss.match(/\.tm-floating-fab\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    expect(rule).toMatch(
      /bottom:\s*calc\(var\(--v1-shell-bottom-nav-height\)\s*\+\s*var\(--v1-shell-safe-bottom\)\s*\+\s*18px\)/,
    );
  });
});

describe('Android bottom inset layout', () => {
  it('keeps no-bottom-nav pages above the system navigation area', () => {
    const rule = globalsCss.match(/\.tm-app-frame-no-bottom \.tm-scroll-area\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    expect(rule).toMatch(/bottom:\s*var\(--v1-shell-safe-bottom\)/);
  });

  it('does not reserve the inset twice when a child surface already consumes it', () => {
    expect(globalsCss).toMatch(
      /\.tm-app-frame-no-bottom \.tm-scroll-area:has\(\.tm-fixed-cta\),\s*\.tm-app-frame-no-bottom \.tm-scroll-area:has\(\.tm-chat-room\)\s*\{\s*bottom:\s*0;/,
    );
  });
});
