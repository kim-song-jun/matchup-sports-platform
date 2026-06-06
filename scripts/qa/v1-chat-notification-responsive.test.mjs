import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');
const notificationReadPage = await readFile('apps/v1_web/src/app/notifications/read/page.tsx', 'utf8');

test('Given chat CSS When inspected Then input chrome uses shell safe-area tokens', () => {
  assert.match(css, /\.tm-chat-room\s*{[^}]*padding-bottom:\s*calc\(96px \+ var\(--v1-shell-safe-bottom\)\)/s);
  assert.match(css, /\.tm-chat-inputbar\s*{[^}]*bottom:\s*0/s);
  assert.match(css, /\.tm-chat-inputbar\s*{[^}]*padding:\s*12px 16px calc\(22px \+ var\(--v1-shell-safe-bottom\)\)/s);
});

test('Given notification and bubble CSS When inspected Then toast and bubbles stay inside narrow viewports', () => {
  assert.match(css, /\.tm-notification-toast\s*{[^}]*bottom:\s*calc\(22px \+ var\(--v1-shell-safe-bottom\)\)/s);
  assert.match(css, /\.tm-chat-bubble\s*{[^}]*max-width:\s*min\(286px,\s*calc\(100% - 28px\)\)/s);
  assert.match(css, /\.tm-chat-bubble-me\s*{[^}]*max-width:\s*min\(250px,\s*calc\(100% - 28px\)\)/s);
});

test('Given the notification read alias route When inspected Then it renders stable v1 UI instead of a redirect shell', () => {
  assert.match(notificationReadPage, /import \{ NotificationsPageClient \} from '@\/components\/community\/community-api-clients'/);
  assert.match(notificationReadPage, /return <NotificationsPageClient \/>/);
  assert.doesNotMatch(notificationReadPage, /redirect\(/);
});
