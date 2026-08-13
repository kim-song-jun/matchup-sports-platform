'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { MatchVideos } from '@/components/tournaments/match-videos';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { AbnormalClockBadge } from './abnormal-clock-badge';
import { LiveBadge } from './live-badge';
import {
  fixtureStatusLabel,
  formatClock,
  formatScoreline,
  isClockAbnormal,
  presentParticipantName,
  resultStateLabel,
} from './format';
import { PenaltyScoreline } from './penalty-scoreline';
import type { PublicLineupSlot, PublicMatchDetail, PublicMatchEvent } from './types';

function sideLabel(side: PublicMatchDetail['home']): string {
  return side?.teamName ?? '미정';
}

/** `void`/`corrected` states need a visible badge so a stale-looking score is never mistaken for the live truth. */
function ResultStateBadge({ state }: { state: PublicMatchDetail['resultState'] }) {
  if (state === 'pending' || state === 'official') return null;
  const tone = state === 'void' ? 'var(--red500)' : 'var(--blue500)';
  const bg = state === 'void' ? 'var(--red50)' : 'var(--blue50)';
  return (
    <span
      role="status"
      style={{ fontSize: 12, fontWeight: 700, color: tone, background: bg, borderRadius: 8, padding: '3px 8px' }}
    >
      {resultStateLabel(state)}
    </span>
  );
}

function LineupColumn({ title, slots }: { title: string; slots: readonly PublicLineupSlot[] }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 6 }}>{title}</div>
      {slots.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-caption)' }}>명단이 아직 없어요</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slots.map((slot) => (
            <li key={slot.participantId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              {slot.jerseyNumber !== null ? (
                <span className="tab-num" style={{ color: 'var(--text-caption)', width: 20 }}>{slot.jerseyNumber}</span>
              ) : null}
              <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{presentParticipantName(slot.displayName)}</span>
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
  const icon = event.type === 'GOAL' ? '⚽' : '🟨';
  const eventLabel = event.type === 'GOAL' ? '골' : event.type === 'CARD' ? '카드' : event.type;
  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {event.jerseyNumber !== null ? (
        <span className="tab-num" style={{ color: 'var(--text-caption)', fontSize: 12 }}>{event.jerseyNumber}</span>
      ) : null}
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>
        {presentParticipantName(event.participantName)}
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
        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
        <span className="sr-only">{eventLabel}</span>
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
  return (
    <div role="list" aria-label="경기 기록" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {events.map((event, index) => (
        <EventRow key={`${event.type}-${event.sideId}-${index}`} event={event} />
      ))}
    </div>
  );
}

function HistorySection({ history }: { history: PublicMatchDetail['history'] }) {
  if (history.length === 0) return null;
  return (
    <section>
      <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>결과 변경 이력</h3>
      <Card pad={0}>
        {history.map((revision, index) => (
          <div
            key={revision.revision}
            style={{ padding: '10px 16px', borderTop: index > 0 ? '1px solid var(--grey100)' : 'none' }}
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
          <PenaltyScoreline score={data.score} scoreStatus={data.scoreStatus} fontSize={12} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 10,
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
            {data.status === 'live' ? <LiveBadge clock={data.clock} /> : null}
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
            {presentParticipantName(data.mvp.displayName)}
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
          <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>라인업</h3>
          <Card pad={16}>
            <div style={{ display: 'flex', gap: 20 }}>
              <LineupColumn title={sideLabel(data.home)} slots={data.lineup.home} />
              <LineupColumn title={sideLabel(data.away)} slots={data.lineup.away} />
            </div>
          </Card>
        </section>
      ) : null}

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>경기 기록</h3>
        <Card pad={16}>
          <EventsSection events={data.events} isStatusOnly={isStatusOnly} />
        </Card>
      </section>

      {data.videos.length > 0 ? (
        <section>
          <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>경기 영상</h3>
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
