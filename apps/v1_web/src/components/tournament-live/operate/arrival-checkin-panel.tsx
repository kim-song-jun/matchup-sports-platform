'use client';

import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';
import { jerseyText } from './player-label';
import { latestLineupForDisplay } from './lineup-grid';

/**
 * 명단 검인(체크인) — 킥오프 전 "누가 실제로 왔는지"를 스태프가 확정하는 자리.
 *
 * 1차 대회(2026-08-15~16) 회고: "명단 검인 과정에서 오지 않거나, 하지 않은 사람들에
 * 대한 확인이 어려움". 지금까지 스태프는 제출된 명단을 들고 육안·구두로만 확인했고,
 * 그 결과가 어디에도 남지 않아 나중에 "그 선수 왔었나"를 되짚을 수 없었다.
 *
 * **`LineupGrid` 에 얹지 않고 별도 컴포넌트로 둔 이유.** LineupGrid 는 "선수를 한 번
 * 탭하면 그 선수로 이벤트를 기록한다"는 계약을 가진 컴포넌트다(경기 시계를 그 탭 순간에
 * 얼려야 하므로 부모가 탭을 그대로 받아 쓴다). 같은 카드에 체크인 토글을 얹으면 한
 * 화면에서 탭의 의미가 둘이 되고, 경기 중 득점자를 고르다 체크인을 잘못 건드리는
 * 오조작이 생긴다. 검인은 킥오프 전 한 번, 이벤트 기록은 경기 내내 — 시점도 목적도
 * 달라 화면을 나눈다.
 *
 * 표시 축이 둘이라는 점이 이 화면의 핵심이다.
 *   - `started` = 팀이 **제출한 계획**(선발/후보)
 *   - `arrivedAt` = 현장에서 **확인한 사실**(도착/미확인)
 * 회고가 지목한 사람은 정확히 "선발로 제출됐는데 안 온 사람"이라, 둘을 한 축으로
 * 합치면 그 상태를 표현할 수 없다. 그래서 선발 여부는 배지로 두고 체크인은 별도
 * 토글로 그린다.
 */

export interface ArrivalCheckinPanelProps {
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
  readonly onToggleArrival: (input: { participantId: string; arrived: boolean }) => void;
  readonly disabled?: boolean;
  /** 낙관적 표시 없이 서버 응답을 기다리는 동안 그 행만 잠근다. */
  readonly pendingParticipantId?: string | null;
}

export function ArrivalCheckinPanel({
  sides,
  lineups,
  onToggleArrival,
  disabled = false,
  pendingParticipantId = null,
}: ArrivalCheckinPanelProps) {
  const sections = sides.map((side) => ({
    side,
    // 폴백을 써야 한다 -- 제출본만 보면 미제출 상태로 시작한 경기에서 **검인할 대상이
    // 통째로 비고**, 그러면 P1-b 가 지킨 `arrivedAt` 을 애초에 만들 수가 없다.
    participants: latestLineupForDisplay(lineups, side.id)?.participants ?? [],
  }));
  const total = sections.reduce((sum, section) => sum + section.participants.length, 0);
  const arrived = sections.reduce(
    (sum, section) => sum + section.participants.filter((p) => p.arrivedAt !== null).length,
    0,
  );

  if (total === 0) {
    return (
      <div className="px-4">
        <p className="text-sm text-[var(--text-muted)]">
          제출된 선발 명단이 없어 검인할 대상이 없어요.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 px-4" aria-label="명단 검인">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">명단 검인</h3>
        {/* 진행 상황을 숫자로 먼저 보여준다 — 스태프가 알고 싶은 건 개별 이름이 아니라
            "몇 명 남았나"이고, 그게 다음 행동(더 기다릴지 시작할지)을 결정한다. */}
        <p className="text-xs tabular-nums text-[var(--text-muted)]" aria-live="polite">
          도착 확인 {arrived}/{total}명
        </p>
      </div>

      {sections.map(({ side, participants }) => (
        <div key={side.id} className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">{side.displayNameSnapshot}</p>
          {participants.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">제출된 명단이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {participants.map((participant) => (
                <ArrivalRow
                  key={participant.id}
                  participant={participant}
                  disabled={disabled || pendingParticipantId === participant.id}
                  onToggle={() =>
                    onToggleArrival({
                      participantId: participant.id,
                      arrived: participant.arrivedAt === null,
                    })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

function ArrivalRow({
  participant,
  disabled,
  onToggle,
}: {
  participant: GameLineupParticipant;
  disabled: boolean;
  onToggle: () => void;
}) {
  const checked = participant.arrivedAt !== null;
  const jersey = jerseyText(participant.jerseyNumber);
  // 선발/후보는 회고가 지목한 "선발인데 안 온 사람"을 눈에 띄게 하려고 함께 보여준다.
  const roleLabel = participant.started ? '선발' : '후보';
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        // 컬러만으로 상태를 전달하지 않는다(프로젝트 접근성 규칙) — aria-label 에 상태를
        // 말로 담고, 화면에도 체크 표시와 "도착"/"미확인" 텍스트를 함께 둔다.
        aria-label={`${participant.displayNameSnapshot} ${roleLabel} — ${checked ? '도착 확인됨, 누르면 취소' : '아직 미확인, 누르면 도착 확인'}`}
        disabled={disabled}
        onClick={onToggle}
        className={[
          'flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
          checked
            ? 'border-[var(--blue500)] bg-[var(--blue50)]'
            : 'border-[var(--border)] bg-[var(--surface)]',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-bold',
            checked
              ? 'border-[var(--blue500)] bg-[var(--blue500)] text-white'
              : 'border-[var(--border)] text-transparent',
          ].join(' ')}
        >
          ✓
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {jersey ? `${jersey} ` : ''}
            {participant.displayNameSnapshot}
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            {roleLabel} · {checked ? '도착' : '미확인'}
          </span>
        </span>
      </button>
    </li>
  );
}
