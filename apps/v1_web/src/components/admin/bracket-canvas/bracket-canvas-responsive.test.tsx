/**
 * 768 이 경계다(스펙 D8: 구조 편집은 768px 이상). 두 뷰 중 **하나만** 마운트돼야 한다 —
 * 둘 다 마운트하면 모바일에서도 데스크톱 캔버스의 끌어 놓기·같은 aria-label 이 살아 있다.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installViewport, resizeViewport } from '@/test/viewport';
import { BracketCanvasResponsive } from './bracket-canvas-responsive';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function renderSwitch() {
  return render(
    <BracketCanvasResponsive
      wide={<div data-testid="wide-view">큰 화면</div>}
      narrow={<div data-testid="narrow-view">작은 화면</div>}
    />,
  );
}

describe('BracketCanvasResponsive', () => {
  it('767px 는 모바일 뷰만 마운트한다', () => {
    restore = installViewport(767);
    renderSwitch();
    expect(screen.getByTestId('narrow-view')).toBeInTheDocument();
    expect(screen.queryByTestId('wide-view')).not.toBeInTheDocument();
  });

  it('768px 부터 큰 화면 뷰만 마운트한다', () => {
    restore = installViewport(768);
    renderSwitch();
    expect(screen.getByTestId('wide-view')).toBeInTheDocument();
    expect(screen.queryByTestId('narrow-view')).not.toBeInTheDocument();
  });

  it('창 크기가 바뀌면 뷰가 교체되고 이전 뷰는 언마운트된다', () => {
    restore = installViewport(390);
    renderSwitch();
    expect(screen.getByTestId('narrow-view')).toBeInTheDocument();

    resizeViewport(1200);
    expect(screen.getByTestId('wide-view')).toBeInTheDocument();
    expect(screen.queryByTestId('narrow-view')).not.toBeInTheDocument();

    resizeViewport(500);
    expect(screen.getByTestId('narrow-view')).toBeInTheDocument();
    expect(screen.queryByTestId('wide-view')).not.toBeInTheDocument();
  });
});
