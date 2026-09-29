import type { CSSProperties } from 'react';
import { BarChart3, Bell, MessageCircle, Trophy } from 'lucide-react';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';

/* 알림 문구는 v1_api notifications.service.ts EVENT_TITLES 의 실제 제목만 쓴다. 팀·사람은 가상의 예시다. */
const NOTIFICATIONS = [
  { title: '팀매치 신청이 승인됐어요', detail: 'FC 한강 vs 성수 러너스', time: '방금', fresh: true },
  { title: '대회 참가가 확정됐어요', detail: '가을 풋살 챔피언십', time: '1시간 전', fresh: true },
  { title: '리그 대진이 확정됐어요', detail: '성동 풋살 리그', time: '어제', fresh: false },
] as const;

const STANDINGS = [
  { team: 'FC 한강', pts: 7, move: 'up' },
  { team: '성수 러너스', pts: 6, move: 'down' },
  { team: '망원 FC', pts: 4 },
  { team: '합정 SC', pts: 1 },
] as const;

const RECORD = [
  { label: '승', value: 6, tone: 'win' },
  { label: '무', value: 2, tone: 'draw' },
  { label: '패', value: 3, tone: 'loss' },
] as const;

const FORM = ['승', '승', '무', '패', '승'] as const;
const FORM_TONE = { 승: 'win', 무: 'draw', 패: 'loss' } as const;

const vars = (v: Record<string, number>) =>
  Object.fromEntries(Object.entries(v).map(([k, n]) => [`--tm-landing-v4-${k}`, n])) as CSSProperties;

/** 경기 전후 — 네 칸이 화면에 들어올 때 한 번씩 움직인다(.is-in). 서버 HTML 은 다 끝난 모습이다. */
export function LandingV4Bento() {
  const total = RECORD.reduce((sum, r) => sum + r.value, 0);
  return (
    <section id="more" className="tm-landing-section" aria-labelledby="more-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">경기 전후까지</p>
          <h2 id="more-heading" className="tm-landing-section-title">경기 전에도,<br />끝난 뒤에도</h2>
          <p className="tm-landing-section-sub">알림·채팅으로 준비하고, 순위표와 전적으로 돌아봐요.</p>
        </div>
        <div className="tm-landing-v4-bento">
          <article className="tm-landing-v4-bcell" data-size="wide" data-reveal>
            <div>
              <span className="tm-landing-v4-bcell-k"><Bell size={16} aria-hidden="true" />알림</span>
              <h3>확정·변경은 알림으로 바로</h3>
              <p>신청 승인부터 대진 확정까지 놓치지 않아요.</p>
            </div>
            <div className="tm-landing-v4-bell-row">
              <span className="tm-landing-v4-bell" aria-hidden="true"><Bell size={30} /></span>
              <ul className="tm-landing-v4-notis" aria-label="알림 예시">
                {NOTIFICATIONS.map((n, i) => (
                  <li key={n.title} style={vars({ i })} data-fresh={n.fresh}>
                    <span className="tm-landing-v4-noti-dot" aria-hidden="true" />
                    <span className="tm-landing-v4-noti-text">{n.title}<small>{n.detail}</small></span>
                    <time>{n.time}</time>
                  </li>
                ))}
              </ul>
            </div>
          </article>
          <article className="tm-landing-v4-bcell" data-reveal style={{ '--i': 1 } as CSSProperties}>
            <div>
              <span className="tm-landing-v4-bcell-k"><MessageCircle size={16} aria-hidden="true" />채팅</span>
              <h3>채팅으로 바로 이야기해요</h3>
              <p>신청하면 대화방이 열려요.</p>
            </div>
            <div className="tm-landing-v4-chat" role="img" aria-label="채팅 예시: 팀장이 출전 가능한 사람을 묻고, 10번이 출전하겠다고 답해요">
              <span className="tm-landing-v4-bub-who">팀장 · A</span>
              <span className="tm-landing-v4-bub" data-side="them">토요일 19시 경기 확정됐어요! 출전 가능하신 분?</span>
              <span className="tm-landing-v4-typing-slot">
                <span className="tm-landing-v4-typing"><i style={vars({ i: 0 })} /><i style={vars({ i: 1 })} /><i style={vars({ i: 2 })} /></span>
                <span className="tm-landing-v4-bub" data-side="me">10번 출전할게요!</span>
              </span>
            </div>
          </article>
          <article className="tm-landing-v4-bcell" data-reveal>
            <div>
              <span className="tm-landing-v4-bcell-k"><Trophy size={16} aria-hidden="true" />순위표</span>
              <h3>순위표는 저절로 바뀌어요</h3>
              <p>결과가 확정되면 승점이 바로 반영돼요.</p>
            </div>
            <ol className="tm-landing-v4-standing" aria-label="순위표 예시">
              {STANDINGS.map((row, i) => (
                <li key={row.team} data-move={'move' in row ? row.move : undefined}>
                  <span className="tm-landing-v4-st-rank">{i + 1}</span>
                  <span className="tm-landing-v4-st-row">
                    <TeamAvatar seed={row.team} name={row.team} size="sm" />
                    {row.team}
                    {'move' in row && row.move === 'up' ? <span className="tm-landing-v4-st-up">▲1<span className="sr-only"> 순위 상승</span></span> : null}
                    <span className="tm-landing-v4-st-pts">{row.pts}점</span>
                  </span>
                </li>
              ))}
            </ol>
          </article>
          <article className="tm-landing-v4-bcell" data-size="wide" data-reveal style={{ '--i': 1 } as CSSProperties}>
            <div>
              <span className="tm-landing-v4-bcell-k"><BarChart3 size={16} aria-hidden="true" />전적</span>
              <h3>팀 전적이 경기마다 쌓여요</h3>
              <p>전체·대회·리그·친선으로 나눠 보고, 개인 기록도 함께 남아요.</p>
            </div>
            <div className="tm-landing-v4-rec">
              <ul className="tm-landing-v4-bars" aria-label={`전적 예시: ${RECORD.map((r) => `${r.label} ${r.value}`).join(', ')}`}>
                {RECORD.map((r, i) => (
                  <li key={r.label}>
                    {r.label}
                    <span className="tm-landing-v4-bar" aria-hidden="true"><i data-tone={r.tone} style={vars({ v: r.value / total, i })} /></span>
                    <b>{r.value}</b>
                  </li>
                ))}
              </ul>
              <div>
                <p className="tm-landing-v4-form-k">최근 5경기 · FC 한강</p>
                <ol className="tm-landing-v4-form" aria-label={`최근 5경기: ${FORM.join(' ')}`}>
                  {FORM.map((f, i) => <li key={i} data-tone={FORM_TONE[f]} style={vars({ i })}>{f}</li>)}
                </ol>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
