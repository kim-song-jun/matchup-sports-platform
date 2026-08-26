'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { MatchVideos } from '@/components/tournaments/match-videos';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { matchOutcomeReasonLabel, toDisplayableOutcomeReason } from '@/lib/match-outcome';
import { AbnormalClockBadge } from './abnormal-clock-badge';
import { LiveBadge } from './live-badge';
import {
  fixtureStatusLabel,
  eventPresentation,
  formatClock,
  formatScoreline,
  isClockAbnormal,
  periodLabel,
  presentGameEventParticipantName,
  presentParticipantName,
  resultStateLabel,
} from './format';
import { PenaltyScoreline } from './penalty-scoreline';
import type { PublicLineupSlot, PublicMatchDetail, PublicMatchEvent } from './types';

/**
 * 선수 이름을 프로필로 잇는다. **열어도 되는지는 서버가 이미 판단해서** `profileHref` 로
 * 내려주므로(없으면 `null`) 여기서 동의·계정 유무를 다시 따지지 않는다 — 화면 세 곳이
 * 각자 판단하면 언젠가 갈린다.
 *
 * 링크가 없을 때 굳이 span 으로 감싸지 않고 이름을 그대로 돌려주는 이유: 대부분의
 * 참가자가 그 경우이고, 의미 없는 래퍼가 한 겹 늘면 기존 레이아웃(폭·정렬)이 미묘하게
 * 달라진다.
 */
function ProfileLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (href === null) return <>{children}</>;
  return (
    <Link href={href} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </Link>
  );
}

function sideLabel(side: PublicMatchDetail['home']): string {
  return side?.teamName ?? '미정';
}

/** `void`/`corrected` states need a visible badge so a stale-looking score is never mistaken for the live truth. */
function ResultStateBadge({ state }: { state: PublicMatchDetail['resultState'] }) {
  if (state === 'pending' || state === 'official') return null;
  const tone = state === 'void' ? 'var(--red700)' : 'var(--blue700)';
  const bg = state === 'void' ? 'var(--red50)' : 'var(--blue50)';
  return (
    // live region 을 쓰지 않는다 — 이 배지는 렌더 후 변하지 않는 정적 텍스트라, role="status"
    // 를 붙이면 스크린리더가 상태 변경으로 오인해 공지한다. 같은 파일의 몰수·중단 배지와
    // 같은 이유이고, `LiveBadge`(경기 시계)처럼 값이 실제로 바뀌는 곳에만 쓴다.
    <span style={{ fontSize: 12, fontWeight: 700, color: tone, background: bg, borderRadius: 8, padding: '3px 8px' }}>
      {resultStateLabel(state)}
    </span>
  );
}

/**
 * 몰수·중단으로 끝난 경기의 표기. 이게 없으면 몰수 0:0 과 실제 0:0 무승부가 관전자
 * 화면에서 **완전히 같아 보인다** — 회고에서 지적된 "왜 그 점수인지 기록 어디에도 없다"가
 * 서버에 사유를 저장해 두고도 그대로 남는 상태다. 운영자가 종료 다이얼로그에서 "사유는
 * 공개 경기 기록에 함께 남는다"는 안내를 읽고 사유를 적으므로, 여기서 보이지 않으면
 * 그 안내 자체가 거짓이 된다.
 *
 * 컬러만으로 구분하지 않는다(WCAG) — 사유 라벨 텍스트가 항상 함께 나온다.
 */
function MatchOutcomeNotice({ outcome }: { outcome: PublicMatchDetail['outcome'] }) {
  const reason = toDisplayableOutcomeReason(outcome?.reason);
  if (outcome === null || reason === null) return null;
  const note = outcome.note?.trim() ?? '';
  return (
    // live region 을 쓰지 않는 이유는 일정 카드의 같은 배지와 동일하다 — 정적 텍스트다.
    <div
      style={{
        marginTop: 12,
        padding: '8px 12px',
        borderRadius: 10,
        background: 'var(--orange50)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        textAlign: 'center',
      }}
    >
      {/* --orange500 텍스트는 이 틴트 배경 위에서 1.97:1 로 WCAG AA 미달이다 —
          --orange700(5.42:1)이 그 결함을 막으려 도입된 토큰이다. */}
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange700)' }}>
        {matchOutcomeReasonLabel(reason)}으로 종료된 경기예요
      </span>
      {/* 사유가 비어 있으면 빈 줄을 남기지 않는다. 서버가 사유 없는 몰수를 422 로 막지만
          그 규칙이 생기기 전에 종료된 과거 경기는 사유가 없을 수 있다. */}
      {note.length > 0 ? (
        <span style={{ fontSize: 12, color: 'var(--text-body)', wordBreak: 'keep-all' }}>{note}</span>
      ) : null}
    </div>
  );
}

function LineupColumn({ title, slots }: { title: string; slots: readonly PublicLineupSlot[] }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 8 }}>{title}</div>
      {slots.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-caption)' }}>명단이 아직 없어요</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slots.map((slot) => (
            <li key={slot.participantId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              {slot.jerseyNumber !== null ? (
                <span className="tab-num" style={{ color: 'var(--text-caption)', width: 20 }}>{slot.jerseyNumber}</span>
              ) : null}
              <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                <ProfileLink href={slot.profileHref}>{presentParticipantName(slot.displayName)}</ProfileLink>
              </span>
              {/* [R-T2] 고정폭 없는 인라인 텍스트 — 12로 상향. */}
              {slot.position ? <span style={{ color: 'var(--text-caption)', fontSize: 12 }}>{slot.position}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 각 이벤트의 `side`/`participantName`/`jerseyNumber`는 전부 서버가 이미 해석해
 * 내려준다(`PublicMatchEvent` 타입 주석 참고) -- 라인업(`lineup`)이 아직 공개되지
 * 않았거나 `status_only`로 `null`인 상황에서도 이벤트 자체는 그대로 나오므로,
 * 예전처럼 `lineup` 슬롯을 참가자 id로 역참조해 이름/사이드를 재구성할 필요가
 * 없다(오히려 그 역참조 방식은 라인업이 없을 때 이름이 사라지는 버그였다).
 * 홈/원정은 스코어 헤더의 좌(홈)/우(원정) 배치를 그대로 이어받아, 시간·아이콘을
 * 가운데 열에 두고 좌우 열에 각 팀의 이벤트만 채우는 2열 타임라인으로 보여준다.
 */
function EventRow({ event }: { event: PublicMatchEvent }) {
  const presentation = eventPresentation(event);
  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {event.jerseyNumber !== null ? (
        <span className="tab-num" style={{ color: 'var(--text-caption)', fontSize: 12 }}>{event.jerseyNumber}</span>
      ) : null}
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>
        <ProfileLink href={event.profileHref}>
          {presentGameEventParticipantName(event.type, event.participantName)}
        </ProfileLink>
      </span>
    </span>
  );
  return (
    <div
      role="listitem"
      style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{event.side === 'home' ? content : null}</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>{presentation.icon}</span>
        <span className="sr-only">{presentation.label}</span>
        {presentation.badge ? (
          /* 자책골처럼 아이콘만으로 뜻이 갈리지 않는 이벤트에 붙는 **보이는** 표식.
             `sr-only` 라벨만으로는 화면에서 일반 골과 구분되지 않는다(2026-08-19 alpha 실측:
             관전자에게는 원정 열에 홈 선수 이름이 뜬 일반 골로만 보였다). */
          <span
            style={{
              fontSize: 'var(--font-size-micro)',
              lineHeight: 1.4,
              padding: '0 4px',
              borderRadius: 4,
              fontWeight: 700,
              // 실제 팔레트 토큰을 쓴다 — `--danger-*` 는 이 코드베이스에 없어서
              // 하드코딩 fallback 이 항상 적용되고 있었다(다크모드도 따라오지 않는다).
              color: 'var(--red700)',
              background: 'var(--tint-red)',
            }}
          >
            {presentation.badge}
          </span>
        ) : null}
        {/* [R-T2] min-width:36 컬럼(고정폭 아님) 안 시각 텍스트 — 12로 상향. */}
        <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-caption)' }}>
          {formatClock(event.clockMs)}
          {isClockAbnormal(event.clockMs) ? <AbnormalClockBadge /> : null}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>{event.side === 'away' ? content : null}</div>
    </div>
  );
}

function EventsSection({
  events,
  isStatusOnly,
}: {
  events: readonly PublicMatchEvent[];
  isStatusOnly: boolean;
}) {
  if (events.length === 0) {
    // status_only는 "이벤트가 없었다"가 아니라 "이 대회는 진행 상태만 공개해서
    // 애초에 골/카드 기록을 내려주지 않는다" -- 다른 이유(오류·아직 무이벤트)와
    // 섞이면 관전자가 실제로 무득점 경기였다고 오해할 수 있어 문구를 구분한다.
    return (
      <div style={{ fontSize: 12, color: 'var(--text-caption)' }}>
        {isStatusOnly ? '경기 상태만 공개되고 있어요.' : '기록된 이벤트가 없어요'}
      </div>
    );
  }

  // period(전반/후반/...) 별로 묶는다. 서버가 이미 period asc -> clockMs asc 로
  // 정렬해 내려주므로(public-tournament-records.event-order.spec.ts) 버킷
  // 내부 순서는 절대 다시 정렬하지 않고 원본 배열 순서를 그대로 보존한다.
  // period===null(타입상 허용되지만 V1GameEvent.period가 NOT NULL이라 현재
  // 서버 경로로는 발생하지 않음)인 이벤트는 유실시키지 않고 별도 "기타" 구간에
  // 담는다.
  const byPeriod = new Map<number, PublicMatchEvent[]>();
  const unknownPeriodEvents: PublicMatchEvent[] = [];
  for (const event of events) {
    if (event.period === null) {
      unknownPeriodEvents.push(event);
      continue;
    }
    const bucket = byPeriod.get(event.period) ?? [];
    bucket.push(event);
    byPeriod.set(event.period, bucket);
  }
  const periodNumbers = Array.from(byPeriod.keys()).sort((a, b) => a - b);

  return (
    <div role="list" aria-label="경기 기록" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {periodNumbers.map((period) => {
        const headingId = `match-events-period-${period}`;
        return (
          <div key={period} role="group" aria-labelledby={headingId}>
            <div
              id={headingId}
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 8 }}
            >
              {periodLabel(period)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {byPeriod.get(period)!.map((event, index) => (
                <EventRow key={`${event.type}-${event.sideId}-${period}-${index}`} event={event} />
              ))}
            </div>
          </div>
        );
      })}
      {unknownPeriodEvents.length > 0 ? (
        <div role="group" aria-labelledby="match-events-period-unknown">
          <div
            id="match-events-period-unknown"
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 8 }}
          >
            기타
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {unknownPeriodEvents.map((event, index) => (
              <EventRow key={`${event.type}-${event.sideId}-unknown-${index}`} event={event} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HistorySection({ history }: { history: PublicMatchDetail['history'] }) {
  if (history.length === 0) return null;
  return (
    <section>
      <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>결과 변경 이력</h3>
      <Card pad={0}>
        {history.map((revision, index) => (
          <div
            key={revision.revision}
            style={{ padding: '12px 16px', borderTop: index > 0 ? '1px solid var(--grey100)' : 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
                {revision.state === 'VOID' ? '무효 처리' : revision.isCorrection ? '정정' : '확정'} · {revision.revision}차
              </span>
              {/* [R-T2] 고정폭 없는 인라인 텍스트 — 12로 상향. */}
              <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>
                {revision.officialAt ? formatTournamentDateTimeLong(revision.officialAt) : ''}
              </span>
            </div>
            {revision.reason ? (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-caption)' }}>{revision.reason}</p>
            ) : null}
          </div>
        ))}
      </Card>
    </section>
  );
}

export function MatchDetailContent({ data }: { data: PublicMatchDetail }) {
  const isStatusOnly = data.visibilityMode === 'status_only';
  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)' }}>
            {data.groupName ?? data.round}
            {data.legNumber > 1 ? ` ${data.legNumber}차` : ''}
          </span>
          <ResultStateBadge state={data.resultState} />
        </div>
        <Card pad={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, textAlign: 'right', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
              {sideLabel(data.home)}
            </span>
            <span
              className="tab-num"
              style={{
                flex: '0 0 84px',
                textAlign: 'center',
                fontSize: 20,
                fontWeight: 800,
                color: 'var(--text-strong)',
                background: 'var(--grey50)',
                borderRadius: 10,
                padding: '8px 0',
              }}
            >
              {formatScoreline(data.score, data.scoreStatus)}
            </span>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
              {sideLabel(data.away)}
            </span>
          </div>
          {/* 스코어 아래 보조 표기 — 승부차기가 없으면 렌더 없음. */}
          <PenaltyScoreline score={data.score} scoreStatus={data.scoreStatus} fontSize="var(--font-size-caption)" />
          {/* 몰수·중단 표기는 스코어 바로 아래에 둔다 — 점수를 읽은 다음 눈이 가는 자리이자,
              "이 점수가 정상 경기 결과가 아니다"를 점수와 떼어놓지 않는 유일한 위치다. */}
          <MatchOutcomeNotice outcome={data.outcome} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 12,
              fontSize: 12,
              color: 'var(--text-caption)',
            }}
          >
            <span>
              {data.scheduledAt ? formatTournamentDateTimeLong(data.scheduledAt) : '일정 미정'}
              {data.status !== 'live' ? ` · ${fixtureStatusLabel(data.status)}` : ''}
              {data.venue ? ` · ${data.venue}` : ''}
              {data.fieldName ? ` (${data.fieldName})` : ''}
            </span>
            {data.status === 'live' ? <LiveBadge clock={data.clock} periodBreak={data.periodBreak} /> : null}
          </div>
          {data.pendingProjection ? (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--blue700)', textAlign: 'center' }}>
              경기 결과가 공식 확정을 기다리고 있어요.
            </p>
          ) : null}
          {isStatusOnly ? (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-caption)', textAlign: 'center' }}>
              이 경기는 진행 상태와 확정 기록만 공개돼요.
            </p>
          ) : null}
        </Card>
      </header>

      {data.mvp ? (
        <Card pad={16}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 4 }}>MVP</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
            <ProfileLink href={data.mvp.profileHref}>{presentParticipantName(data.mvp.displayName)}</ProfileLink>
          </div>
        </Card>
      ) : null}

      {/* 라인업 미공개(null)는 "빈 상태" 가 아니라 "아직 이 정보를 보여줄 시점이
          아님" 이다 -- 킥오프 60분 전부터 공개되는 정상적인 대기 상태를 매번 빈
          카드로 자리 차지하게 두면 관전자가 오류처럼 오인하기 쉽다. status_only
          안내는 이미 헤더 카드에 한 번 나오므로 여기서 또 반복하지 않고, 섹션
          자체를 통째로 생략한다. */}
      {data.lineup ? (
        <section>
          <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>라인업</h3>
          <Card pad={16}>
            <div style={{ display: 'flex', gap: 20 }}>
              <LineupColumn title={sideLabel(data.home)} slots={data.lineup.home} />
              <LineupColumn title={sideLabel(data.away)} slots={data.lineup.away} />
            </div>
          </Card>
        </section>
      ) : null}

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>경기 기록</h3>
        <Card pad={16}>
          <EventsSection events={data.events} isStatusOnly={isStatusOnly} />
        </Card>
      </section>

      {data.videos.length > 0 ? (
        <section>
          <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>경기 영상</h3>
          <Card pad={16}>
            <MatchVideos videos={[...data.videos]} matchLabel={`${sideLabel(data.home)} vs ${sideLabel(data.away)}`} />
          </Card>
        </section>
      ) : null}

      <HistorySection history={data.history} />

      {data.nextMatch ? (
        <Link
          href={`/tournaments/${data.tournamentId}/matches/${data.nextMatch.fixtureId}`}
          className="tm-pressable"
          style={{ textDecoration: 'none' }}
        >
          <Card pad={16}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 4 }}>다음 경기</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
              {data.nextMatch.home?.teamName ?? '미정'} vs {data.nextMatch.away?.teamName ?? '미정'}
            </div>
          </Card>
        </Link>
      ) : null}
    </div>
  );
}
