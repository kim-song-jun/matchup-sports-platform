import type { Dispatch, KeyboardEvent } from 'react';
import { Check, MapPin, Trophy } from 'lucide-react';
import { BellIcon } from '@/components/v1-ui/icons';
import {
  SEMIS,
  TEAM_NAMES,
  type CupSub,
  type DemoAction,
  type DemoState,
  type GoalSide,
} from './landing-v4-demo-state';

/* 대회 화면(대진표·라이브). 대진은 SVG 대신 버튼판이다 — 팀을 누르면 다음 칸으로 올라간다. */

type CupProps = { state: DemoState; dispatch: Dispatch<DemoAction> };

const CUP_SUBS: ReadonlyArray<{ key: CupSub; label: string }> = [
  { key: 'bracket', label: '대진표' },
  { key: 'live', label: '라이브' },
];

function Bracket({ state, dispatch }: CupProps) {
  const done = state.champion !== null;
  return (
    <>
      <div className="lpm-stepper" aria-hidden="true">
        <span className="lpm-step-dot"><Check size={16} /></span><span className="lpm-step-line" />
        <span className="lpm-step-dot"><Check size={16} /></span><span className="lpm-step-line" />
        <span className="lpm-step-dot" data-state={done ? undefined : 'now'}>{done ? <Check size={16} /> : '3'}</span>
      </div>
      <div className="lpm-step-labels" aria-hidden="true"><span>조별리그</span><span>4강</span><span>결승</span></div>
      <div className="lpm-card">
        <div className="tm-landing-v4-bk" role="group" aria-label="대진표. 팀을 누르면 다음 라운드로 올라가요">
          <span className="tm-landing-v4-bk-cap">4강</span>
          <span aria-hidden="true" />
          <span className="tm-landing-v4-bk-cap">결승</span>
          {SEMIS.map((pair, semi) => {
            const finalist = state.finals[semi];
            const won = state.champion === finalist;
            return [
              <div key={`m${semi}`} className="tm-landing-v4-bk-match">
                {pair.map((team) => (
                  <button
                    key={team}
                    type="button"
                    className="tm-landing-v4-bk-team"
                    aria-pressed={finalist === team}
                    data-try-target={semi === 0 && team === pair[1] ? 'bracket' : undefined}
                    onClick={() => dispatch({ type: 'pickSemi', semi: semi as 0 | 1, team })}
                  >
                    <span><span className="sr-only">4강 </span>{team}</span>
                    <span className="tm-landing-v4-bk-win" aria-hidden="true">승</span>
                  </button>
                ))}
              </div>,
              <span key={`l${semi}`} className="tm-landing-v4-bk-link" aria-hidden="true" />,
              <button
                key={`f${semi}-${finalist}`}
                type="button"
                className="tm-landing-v4-bk-team tm-landing-v4-bk-slot"
                aria-pressed={won}
                onClick={() => dispatch({ type: 'pickFinal', slot: semi as 0 | 1 })}
              >
                <span><span className="sr-only">결승 </span>{finalist}</span>
                <span className="tm-landing-v4-bk-win" aria-hidden="true">우승</span>
              </button>,
            ];
          })}
          <div className="tm-landing-v4-bk-champ" data-done={done} key={state.champion ?? 'pending'}>
            {done ? <><Trophy size={20} aria-hidden="true" />{state.champion} 우승</> : '결승 진행 중'}
          </div>
        </div>
      </div>
      <div className="lpm-fixture">
        <div className="lpm-fixture-top"><MapPin size={14} aria-hidden="true" />성수 풋살장 1구장 · 토 16:00<span className="lpm-badge" data-tone="blue">확정된 결과</span></div>
        <div className="lpm-fixture-main"><span>FC 한강</span><span className="lpm-score">3 : 1</span><span>망원 FC</span></div>
      </div>
    </>
  );
}

const BASE_EVENTS = [
  { minute: 27, team: 'a', text: '골 · FC 한강 #9', note: '도움 #7' },
  { minute: 19, team: 'b', text: '골 · 성수 러너스 #11', note: '후반' },
  { minute: 8, team: 'a', text: '골 · FC 한강 #10', note: '전반 · 도움 #9' },
  { minute: 0, team: 'none', text: '경기 시작', note: '전반' },
] as const;

function Live({ state, dispatch }: CupProps) {
  const sides: GoalSide[] = ['a', 'b'];
  return (
    <>
      <span className="lpm-cap lpm-cap-strong">결승</span>
      <div className="lpm-card lpm-live">
        <div className="lpm-live-teams">
          <span>{TEAM_NAMES.a}</span>
          <span className="lpm-live-score">
            <span>
              <b key={`a${state.score.a}`} className="tm-landing-v4-bump" data-bump={state.score.a > 2}>{state.score.a}</b>
              {' : '}
              <b key={`b${state.score.b}`} className="tm-landing-v4-bump" data-bump={state.score.b > 1}>{state.score.b}</b>
            </span>
          </span>
          <span>{TEAM_NAMES.b}</span>
        </div>
        <div className="lpm-live-meta">토요일 · 성수 풋살장 2구장</div>
        <div className="lpm-live-meta">
          <span className="lpm-badge" data-tone="live">LIVE</span>
          <span className="lpm-live-clock">후반 27:11</span>
        </div>
        <div className="tm-landing-v4-goal-row">
          {sides.map((side) => (
            <button
              key={side}
              type="button"
              className="tm-landing-v4-goal"
              data-side={side}
              data-try-target={side === 'a' ? 'goal' : undefined}
              onClick={() => dispatch({ type: 'goal', side })}
            >
              <i aria-hidden="true" />{TEAM_NAMES[side]} +1<span className="sr-only"> 득점</span>
            </button>
          ))}
        </div>
        {state.goals.length > 0 ? (
          <button type="button" className="tm-landing-v4-reset" onClick={() => dispatch({ type: 'resetScore' })}>처음 점수로</button>
        ) : null}
      </div>
      <div className="lpm-sect"><b>경기 기록</b><span>스태프가 입력하면 바로 반영</span></div>
      <div className="lpm-events">
        {state.goals.map((goal, i) => (
          <div key={state.goals.length - i} className="lpm-event tm-landing-v4-event-new" data-team={goal.side}>
            <time>{goal.minute}&apos;</time><i /><span>골 · {TEAM_NAMES[goal.side]}<small>체험용 예시</small></span>
          </div>
        ))}
        {BASE_EVENTS.map((event) => (
          <div key={event.minute} className="lpm-event" data-team={event.team}>
            <time>{event.minute}&apos;</time><i /><span>{event.text}<small>{event.note}</small></span>
          </div>
        ))}
      </div>
    </>
  );
}

export function DemoCupScreen({ state, dispatch }: CupProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: CupSub = event.key === 'Home' ? 'bracket' : event.key === 'End' ? 'live' : state.cupSub === 'bracket' ? 'live' : 'bracket';
    dispatch({ type: 'cupSub', sub: next });
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-sub="${next}"]`)?.focus();
  };
  return (
    <>
      <div className="lpm-appbar"><span className="lpm-appbar-title">대회</span><BellIcon size={24} aria-hidden="true" /></div>
      <div className="lpm-body">
        <div className="lpm-row"><span className="lpm-h">가을 풋살 챔피언십</span><span className="lpm-badge" data-tone="blue">조별리그 + 토너먼트</span></div>
        <div className="lpm-seg tm-landing-v4-seg" role="tablist" aria-label="대회 화면 고르기" onKeyDown={onKeyDown}>
          {CUP_SUBS.map((sub) => (
            <button
              key={sub.key}
              type="button"
              role="tab"
              id={`tm-landing-v4-cup-${sub.key}`}
              aria-controls={`tm-landing-v4-cup-panel-${sub.key}`}
              aria-selected={state.cupSub === sub.key}
              tabIndex={state.cupSub === sub.key ? 0 : -1}
              data-sub={sub.key}
              data-on={state.cupSub === sub.key}
              onClick={() => dispatch({ type: 'cupSub', sub: sub.key })}
            >
              {sub.label}
            </button>
          ))}
        </div>
        {CUP_SUBS.map((sub) => (
          <div
            key={sub.key}
            className="tm-landing-v4-sub"
            role="tabpanel"
            id={`tm-landing-v4-cup-panel-${sub.key}`}
            aria-labelledby={`tm-landing-v4-cup-${sub.key}`}
            hidden={state.cupSub !== sub.key}
          >
            {sub.key === 'bracket' ? <Bracket state={state} dispatch={dispatch} /> : <Live state={state} dispatch={dispatch} />}
          </div>
        ))}
      </div>
    </>
  );
}
