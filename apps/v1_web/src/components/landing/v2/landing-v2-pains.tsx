import type { CSSProperties } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, FolderOpen, MessageCircle, PencilLine, type LucideIcon } from 'lucide-react';
import { LandingCtaLink, type LandingCtaId } from '../landing-cta-link';

/* 불편은 담백하게 적는다 — 운영자가 자기 업무를 놀리는 것으로 읽을 만한 밈·가짜 파일명은 쓰지 않는다. */
const PAINS: ReadonlyArray<{ Icon: LucideIcon; title: string; desc: string; chapter: string; fix: string }> = [
  { Icon: MessageCircle, title: '단톡방으로 인원 모으기', desc: '참석 투표를 올리고, 못 오는 사람이 생기면 다시 세요.', chapter: '#ch1', fix: '매치 모집으로' },
  { Icon: ClipboardList, title: '파일로 대진표 관리하기', desc: '결과가 나올 때마다 표를 고치고 다시 공유해요.', chapter: '#ch2', fix: '대진표·일정으로' },
  { Icon: PencilLine, title: '종이에 점수 적기', desc: '누가 넣었는지 경기가 끝난 뒤에 다시 맞춰 봐요.', chapter: '#ch3', fix: '경기 기록으로' },
  { Icon: FolderOpen, title: '여기저기 흩어진 기록', desc: '결과 사진과 메모가 대화방과 휴대폰에 흩어져 있어요.', chapter: '#ch4', fix: '전적·선수 카드로' },
];

const ROLE_LINKS: ReadonlyArray<{ href: string; cta: LandingCtaId; who: string; label: string }> = [
  { href: '/matches', cta: 'role_find_match', who: '개인으로 뛰고 싶다면', label: '경기 찾기' },
  { href: '/teams', cta: 'role_browse_teams', who: '함께할 팀이 필요하다면', label: '팀 둘러보기' },
  { href: '/tournaments', cta: 'role_view_tournaments', who: '대회에 나가고 싶다면', label: '대회 보기' },
];

/* 11개 모두 alpha 에 있는 기능 이름이다(결제·장터·강좌·AI 없음). */
const FEATURES = [
  '개인 매치', '팀 매치', '용병 모집', '대회 참가 신청', '정규 리그 순위표', '대진표',
  '라이브 스코어', '팀 전적', '선수 카드', '경기 후 상호평가', '매치·팀 채팅',
] as const;

const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

/** 승(불편 구체화) — 불편에 이름을 붙이고, 각 불편이 풀리는 챕터로 바로 내려가는 링크를 단다. */
export function LandingV2Pains() {
  return (
    <section id="pain" className="tm-landing-section" aria-labelledby="v2-pain-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">공감</p>
          <h2 id="v2-pain-heading" className="tm-landing-section-title">경기는 짧고,<br />준비는 길었어요</h2>
          <p className="tm-landing-section-sub">생활체육을 해 봤다면 한 번쯤 겪었던 네 가지예요.</p>
        </div>
        <ul className="tm-landing-v2-pains">
          {PAINS.map(({ Icon, title, desc, chapter, fix }, i) => (
            <li key={title} className="tm-landing-v2-pain" data-reveal style={stagger(i)}>
              <span className="tm-landing-v2-pain-icon" aria-hidden="true"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{desc}</p>
              <a className="tm-landing-v2-pain-fix" href={chapter}>
                {fix} 해결
                <ChevronDown size={16} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
        <LandingV2Roles />
      </div>
    </section>
  );
}

/** 역할별 목적지 — 탭 없이 서버가 그리는 링크 셋(크롤러·JS 없는 환경에서도 전부 보인다). */
function LandingV2Roles() {
  return (
    <div className="tm-landing-v2-roles" data-reveal>
      <p className="tm-landing-v2-roles-title">가입 전에 먼저 둘러보세요</p>
      <ul className="tm-landing-v2-role-list">
        {ROLE_LINKS.map((role) => (
          <li key={role.cta}>
            <LandingCtaLink className="tm-landing-v2-role-link" href={role.href} cta={role.cta} variant="v2">
              <span className="tm-landing-v2-role-who">{role.who}</span>
              <span className="tm-landing-v2-role-label">{role.label}</span>
              <ChevronRight className="tm-landing-v2-role-arrow" size={20} aria-hidden="true" />
            </LandingCtaLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 전(반전) — 페이지에서 유일한 강조 배경. 기능 이름이 흐르는 띠는 5초를 넘게 반복하므로
 * 뷰포트 밖·"움직임 멈추기"·hover·focus 에서 멈춘다. 복제 트랙은 스크린리더에서 뺀다.
 */
export function LandingV2Pivot() {
  return (
    <section className="tm-landing-v2-pivot" aria-labelledby="v2-pivot-heading">
      <div className="tm-landing-section-inner" data-reveal>
        <p className="tm-landing-v2-pivot-kicker">그래서 만들었어요</p>
        <h2 id="v2-pivot-heading" className="tm-landing-v2-pivot-title">그 번거로움,<br />이제 팀밋이 대신할게요</h2>
      </div>
      <div className="tm-landing-v2-marquee" data-loop="off">
        {[false, true].map((clone) => (
          <ul key={String(clone)} className="tm-landing-v2-marquee-track" aria-hidden={clone || undefined}>
            {FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
        ))}
      </div>
    </section>
  );
}
