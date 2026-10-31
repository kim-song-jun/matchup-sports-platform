'use client';

import { CalendarCheck, Check, Clock, Link as LinkIcon } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { formatMonthDay } from '@/lib/date-utils';

export type WithdrawalGuideStep = { title: string; body?: string };

type Props = {
  /**
   * 번호를 쥔 계정의 유예가 끝나는 시각(ISO). 서버가 모르면 null — 그때는 날짜가 든 "방법 2"를 그리지 않는다.
   * 읽을 수 없는 값도 같은 취급이다.
   */
  until: string | null;
  /** 방법 1 의 단계. 마지막 단계는 숫자 대신 끝 표시(체크 또는 연결 아이콘)로 그린다. */
  steps: readonly WithdrawalGuideStep[];
  finishIcon?: 'check' | 'link';
  /** 방법 2 일정의 마지막 칸 — 삭제된 뒤에 할 수 있게 되는 일. */
  waitedText: string;
  /** 방법 1 카드 맨 아래 버튼. 화면이 따로 고정 버튼을 가졌으면 생략한다. */
  actions?: ReactNode;
  /** 화면에 제목이 따로 없을 때만 생략한다. 있으면 배지·제목·(계정)·안내 문장을 위에 그린다. */
  head?: { title: string; lead?: string; account?: { label: string; value: string } };
  /** 번호 인증 칸이 이 안내로 바뀌는 화면에서 제목으로 포커스를 옮겨 바뀐 줄 알게 한다. */
  focusHeadingOnMount?: boolean;
  className?: string;
};

/**
 * 번호를 쥔 계정이 탈퇴를 신청한 상태일 때의 안내. 두 가지 방법을 나눠 각각 그다음에 생기는 일을 보여 준다 —
 * 방법 1(로그인해서 탈퇴 취소)은 세로 단계, 방법 2(기다리기)는 가로 일정이다.
 * 계정 찾기·이메일 가입·소셜 계정 충돌 안내가 같은 모양을 쓰고, 화면마다 달라지는 것은 문구와 버튼뿐이다.
 */
export function WithdrawalPendingGuide({
  until,
  steps,
  finishIcon = 'check',
  waitedText,
  actions,
  head,
  focusHeadingOnMount = false,
  className,
}: Props) {
  const headingId = useId();
  const leadId = useId();
  const wayOneId = useId();
  const wayTwoId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeadingOnMount) headingRef.current?.focus();
  }, [focusHeadingOnMount]);

  const dueLabel = until === null ? null : formatMonthDay(until);
  const FinishIcon = finishIcon === 'link' ? LinkIcon : Check;
  // 화면에 h1 이 이미 있다. 제목 블록(h2)이 있으면 방법은 그 아래 h3, 없으면 바로 h2.
  const WayHeading = head ? 'h3' : 'h2';

  return (
    <div className={['tm-wpg', className].filter(Boolean).join(' ')}>
      {head ? (
        <div className="tm-wpg-head">
          <span className="tm-badge tm-badge-orange">
            <Clock size={14} aria-hidden="true" />
            탈퇴 신청 중
          </span>
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            aria-describedby={head.lead ? leadId : undefined}
            className="tm-text-body-lg tm-wpg-title"
          >
            {head.title}
          </h2>
          {head.account ? (
            <div className="tm-wpg-account">
              <span className="tm-text-caption">{head.account.label}</span>
              <span className="tm-text-body-lg">{head.account.value}</span>
            </div>
          ) : null}
          {head.lead ? <p id={leadId} className="tm-wpg-lead">{head.lead}</p> : null}
        </div>
      ) : null}

      <Card pad={16} className="tm-wpg-way">
        <WayHeading id={wayOneId} className="tm-wpg-way-head">
          <span className="tm-wpg-way-no tm-wpg-way-no-one">방법 1</span>
          <span className="tm-text-card-title">지금 바로 쓰기</span>
        </WayHeading>
        <ol className="tm-wpg-steps" role="list" aria-labelledby={wayOneId}>
          {steps.map((step, index) => {
            const finish = index === steps.length - 1;
            return (
              <li className="tm-wpg-step" key={step.title}>
                <span className={`tm-wpg-num${finish ? ' tm-wpg-num-done' : ''}`} aria-hidden="true">
                  {finish ? <FinishIcon size={16} strokeWidth={2.5} aria-hidden="true" /> : index + 1}
                </span>
                <span>
                  <span className="tm-wpg-step-title">{step.title}</span>
                  {step.body ? <span className="tm-wpg-step-body">{step.body}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
        {actions ? <div className="tm-wpg-actions">{actions}</div> : null}
      </Card>

      {until !== null && dueLabel ? (
        <Card pad={16} className="tm-wpg-way">
          <WayHeading id={wayTwoId} className="tm-wpg-way-head">
            <span className="tm-wpg-way-no tm-wpg-way-no-two">방법 2</span>
            <span className="tm-text-card-title">기다리기</span>
          </WayHeading>
          <ol className="tm-wpg-time" role="list" aria-label="기다릴 때의 일정">
            <li className="tm-wpg-node">
              <span className="tm-wpg-dot tm-wpg-dot-now" aria-hidden="true"><Clock size={16} aria-hidden="true" /></span>
              <strong>오늘</strong>
              <span className="tm-wpg-node-text">탈퇴 신청 중</span>
            </li>
            <li className="tm-wpg-node tm-wpg-node-due">
              <span className="tm-wpg-dot tm-wpg-dot-due" aria-hidden="true"><CalendarCheck size={16} aria-hidden="true" /></span>
              <strong><time dateTime={until}>{dueLabel}</time></strong>
              <span className="tm-wpg-node-text">계정이 삭제돼요</span>
            </li>
            <li className="tm-wpg-node">
              <span className="tm-wpg-dot tm-wpg-dot-free" aria-hidden="true"><Check size={16} aria-hidden="true" /></span>
              <strong>그다음</strong>
              <span className="tm-wpg-node-text">{waitedText}</span>
            </li>
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
