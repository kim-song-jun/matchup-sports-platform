'use client';

import Link from 'next/link';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import { MatchVideos } from '@/components/tournaments/match-videos';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import {
  fixtureStatusLabel,
  formatClock,
  formatScoreline,
  presentParticipantName,
  resultStateLabel,
} from './format';
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
              {slot.position ? <span style={{ color: 'var(--text-caption)', fontSize: 11 }}>{slot.position}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * `PublicMatchEvent` itself carries no display-name field (only `participantId`,
 * gated to `null` by the same consent check as the lineup) and no home/away
 * tag readable on its own -- `sideId` is an opaque internal id the DTO never
 * maps back to home/away. The visibility matrix only guarantees "live
 * consent-filtered" events, not per-event names or sides, so neither may be
 * invented. Where a name/side IS safely resolvable, it is by cross-referencing
 * the *same match response*'s lineup slot for that `participantId` (both were
 * computed against the same `identityAsOf` instant and consent map
 * server-side, so a resolvable slot can never disagree with the event on
 * eligibility). If the lineup is unavailable (not yet published) or has no
 * matching slot -- including every event whose `participantId` is itself
 * `null` -- the event still renders, just without a name or side, rather than
 * guessing either.
 */
function buildParticipantLookup(
  lineup: PublicMatchDetail['lineup'],
): Map<string, { readonly side: 'home' | 'away'; readonly displayName: string | null }> {
  const lookup = new Map<string, { side: 'home' | 'away'; displayName: string | null }>();
  if (lineup === null) return lookup;
  for (const slot of lineup.home) lookup.set(slot.participantId, { side: 'home', displayName: slot.displayName });
  for (const slot of lineup.away) lookup.set(slot.participantId, { side: 'away', displayName: slot.displayName });
  return lookup;
}

function EventRow({
  event,
  lookup,
}: {
  event: PublicMatchEvent;
  lookup: Map<string, { readonly side: 'home' | 'away'; readonly displayName: string | null }>;
}) {
  const icon = event.type === 'GOAL' ? '⚽' : '🟨';
  const eventLabel = event.type === 'GOAL' ? '골' : event.type === 'CARD' ? '카드' : event.type;
  const resolved = event.participantId !== null ? lookup.get(event.participantId) : undefined;
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-strong)' }}>
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{eventLabel}</span>
      <span className="tab-num" style={{ color: 'var(--text-caption)', width: 40 }}>{formatClock(event.clockMs)}</span>
      {resolved ? (
        <>
          <span style={{ color: 'var(--text-caption)', fontSize: 11 }}>{resolved.side === 'home' ? '홈' : '원정'}</span>
          <span style={{ fontWeight: 600 }}>{presentParticipantName(resolved.displayName)}</span>
        </>
      ) : null}
    </li>
  );
}

function EventsSection({
  events,
  lineup,
}: {
  events: readonly PublicMatchEvent[];
  lineup: PublicMatchDetail['lineup'];
}) {
  if (events.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-caption)' }}>기록된 이벤트가 없어요</div>;
  }
  const lookup = buildParticipantLookup(lineup);
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {events.map((event, index) => (
        <EventRow key={`${event.type}-${event.sideId}-${index}`} event={event} lookup={lookup} />
      ))}
    </ul>
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
              <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>
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
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--text-caption)' }}>
            {data.scheduledAt ? formatTournamentDateTimeLong(data.scheduledAt) : '일정 미정'} · {fixtureStatusLabel(data.status)}
            {data.venue ? ` · ${data.venue}` : ''}
            {data.fieldName ? ` (${data.fieldName})` : ''}
          </div>
          {data.pendingProjection ? (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--blue500)', textAlign: 'center' }}>
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
      ) : (
        <EmptyState
          title="라인업이 아직 공개되지 않았어요"
          sub={
            isStatusOnly
              ? '이 대회는 진행 상태만 공개하도록 설정돼 있어요.'
              : '경기 시작 60분 전부터 라인업을 확인할 수 있어요.'
          }
        />
      )}

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>경기 기록</h3>
        <Card pad={16}>
          <EventsSection events={data.events} lineup={data.lineup} />
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
