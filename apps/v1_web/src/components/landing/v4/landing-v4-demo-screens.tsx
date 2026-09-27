import type { CSSProperties, Dispatch } from 'react';
import Image from 'next/image';
import { Check, RefreshCw } from 'lucide-react';
import { BellIcon, PlusIcon, SearchIcon } from '@/components/v1-ui/icons';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import {
  DEMO_MATCHES,
  RECORDS,
  SPORT_FILTERS,
  filledCount,
  matchBadge,
  visibleMatches,
  type DemoAction,
  type DemoMatch,
  type DemoState,
  type RecordScope,
  type SportFilter,
} from './landing-v4-demo-state';

/* 폰 안 화면(홈·매치·팀·마이). 사람은 이니셜·등번호로만 적는다 — 전부 가상의 예시다. */

type ScreenProps = { state: DemoState; dispatch: Dispatch<DemoAction> };

function SportChips({ state, dispatch, label, goToMatch }: ScreenProps & { label: string; goToMatch?: boolean }) {
  return (
    <div className="lpm-chips" role="group" aria-label={label}>
      {SPORT_FILTERS.map((filter: SportFilter) => {
        const on = !goToMatch && state.filter === filter;
        return (
          <button
            key={filter}
            type="button"
            className="lpm-chip tm-landing-v4-hit"
            data-on={on || (goToMatch && filter === '전체')}
            aria-pressed={goToMatch ? undefined : on}
            onClick={() => dispatch({ type: 'filter', filter, goToMatch })}
          >
            {filter}
          </button>
        );
      })}
    </div>
  );
}

function MatchCard({ state, dispatch, match, tryTarget }: ScreenProps & { match: DemoMatch; tryTarget?: boolean }) {
  const filled = filledCount(state, match);
  const badge = matchBadge(filled, match.capacity);
  const applied = state.applied[match.id];
  const fill = { '--tm-landing-v4-fill': filled / match.capacity } as CSSProperties;
  return (
    <div className="lpm-mcard">
      <Image src={match.image} alt="" width={320} height={320} sizes="72px" />
      <div>
        <div className="lpm-mcard-meta">{match.meta}</div>
        <div className="lpm-mcard-title">
          <span className="lpm-badge" data-tone={badge.tone}>{badge.label}</span>
          {match.title}
        </div>
        <div className="lpm-mcard-when">{match.when}</div>
        <div className="lpm-bar"><i className="tm-landing-v4-bar-fill" style={fill} /></div>
        <div className="lpm-mcard-foot tm-landing-v4-mcard-foot">
          <span className="tm-landing-v4-num">{filled}/{match.capacity}명</span>
          <button
            type="button"
            className="tm-landing-v4-hit tm-landing-v4-apply"
            aria-pressed={applied}
            data-try-target={tryTarget ? 'apply' : undefined}
            onClick={() => dispatch({ type: 'apply', id: match.id })}
          >
            {applied ? '신청 완료' : '신청하기'}
            <span className="sr-only"> {match.title}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function DemoHomeScreen({ state, dispatch }: ScreenProps) {
  return (
    <>
      <div className="lpm-appbar">
        <BrandMark size={26} />
        <span className="lpm-appbar-title">teameet</span>
        <BellIcon size={24} aria-hidden="true" />
      </div>
      <div className="lpm-body">
        <p className="lpm-greet">안녕하세요,<br />한강 10번님</p>
        <SportChips state={state} dispatch={dispatch} label="종목으로 매치 보기" goToMatch />
        <button
          type="button"
          className="lpm-cover tm-landing-v4-hit tm-landing-v4-cover"
          aria-label="가을 풋살 챔피언십 결승 라이브 보기"
          onClick={() => dispatch({ type: 'tab', tab: 'cup', sub: 'live', announce: true })}
        >
          <span className="lpm-badge" data-tone="live">LIVE · 결승</span>
          <Image src="/illustrations/sport-futsal-hero-320.webp" alt="" width={320} height={320} sizes="120px" />
          <b>가을 풋살 챔피언십</b>
          <span>FC 한강 vs 성수 러너스 · 후반 진행 중</span>
        </button>
        <div className="lpm-sect"><b>추천 매치</b><span>전체보기</span></div>
        <MatchCard state={state} dispatch={dispatch} match={DEMO_MATCHES[0]} />
      </div>
    </>
  );
}

export function DemoMatchScreen({ state, dispatch }: ScreenProps) {
  const matches = visibleMatches(state.filter);
  return (
    <>
      <div className="lpm-body lpm-body-top">
        <div className="lpm-search" aria-hidden="true">지역, 시간, 매치명 검색<SearchIcon size={20} /></div>
        <div className="lpm-seg" aria-hidden="true"><span>팀</span><span data-on="true">개인</span></div>
        <SportChips state={state} dispatch={dispatch} label="종목 필터" />
        <div className="lpm-summary"><b>성동구 · 개인 매치</b><span>경기 전 매치 {matches.length}개</span></div>
        {matches.map((match) => (
          <MatchCard key={match.id} state={state} dispatch={dispatch} match={match} tryTarget={match.id === 'seongsu'} />
        ))}
        {matches.length === 0 ? (
          <div className="tm-landing-v4-empty">
            <Image src="/illustrations/matches-empty-320.webp" alt="" width={320} height={320} sizes="120px" />
            <b>이 종목 매치가 아직 없어요</b>
            <span>체험용 예시 화면이에요</span>
          </div>
        ) : null}
      </div>
      <span className="lpm-fab" aria-hidden="true"><PlusIcon size={28} /></span>
    </>
  );
}

const RECORD_SCOPES: readonly RecordScope[] = ['all', 'cup', 'league', 'friendly'];
const TEAM_MEMBERS = [
  { initial: 'A', role: '팀장' },
  { initial: 'B', role: '운영진' },
  { initial: 'C', role: '멤버' },
  { initial: 'D', role: '멤버' },
] as const;

export function DemoTeamScreen({ state, dispatch }: ScreenProps) {
  const record = RECORDS[state.record];
  const total = record.w + record.d + record.l;
  return (
    <>
      <div className="lpm-appbar"><span className="lpm-appbar-title">팀</span><BellIcon size={24} /></div>
      <div className="lpm-body">
        <div className="lpm-team-head">
          <span className="lpm-team-logo" aria-hidden="true">FC</span>
          <div>
            <div className="lpm-team-name">FC 한강</div>
            <div className="lpm-tags">
              <span className="lpm-badge" data-tone="blue">풋살</span>
              <span className="lpm-badge" data-tone="grey">서울 성동</span>
              <span className="lpm-badge" data-tone="grey">중급</span>
            </div>
          </div>
        </div>
        <div className="lpm-tabs" role="group" aria-label="전적 범위">
          {RECORD_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              className="tm-landing-v4-hit tm-landing-v4-record-tab"
              data-on={state.record === scope}
              aria-pressed={state.record === scope}
              onClick={() => dispatch({ type: 'record', scope })}
            >
              {RECORDS[scope].label}
            </button>
          ))}
        </div>
        <div className="lpm-card">
          <div className="lpm-wdl tm-landing-v4-wdl" key={state.record}>
            <div><b>{record.w}</b><span>승</span></div>
            <div><b>{record.d}</b><span>무</span></div>
            <div><b>{record.l}</b><span>패</span></div>
          </div>
          <div
            className="lpm-wdl-bar tm-landing-v4-wdl-bar"
            aria-hidden="true"
            style={{ gridTemplateColumns: `${record.w}fr ${record.d}fr ${record.l}fr` }}
            data-total={total}
          >
            <i data-part="win" /><i data-part="draw" /><i data-part="loss" />
          </div>
        </div>
        <div className="lpm-sect"><b>멤버</b><span>역할 순</span></div>
        <ul className="lpm-roster">
          {TEAM_MEMBERS.map((member) => (
            <li key={member.initial}>
              <span className="lpm-av" aria-hidden="true">{member.initial}</span>팀원 {member.initial}<span>{member.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* 실제 카드처럼 1~99 능력치다("엔트리" 라벨도 서버 값 그대로 — landing-competition-screens.tsx 와 같다). */
const CARD_STATS = [
  { value: 64, label: '골' },
  { value: 58, label: '도움' },
  { value: 83, label: '엔트리' },
  { value: 76, label: '실력' },
  { value: 92, label: '매너' },
  { value: 95, label: '시간약속' },
] as const;

const CARD_BACK = [
  '공식 경기 기록이 자동으로 쌓여요',
  '등급은 실력이 아니라 활동량으로 올라가요',
  '공개 신원은 닉네임만, 카드 숨김도 가능',
  '링크 하나로 카드 공유',
] as const;

export function DemoMyScreen({ state, dispatch }: ScreenProps) {
  return (
    <>
      <div className="lpm-appbar"><span className="lpm-appbar-title">선수 카드</span><BellIcon size={24} /></div>
      <div className="lpm-body">
        <button
          type="button"
          className="tm-landing-v4-flip"
          aria-pressed={state.flipped}
          data-try-target="flip"
          onClick={() => dispatch({ type: 'flip' })}
        >
          <span className="sr-only">선수 카드 뒤집기. </span>
          <span className="tm-landing-v4-flip-inner">
            <span className="tm-landing-v4-flip-face tm-player-card lpm-pcard" data-tier="gold" data-shape="rect">
              <span className="lpm-pcard-face">
                <span className="lpm-pcard-top">
                  <span className="lpm-pcard-ovr"><b>78</b><span>MF</span></span>
                  <span className="lpm-pcard-avatar">10</span>
                </span>
                <span className="lpm-pcard-name">한강 10번</span>
                <span className="lpm-pcard-team">FC 한강 · 풋살</span>
                <span className="lpm-pcard-stats">
                  {CARD_STATS.map((stat) => (
                    <span key={stat.label}><b>{stat.value}</b><span>{stat.label}</span></span>
                  ))}
                </span>
                <span className="lpm-pcard-tier">GOLD · 활동량 기준 등급</span>
              </span>
            </span>
            <span className="tm-landing-v4-flip-face tm-landing-v4-flip-back tm-player-card lpm-pcard" data-tier="gold" data-shape="rect" aria-hidden="true">
              <span className="lpm-pcard-face">
                <span className="lpm-pcard-name">카드 뒷면</span>
                <span className="lpm-pcard-team">한강 10번 · FC 한강</span>
                <span className="tm-landing-v4-card-back">
                  {CARD_BACK.map((line) => (
                    <span key={line}><Check size={16} aria-hidden="true" />{line}</span>
                  ))}
                </span>
              </span>
            </span>
          </span>
        </button>
        <p className="tm-landing-v4-flip-hint" aria-hidden="true"><RefreshCw size={16} />카드를 눌러 뒤집어 보세요</p>
      </div>
    </>
  );
}
