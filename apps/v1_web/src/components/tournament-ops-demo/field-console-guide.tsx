'use client';

import { useId, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import styles from './demo.module.css';
import guide from './field-console-guide.module.css';

const STEPS = [
  { target: 'overview', title: '먼저 팀·점수·경기 시간을 확인해요', body: '실제 필드 담당자의 콘솔 화면이에요. 두 팀 이름, 점수, 전·후반과 경기 시간을 여기서 확인해요. 안내는 샘플 미리보기이며 체험 기록은 바뀌지 않아요.' },
  { target: 'commands', title: '준비가 끝나면 ‘경기 시작’을 눌러요', body: '양 팀과 출전 명단 확인 → 경기 시작 → 확인창에서 시작 확인 순서예요. 시간이 흐르고 기록 버튼이 나타나요. 휴대폰에서는 이 버튼이 화면 아래에 있어요.' },
  { target: 'events', title: '기록 버튼 → 팀·선수 선택 → 확인', body: '경기 시작 후의 화면이에요. 골·카드·파울은 버튼을 누르고 팀과 선수를 골라 기록해요. 교체는 나갈 선수 → 들어올 선수 순서로 골라요.' },
  { target: 'history', title: '기록이 맞는지 여기서 확인해요', body: '기록은 최신순으로 쌓이고 득점은 점수에도 반영돼요. 잘못 기록했다면 해당 기록을 취소해요. 선발·후보 명단도 콘솔에서 확인할 수 있어요.' },
  { target: 'commands', title: '전후반을 마치고 ‘경기 종료’를 눌러요', body: '전반 종료 → 후반 시작 → 후반 종료 → 경기 종료 순서예요. 잠시 멈출 땐 일시 중지·재개를 써요. 이제 시작 전 샘플 경기에서 직접 체험해 보세요.' },
] as const;

type Bounds = { top: number; left: number; width: number; height: number; viewportWidth: number; viewportHeight: number };

export function FieldConsoleGuide({ root, step, onStep, onFinish }: {
  root: RefObject<HTMLDivElement | null>; step: number; onStep: (step: number) => void; onFinish: () => void;
}) {
  const id = useId();
  const { dialogRef } = useModalA11y({ open: true, onClose: onFinish, initialFocus: 'dialog', closeOnBack: false });
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const current = STEPS[step];
  useLayoutEffect(() => {
    const element = root.current?.querySelector<HTMLElement>(`[data-console-guide="${current.target}"]`);
    if (!element) { setBounds(null); return; }
    element.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    if (window.getComputedStyle(element).position !== 'fixed') {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const panelHeight = dialogRef.current?.getBoundingClientRect().height ?? 260;
      const targetTop = 16 + Math.max(0, (viewportHeight - panelHeight - 48 - rect.height) / 2);
      window.scrollBy({ top: rect.top - targetTop, behavior: 'instant' });
    }
    function measure() {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = Math.max(8, rect.top - 6);
      const left = Math.max(8, rect.left - 6);
      setBounds({ top, left, width: Math.max(0, Math.min(rect.right + 6, viewportWidth - 8) - left), height: Math.max(0, Math.min(rect.bottom + 6, viewportHeight - 8) - top), viewportWidth, viewportHeight });
    }
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.visualViewport?.removeEventListener('resize', measure); observer?.disconnect(); };
  }, [step, current.target, root, dialogRef]);

  const panelAtTop = bounds !== null && bounds.top + bounds.height / 2 > bounds.viewportHeight / 2;
  const targetX = bounds ? bounds.left + bounds.width / 2 : 0;
  const targetY = bounds ? panelAtTop ? bounds.top : bounds.top + bounds.height : 0;
  const panelRect = dialogRef.current?.getBoundingClientRect();
  const arrowStartY = panelRect ? panelAtTop ? panelRect.bottom + 6 : panelRect.top - 6 : targetY;
  const arrowStartX = panelRect ? panelRect.left + panelRect.width / 2 : targetX;
  const arrowVisible = bounds && panelRect && Math.abs(arrowStartY - targetY) > 16;

  if (typeof document === 'undefined') return null;
  return createPortal(<div className={guide.layer}>
    {bounds ? <>
      <div className={guide.shade} style={{ inset: `0 0 auto 0`, height: bounds.top }} />
      <div className={guide.shade} style={{ top: bounds.top, left: 0, width: bounds.left, height: bounds.height }} />
      <div className={guide.shade} style={{ top: bounds.top, left: bounds.left + bounds.width, right: 0, height: bounds.height }} />
      <div className={guide.shade} style={{ top: bounds.top + bounds.height, insetInline: 0, bottom: 0 }} />
      <div className={guide.spotlight} aria-hidden="true" style={{ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }} />
      {arrowVisible && <svg className={guide.arrow} aria-hidden="true" width={bounds.viewportWidth} height={bounds.viewportHeight}>
        <defs><marker id={`${id}-arrow`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="var(--blue500)" strokeWidth="2" /></marker></defs>
        <path d={`M ${arrowStartX} ${arrowStartY} L ${targetX} ${targetY + (panelAtTop ? -8 : 8)}`} fill="none" stroke="var(--blue500)" strokeWidth="3" markerEnd={`url(#${id}-arrow)`} />
      </svg>}
    </> : <div className={guide.shade} style={{ inset: 0 }} />}
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} tabIndex={-1}
      className={guide.panel} style={panelAtTop ? { top: 'max(16px, env(safe-area-inset-top))' } : { bottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      <div aria-live="polite" aria-atomic="true">
        <p className={styles.eyebrow}>콘솔 사용 안내 · {step + 1}/{STEPS.length}</p>
        <h2 id={`${id}-title`} className="tm-text-body-lg font-bold mb-2">{current.title}</h2>
        <p id={`${id}-body`} className={styles.muted}>{current.body}</p>
      </div>
      <div className={`${styles.actions} mt-4`}>
        <button className={styles.quiet} onClick={onFinish}>건너뛰기</button>
        {step > 0 && <button className={styles.secondary} onClick={() => onStep(step - 1)}>이전</button>}
        <button className={styles.primary} onClick={() => step === STEPS.length - 1 ? onFinish() : onStep(step + 1)}>{step === STEPS.length - 1 ? '직접 체험하기' : '다음'}</button>
      </div>
    </div>
  </div>, document.body);
}
