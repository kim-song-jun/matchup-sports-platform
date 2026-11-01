'use client';

import Link from 'next/link';
import { useId } from 'react';

type Props = {
  /**
   * `default` — "이 번호는 이미 쓰이고 있어요" 안내 아래에 붙는 한 줄.
   * `not-mine` — 계정 찾기 결과처럼 찾은 계정이 눈앞에 있어, 내 계정이 아닐 수 있는 사람에게 건네는 한 줄.
   */
  variant?: 'default' | 'not-mine';
  /** 앞의 안내 블록과 간격이 필요할 때만 켠다. 부모가 이미 gap 으로 띄우는 자리에서는 끈다. */
  spaced?: boolean;
};

const LEAD: Record<NonNullable<Props['variant']>, string> = {
  default: '번호를 최근에 새로 받았나요? 전에 이 번호를 쓰던 계정이 남아 있을 수 있어요.',
  'not-mine': '내 계정이 아닌가요? 번호를 최근에 새로 받았다면',
};

/**
 * 번호 하나는 계정 하나에만 묶인다. 통신사가 번호를 다시 내주면 새 주인이 "이미 가입된 번호"를 만나는데,
 * 옛 계정에는 로그인할 수 없어 길이 막힌다. 막지 않고 고객센터로 이어 주는 한 줄이다 —
 * 운영자가 확인해서 옛 계정에서 번호를 풀어 준다.
 * 번호는 주소에 싣지 않는다. 문의 창구에서 필요한 정보는 본인이 적는다.
 * 탈퇴 신청 중인 계정 안내(WithdrawalPendingGuide)에는 쓰지 않는다 — 거기에는 자기 문구의 고객센터 링크가 있다.
 */
export function RecycledNumberHelp({ variant = 'default', spaced = false }: Props) {
  const leadId = useId();
  return (
    <p className={`tm-recycled-help${spaced ? ' tm-recycled-help-spaced' : ''}`}>
      <span id={leadId} className="tm-recycled-help-lead">{LEAD[variant]}</span>
      {/* 링크 이름은 보이는 글자 그대로 두고, 무엇을 알리라는 건지는 같은 문단의 앞 문장과 설명으로 잇는다. */}
      <Link className="tm-btn tm-btn-sm tm-btn-ghost tm-btn-block" href="/contact" aria-describedby={leadId}>
        고객센터에 알려 주세요
      </Link>
    </p>
  );
}
