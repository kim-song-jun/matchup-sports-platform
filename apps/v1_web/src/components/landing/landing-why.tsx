import type { CSSProperties } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { LandingBeforeAfter } from './landing-before-after';
import { LandingCtaLink, type LandingCtaId } from './landing-cta-link';

const PAINS = [
  { before: '단톡방에 "참석 가능?" 올리고 한 명씩 세기', after: '신청하면 모인 인원과 명단이 바로 정리돼요' },
  { before: '상대 팀 구하려고 커뮤니티마다 글 올리기', after: '팀 매치를 올리면 상대 팀이 신청해 와요' },
  { before: '경기 끝나고 엑셀로 승점·순위 계산', after: '결과가 확정되면 순위표와 전적에 바로 반영돼요' },
] as const;

const ROLE_LINKS: ReadonlyArray<{ href: string; cta: LandingCtaId; who: string; label: string }> = [
  { href: '/matches', cta: 'role_find_match', who: '개인으로 뛰고 싶다면', label: '경기 찾기' },
  { href: '/teams', cta: 'role_browse_teams', who: '함께할 팀이 필요하다면', label: '팀 둘러보기' },
  { href: '/tournaments', cta: 'role_view_tournaments', who: '대회에 나가고 싶다면', label: '대회 보기' },
];

export function LandingWhy() {
  return (
    <section id="why" className="tm-landing-section" aria-labelledby="why-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">왜 팀밋</p>
          <h2 id="why-heading" className="tm-landing-section-title">운동보다 준비가<br />더 힘들었다면</h2>
          <p className="tm-landing-section-sub">
            사람 모으기, 상대 찾기, 결과 정리. 경기 밖의 잔일은 팀밋이 맡을게요.
          </p>
        </div>
        <LandingBeforeAfter>
          <ul className="tm-landing-pains">
            {PAINS.map((pain, i) => (
              <li key={pain.after} className="tm-landing-pain" data-reveal style={{ '--i': i } as CSSProperties}>
                <p className="tm-landing-pain-before">
                  <span className="tm-landing-pain-label">예전엔</span>
                  <span className="tm-landing-pain-strike">{pain.before}</span>
                </p>
                <p className="tm-landing-pain-after">
                  <span className="tm-landing-pain-check" aria-hidden="true"><Check size={16} /></span>
                  <span><span className="sr-only">이제는 </span>{pain.after}</span>
                </p>
              </li>
            ))}
          </ul>
        </LandingBeforeAfter>
        <div className="tm-landing-roles" data-reveal>
          <p className="tm-landing-roles-title">지금 바로 둘러보세요</p>
          <ul className="tm-landing-role-list">
            {ROLE_LINKS.map((role) => (
              <li key={role.cta}>
                <LandingCtaLink className="tm-landing-role-link" href={role.href} cta={role.cta}>
                  <span className="tm-landing-role-who">{role.who}</span>
                  <span className="tm-landing-role-label">{role.label}</span>
                  <ChevronRight className="tm-landing-role-arrow" size={20} aria-hidden="true" />
                </LandingCtaLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
