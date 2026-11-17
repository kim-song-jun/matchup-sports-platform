import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 화면 아래에 붙는 시트·모달(`fixed inset-0 ... items-end`)의 safe-area 래칫.
 *
 * Android 앱 셸은 WebView 가 내비게이션 바 밑까지 그려지는 edge-to-edge 라서, 시트가 안전 영역을
 * 피하지 않으면 맨 아래 버튼이 내비게이션 바에 가려져 눌리지 않는다(경기 운영 콘솔의 "익명 골로
 * 기록" 실사고). 앱 셸이 내려주는 `--v1-shell-safe-bottom` 만 읽어야 한다 — 이 값은 viewport-fit=cover
 * 없이도 셸이 직접 채우고, 웹 브라우저에서는 0 이라 화면이 달라지지 않는다(`globals.test.ts` 참고).
 * 새 시트를 만들면서 이 변수를 빠뜨리면 이 테스트가 실패한다.
 */
const SRC = resolve(process.cwd(), 'src');
const BOTTOM_EDGE_OVERLAY = /fixed inset-0[^"'`]*items-end/;
const SAFE_AREA_VARIABLE = '--v1-shell-safe-bottom';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [path] : [];
  });
}

describe('bottom-edge overlays honour the native bottom safe area', () => {
  const overlays = sourceFiles(SRC).filter((path) => BOTTOM_EDGE_OVERLAY.test(readFileSync(path, 'utf8')));

  it('finds the overlays this ratchet is meant to cover', () => {
    const names = overlays.map((path) => relative(SRC, path).replace(/\\/g, '/'));
    expect(names).toEqual(
      expect.arrayContaining([
        'shared/game-operations/action-target-picker.tsx',
        'shared/game-operations/assist-picker-sheet.tsx',
        'components/tournament-live/operate/penalty-shootout-panel.tsx',
        'components/v1-ui/action-sheet.tsx',
        'components/v1-ui/confirm-modal.tsx',
      ]),
    );
  });

  it.each(overlays.map((path) => [relative(SRC, path).replace(/\\/g, '/'), path]))(
    '%s reads the native bottom safe area variable',
    (_name, path) => {
      expect(readFileSync(path, 'utf8')).toContain(SAFE_AREA_VARIABLE);
    },
  );
});
