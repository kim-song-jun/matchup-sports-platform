'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';
import type {
  V1LeagueFixtureParticipantsResponse,
  V1LeagueResultParticipantStat,
} from '@/types/league-match';

// U1(A안 "확정 다이얼로그") — 리그 대진 결과 입력·정정 모달. admin-reason-modal.tsx의
// dialog/focus-trap/ESC/backdrop/포커스복원 마크업을 그대로 본떠 만들되, select 대신
// 홈/원정 44px 숫자 입력 2개를 쓴다. 정정 모드에서는 확정 전 "전 → 후" 비교를 보여준다
// — 사용자가 확정한 이 안의 존재 이유라 빼먹으면 안 된다.

interface LeagueResultEntryModalProps {
  open: boolean;
  /** 'entry' — 아직 결과가 없는 대진에 신규 입력. 'correction' — 이미 OFFICIAL 인 결과를 정정. */
  mode: 'entry' | 'correction';
  homeTeamName: string;
  awayTeamName: string;
  /** 대진 표의 title(예: "가을 풋살 리그 1주차"). 헤더에 매치업과 함께 보여준다. */
  weekLabel: string;
  /** 정정 모드일 때만 의미가 있다 — 현재 공식 스코어("전"). */
  currentHomeScore?: number | null;
  currentAwayScore?: number | null;
  /**
   * 득점자 선택 목록(선택). 부모가 useV1LeagueFixtureParticipants 로 가져와 넘긴다 —
   * 없으면(로딩·실패 포함) 득점 기록 섹션 자체를 숨기고 기존 스코어-사유 흐름만 남긴다.
   */
  participants?: V1LeagueFixtureParticipantsResponse | null;
  onSubmit: (
    homeScore: number,
    awayScore: number,
    reason: string,
    participantStats: V1LeagueResultParticipantStat[],
  ) => void;
  onClose: () => void;
  /** True while the parent mutation is in flight */
  pending?: boolean;
}

/** 모달 안에서 편집 중인 한 선수분 득점·도움 행. */
interface ScorerRowState {
  participantId: string;
  side: 'home' | 'away';
  name: string;
  goals: string;
  assists: string;
}

const REASON_MAX = 500;

const scoreInputClass =
  'h-[44px] w-20 rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-2 text-center text-lg font-semibold tabular-nums text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

const statInputClass =
  'h-[44px] w-16 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-2 text-center text-sm font-semibold tabular-nums text-[var(--text-strong)] placeholder:font-normal placeholder:text-[var(--text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export function LeagueResultEntryModal({
  open,
  mode,
  homeTeamName,
  awayTeamName,
  weekLabel,
  currentHomeScore,
  currentAwayScore,
  participants,
  onSubmit,
  onClose,
  pending = false,
}: LeagueResultEntryModalProps) {
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [reason, setReason] = useState('');
  const [scorerRows, setScorerRows] = useState<ScorerRowState[]>([]);

  // dialog/focus-trap/ESC/backdrop/스크롤 잠금 — useModalA11y 공용 훅 (한때 이 파일이
  // admin-reason-modal 을 본뜬 원본이었고 이의 모달 2종이 다시 이걸 본떠 네 벌이 됐었다)
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLElement>({
    open,
    onClose,
    pending,
  });
  /**
   * 열릴 때 첫 포커스를 받을 컨트롤에 붙인다 — 신규 입력은 빈 홈 스코어, 정정은 사유.
   *
   * 정정 모드의 스코어 칸은 아래에서 현재 공식 스코어로 프리필된다. 그 칸에 첫 포커스를
   * 두면 useModalA11y 가 60ms 뒤 `.focus()` 만 걸고 전체 선택은 하지 않으므로 캐럿이 기존
   * 값 옆에 붙는다 — 운영자가 클릭 없이 바로 '3' 을 치면 2 가 '32' 가 되고, 그 값은
   * scoresValid·scorerSumExceeds 를 모두 통과해 그대로 공식 스코어·순위·득점왕 집계에
   * 들어간다(육안 "전 → 후" 비교가 유일한 방어였다). 정정에서 **항상 비어 있고 항상
   * 필수**인 칸은 사유뿐이라 첫 포커스를 그쪽으로 옮긴다. 신규 입력 모드는 스코어가 빈
   * 칸이라 이어붙을 값이 없으므로 기존대로 홈 스코어에 둔다.
   *
   * 이 선택의 대가는 아래 "스코어 고정 영역"이 갚는다 — 첫 포커스가 본문 아래쪽이면
   * 브라우저가 본문을 굴려 스코어 UI 를 밀어내므로(useModalA11y 는 preventScroll 없이
   * focus() 한다), 비교 박스·스코어 칸을 스크롤 본문 바깥으로 올려 굴림과 무관하게
   * 남게 했다. 즉 "이어붙지 않는다"와 "열자마자 스코어가 보인다"를 동시에 만족시킨다.
   */
  const assignInitialFocus = useCallback(
    (element: HTMLElement | null) => {
      initialFocusRef.current = element;
    },
    [initialFocusRef],
  );

  /**
   * 프리필된 스코어 칸에 포커스가 들어오면 값을 통째로 선택해, 이어서 친 숫자가 기존 값에
   * 붙지 않고 갈아끼워지게 한다(첫 포커스 외에 Tab 으로 들어오는 경로까지 덮는다).
   * 빈 칸이면 선택할 것이 없어 아무 일도 일어나지 않는다.
   *
   * 여기는 유닛 테스트로 결과를 확인할 수 없다 — jsdom 은 사양의 IDL 표를 그대로 따라
   * `input[type=number]` 에 `select()` 를 적용하지 않는(no-op) 반면, Blink·Gecko·WebKit 은
   * number 를 텍스트 필드로 구현해 실제로 전체 선택된다. 실제 선택 여부는 alpha 실화면에서
   * 확인한다. 득점·도움 칸에는 붙이지 않는다 — 거기서 값이 이어붙으면 합이 스코어를 넘어
   * scorerSumExceeds 경고가 뜨고 제출이 잠기지만, 스코어 칸에는 그런 방어가 없다.
   */
  const selectScoreOnFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  }, []);
  /** 정정 모드 프리필을 열림당 1회로 제한한다 — 아래 프리필 effect 참고. */
  const prefillDoneRef = useRef(false);

  // Reset form whenever the modal opens (또는 모드가 바뀌면 — 같은 대진이라도 신규↔정정
  // 전환 시 이전 입력값이 새 모드에 새어 들어가면 안 된다).
  //
  // 정정 모드에서는 현재 공식 스코어를 함께 프리필한다. 스코어는 필수 입력이고 빈 값이
  // "변경 없음"으로 처리되지 않는다 — 제출 시 항상 그대로 전송된다(부모의
  // onResultEntrySubmit 이 homeScore/awayScore 를 무조건 body 에 싣는다). 프리필이 없으면
  // 득점자만 고치려는 정정에서도 같은 숫자를 매번 다시 타이핑해야 했고, 그 사이 오타가
  // 그대로 공식 스코어가 된다. 아래 득점·도움 행 프리필과 같은 이유다.
  //
  // deps 를 [open, mode] 로 좁게 유지하는 것이 의도다 — currentHomeScore/currentAwayScore 를
  // deps 에 넣으면 목록 refetch 로 props 가 다시 들어올 때마다 이 effect 가 재실행돼
  // 운영자가 편집 중이던 값을 덮어쓴다. 두 값은 open 이 켜지는 렌더에 이미 확정돼 있다.
  useEffect(() => {
    if (open) {
      const prefillScore = mode === 'correction' && currentHomeScore != null && currentAwayScore != null;
      setHomeScore(prefillScore ? String(currentHomeScore) : '');
      setAwayScore(prefillScore ? String(currentAwayScore) : '');
      setReason('');
      setScorerRows([]);
      prefillDoneRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 위 주석: 열림당 1회가 계약이다
  }, [open, mode]);

  // 정정 모드 프리필: 현재 공식 기록을 행으로 미리 채운다 — 빈 화면이 "기록 없음"으로
  // 오독돼 정정 한 번에 기존 기록이 지워지는 사고를 막는다. participants 는 비동기로
  // 늦게 도착할 수 있어 열림당 1회만 채운다(그 뒤의 사용자 편집을 덮어쓰지 않는다).
  useEffect(() => {
    if (!open || mode !== 'correction' || prefillDoneRef.current || participants == null) return;
    const bySide = new Map<string, { side: 'home' | 'away'; name: string }>();
    for (const player of participants.home.players) bySide.set(player.participantId, { side: 'home', name: player.name });
    for (const player of participants.away.players) bySide.set(player.participantId, { side: 'away', name: player.name });
    setScorerRows(
      participants.currentStats.flatMap((stat) => {
        const found = bySide.get(stat.participantId);
        if (found === undefined) return [];
        return [
          {
            participantId: stat.participantId,
            side: found.side,
            name: found.name,
            goals: stat.goals === 0 ? '' : String(stat.goals),
            assists: stat.assists === 0 ? '' : String(stat.assists),
          },
        ];
      }),
    );
    prefillDoneRef.current = true;
  }, [open, mode, participants]);

  /* 본문이 실제로 넘칠 때만 액션 바에 경계선을 켠다 — 위에 잘린 내용이 있다는 신호.
     상시로 켜 두면 아무것도 안 잘린 화면까지 잘린 것처럼 읽힌다(assist-picker-sheet 의
     "넘칠 때만" 관례, 2026-08-18 390px 실화면에서 얻은 교훈). */
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const [bodyOverflows, setBodyOverflows] = useState(false);
  const measureBodyOverflow = useCallback(() => {
    const el = scrollBodyRef.current;
    setBodyOverflows(el !== null && el.scrollHeight > el.clientHeight + 1);
  }, []);
  // 본문 길이가 바뀔 때(열림·득점자 행 추가·참가자 도착)와 뷰포트가 낮아져 패널이 줄 때
  // 다시 잰다. ResizeObserver 미구현 환경(jsdom) 방어는 tournament-bracket.tsx 와 같은 관례.
  useEffect(() => {
    measureBodyOverflow();
    const el = scrollBodyRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureBodyOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureBodyOverflow, open, scorerRows.length, participants]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const parsedHome = homeScore.trim() === '' ? null : Number(homeScore);
  const parsedAway = awayScore.trim() === '' ? null : Number(awayScore);
  const scoresValid =
    parsedHome !== null &&
    Number.isInteger(parsedHome) &&
    parsedHome >= 0 &&
    parsedAway !== null &&
    Number.isInteger(parsedAway) &&
    parsedAway >= 0;

  // 득점·도움 행 파싱 — 빈 문자열은 0으로 본다(행을 추가만 하고 안 채운 상태).
  // 상한 99는 서버 DTO(@Max(99))와 같은 값 — 클라이언트에서 미리 막아 400 왕복을 줄인다.
  const parseStat = (value: string) => {
    if (value.trim() === '') return 0;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99 ? parsed : null;
  };
  let scorerRowsInvalid = false;
  const sums = { home: { goals: 0, assists: 0 }, away: { goals: 0, assists: 0 } };
  for (const row of scorerRows) {
    const goals = parseStat(row.goals);
    const assists = parseStat(row.assists);
    if (goals === null || assists === null) {
      scorerRowsInvalid = true;
      continue;
    }
    sums[row.side].goals += goals;
    sums[row.side].assists += assists;
  }
  // 서버 검증과 동일 규칙(league-result-participants.ts): 득점 합은 팀 스코어를,
  // 도움 합은 **기록된 득점 합**을 넘을 수 없다(자책골·미기록 득점 여지로 미만은 허용).
  const scorerSumExceeds =
    scoresValid &&
    (sums.home.goals > parsedHome ||
      sums.away.goals > parsedAway ||
      sums.home.assists > sums.home.goals ||
      sums.away.assists > sums.away.goals);

  const canSubmit =
    scoresValid && trimmedReason.length > 0 && !pending && !scorerRowsInvalid && !scorerSumExceeds;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || parsedHome === null || parsedAway === null) return;
    const participantStats: V1LeagueResultParticipantStat[] = [];
    for (const row of scorerRows) {
      const goals = parseStat(row.goals) ?? 0;
      const assists = parseStat(row.assists) ?? 0;
      if (goals === 0 && assists === 0) continue;
      participantStats.push({
        participantId: row.participantId,
        goals,
        ...(assists === 0 ? {} : { assists }),
      });
    }
    onSubmit(parsedHome, parsedAway, trimmedReason, participantStats);
  };

  const addScorerRow = (side: 'home' | 'away', participantId: string) => {
    if (participantId === '' || participants == null) return;
    const pool = side === 'home' ? participants.home.players : participants.away.players;
    const player = pool.find((option) => option.participantId === participantId);
    if (player === undefined || scorerRows.some((row) => row.participantId === participantId)) return;
    setScorerRows((rows) => [...rows, { participantId, side, name: player.name, goals: '', assists: '' }]);
  };

  const updateScorerRow = (participantId: string, field: 'goals' | 'assists', value: string) => {
    setScorerRows((rows) =>
      rows.map((row) => (row.participantId === participantId ? { ...row, [field]: value } : row)),
    );
  };

  const removeScorerRow = (participantId: string) => {
    setScorerRows((rows) => rows.filter((row) => row.participantId !== participantId));
  };

  const title = mode === 'correction' ? '결과 정정' : '결과 입력';
  const hasCurrentScore = mode === 'correction' && currentHomeScore != null && currentAwayScore != null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      aria-hidden={!open}
      onClick={onBackdropClick}
    >
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="league-result-entry-modal-title"
        /* 1440x1000 실측(2026-08-26): 본문에 걸린 max-h-[60vh] 가 패널을 746px 로 묶어
           가용 968px 중 222px 를 남기면서, 필수 입력인 '사유' 를 스크롤 아래로 58px
           잘라 냈다 — 잘린 자리를 클릭하면 액션 바가 잡히고(elementFromPoint),
           스크롤해야 한다는 신호도 없었다. 60vh 는 헤더·액션 바 높이를 모르는 임의
           비율이라 뷰포트가 낮을수록 더 잘린다. 패널 높이를 뷰포트에 묶고 본문이 남는
           높이를 전부 쓰게 한다(grant-staff-modal 과 같은 구조).

           overflow 는 hidden 이 아니라 y-auto 다(2026-08-26 T4). 아래 스코어 고정 영역과
           액션 바를 합치면 고정 높이가 약 380px 이라, 뷰포트가 그보다 낮으면(가로 모드 폰
           계열 — 844x390 이면 패널 상한이 358px) 본문 예산이 0 이 되고 필수 입력인 '사유'
           에 아예 닿을 수 없다. 그런데 hidden 은 **사용자만** 못 굴릴 뿐 프로그램 스크롤은
           되는 박스라, 그 상태에서 첫 포커스의 focus() 가 패널을 굴려 헤더·비교 박스를
           위로 깎아 놓고 되돌릴 방법은 주지 않았다. y-auto 로 바꾸면 focus() 가 이미
           굴리고 있던 그 축을 사용자도 굴릴 수 있다 — 낮은 뷰포트에서는 모달 전체가
           한 덩어리로 스크롤된다. 넘치지 않는 뷰포트(약 571px 이상, 아래 본문 min-h 주석
           참고)에서는 scrollHeight === clientHeight 라 스크롤바도 굴림도 생기지 않아
           기존 동작과 동일하다. x 는 계속 잘라 둥근 모서리를 지킨다. */
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] max-h-[calc(100dvh-32px)] flex flex-col overflow-x-hidden overflow-y-auto"
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 id="league-result-entry-modal-title" className="text-[16px] font-bold text-[var(--text-strong)]">
              {title}
            </h2>
            {/* 요구사항 4: 헤더에 '{홈팀} vs {원정팀}' + 주차. */}
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {homeTeamName} vs {awayTeamName} · {weekLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex shrink-0 items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0">
          {/* 스코어 고정 영역 — 스크롤 본문 **바깥**이다(R3 회귀 수정, 2026-08-26).
              정정 모드의 첫 포커스는 본문 맨 아래 '사유' 다(아래 ref 주석 참고). 그런데
              브라우저의 focus() 는 preventScroll 없이는 대상을 보이게 스크롤하므로,
              비교 박스·스코어 칸이 본문 안에 있으면 모달을 연 순간 위로 밀려 사라진다 —
              운영자가 "전 → 후" 대조를 못 본 채 사유부터 쓰게 되고, 스코어를 고칠 수 있다는
              것 자체를 놓친다. 굴림을 막는 대신(그러면 포커스된 사유가 화면 밖에 남아
              WCAG 2.4.7 과 부딪힌다) 굴러도 사라질 수 없는 자리로 올린다. 덤으로 득점 행을
              채우며 본문을 굴리는 동안에도 '후' 값이 계속 보인다.
              경계선은 본문이 실제로 넘칠 때만 켠다(아래 액션 바와 같은 관례). */}
          <div
            className={`shrink-0 flex flex-col gap-4 px-5 pt-5 pb-4${
              bodyOverflows ? ' border-b border-[var(--border)]' : ''
            }`}
          >
            {/* 요구사항 3: 정정 모드는 확정 전 전→후 비교를 보여준다 — 이 안의 존재 이유. */}
            {hasCurrentScore && (
              <div className="rounded-xl border border-[var(--tint-orange-border)] bg-[var(--tint-orange)] px-4 py-3">
                <p className="mb-2 text-[13px] font-semibold text-[var(--orange700)]">현재 공식 스코어와 비교</p>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-[var(--text-muted)]">전</span>
                    <span className="text-lg font-semibold tabular-nums text-[var(--text-strong)]">
                      {currentHomeScore} : {currentAwayScore}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[var(--text-muted)]">
                    →
                  </span>
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-[var(--blue700)]">후</span>
                    <span className="text-lg font-semibold tabular-nums text-[var(--blue700)]">
                      {scoresValid ? `${parsedHome} : ${parsedAway}` : '— : —'}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Score inputs */}
            <div className="flex items-end justify-center gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <label
                  htmlFor="league-result-home-score"
                  className="max-w-[96px] truncate text-[13px] font-semibold text-[var(--text-body)]"
                  title={homeTeamName}
                >
                  {homeTeamName}
                </label>
                <input
                  id="league-result-home-score"
                  ref={hasCurrentScore ? undefined : assignInitialFocus}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  onFocus={selectScoreOnFocus}
                  disabled={pending}
                  className={scoreInputClass}
                />
              </div>
              <span className="pb-3 text-lg font-semibold text-[var(--text-muted)]" aria-hidden="true">
                :
              </span>
              <div className="flex flex-col items-center gap-1.5">
                <label
                  htmlFor="league-result-away-score"
                  className="max-w-[96px] truncate text-[13px] font-semibold text-[var(--text-body)]"
                  title={awayTeamName}
                >
                  {awayTeamName}
                </label>
                <input
                  id="league-result-away-score"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  onFocus={selectScoreOnFocus}
                  disabled={pending}
                  className={scoreInputClass}
                />
              </div>
            </div>
          </div>

          {/* 득점자 행이 늘어나면 세로로 길어진다 — 본문만 스크롤하고 헤더·스코어·액션 바는
              고정. 높이 제한은 여기가 아니라 패널(max-h-[calc(100dvh-32px)])이 갖는다: 본문은
              헤더·스코어·액션 바를 뺀 나머지를 전부 쓴다. min-h-0 이 없으면 form 이 내용 높이
              아래로 줄지 못해 본문이 다시 넘쳐 흐른다. overscroll-contain 은 본문 끝에서
              굴렸을 때 스크롤이 뒤 페이지로 새는 것을 막는다.

              min-h-[160px] 는 그 "나머지" 의 바닥이다(2026-08-26 T4). 본문은 스크롤
              컨테이너라 자동 최소 크기가 0 이어서, 고정 영역 합(헤더 77 + 스코어 218 +
              액션 바 84 ≈ 380)보다 패널 상한이 낮아지는 순간 예산이 통째로 0 이 된다 —
              사유 textarea 가 화면에서 사라지고 굴려서 꺼낼 수도 없다(높이 0 인 스크롤
              박스라 굴릴 것이 없다). 160px 는 사유 한 덩어리(라벨 + 3행 textarea + 글자
              수)의 높이라, 낮은 뷰포트에서도 필수 입력이 항상 실물로 남는다. 대신 form 이
              그만큼 넘치게 되는데, 그 넘침은 위 패널의 overflow-y-auto 가 받아 모달 전체
              스크롤로 바꾼다. 전환 경계는 뷰포트 높이 약 571px(= 32 + 77 + 218 + 160 + 84)
              이고 그 위에서는 이 값이 한 번도 안 걸린다 — 사유 덩어리의 실제 높이가
              약 165px 라 신규 입력·정정 어느 모드에서도 본문이 이미 더 크다. */}
          <div
            ref={scrollBodyRef}
            className="px-5 pt-4 pb-5 flex flex-col gap-4 min-h-[160px] overflow-y-auto overscroll-contain"
          >
            {/* 득점·도움 기록 (선택) — 리그 득점왕·도움왕의 유일한 공급 경로(2026-08-25
                사용자 확정). participants 미제공(로딩·실패)이면 섹션을 숨겨 기존
                스코어-사유 흐름을 그대로 둔다. */}
            {participants != null && (
              <fieldset className="flex flex-col gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
                <legend className="px-1 text-[13px] font-semibold text-[var(--text-body)]">
                  득점·도움 기록 <span className="font-normal text-[var(--text-muted)]">(선택)</span>
                </legend>
                {(
                  [
                    ['home', participants.home],
                    ['away', participants.away],
                  ] as const
                ).map(([side, team]) => {
                  const addedIds = new Set(scorerRows.map((row) => row.participantId));
                  const options = team.players.filter((player) => !addedIds.has(player.participantId));
                  const sideRows = scorerRows.filter((row) => row.side === side);
                  return (
                    <div key={side} className="flex flex-col gap-2">
                      <p
                        className="truncate text-[12px] font-semibold text-[var(--text-muted)]"
                        title={team.teamName}
                      >
                        {team.teamName}
                      </p>
                      {sideRows.map((row) => (
                        <div key={row.participantId} className="flex items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-strong)]"
                            title={row.name}
                          >
                            {row.name}
                          </span>
                          <label className="sr-only" htmlFor={`scorer-goals-${row.participantId}`}>
                            {row.name} 득점
                          </label>
                          <input
                            id={`scorer-goals-${row.participantId}`}
                            type="number"
                            min={0}
                            max={99}
                            step={1}
                            inputMode="numeric"
                            placeholder="골"
                            value={row.goals}
                            onChange={(e) => updateScorerRow(row.participantId, 'goals', e.target.value)}
                            disabled={pending}
                            className={statInputClass}
                          />
                          <label className="sr-only" htmlFor={`scorer-assists-${row.participantId}`}>
                            {row.name} 도움
                          </label>
                          <input
                            id={`scorer-assists-${row.participantId}`}
                            type="number"
                            min={0}
                            max={99}
                            step={1}
                            inputMode="numeric"
                            placeholder="도움"
                            value={row.assists}
                            onChange={(e) => updateScorerRow(row.participantId, 'assists', e.target.value)}
                            disabled={pending}
                            className={statInputClass}
                          />
                          <button
                            type="button"
                            onClick={() => removeScorerRow(row.participantId)}
                            disabled={pending}
                            aria-label={`${row.name} 기록 제거`}
                            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-muted)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <label className="sr-only" htmlFor={`scorer-add-${side}`}>
                        {team.teamName} 선수 추가
                      </label>
                      <select
                        id={`scorer-add-${side}`}
                        value=""
                        disabled={pending || options.length === 0}
                        onChange={(e) => addScorerRow(side, e.target.value)}
                        className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                      >
                        <option value="">{options.length === 0 ? '추가할 선수가 없어요' : '선수 추가…'}</option>
                        {options.map((player) => (
                          <option key={player.participantId} value={player.participantId}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {scorerSumExceeds && (
                  <p className="text-[12px] text-[var(--red700)]" role="alert">
                    기록 합이 맞지 않아요 — 득점 합은 팀 스코어를, 도움 합은 기록된 득점 합을 넘을 수 없어요.
                  </p>
                )}
              </fieldset>
            )}

            {/* Reason textarea */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="league-result-reason" className="text-[13px] font-semibold text-[var(--text-body)]">
                사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="league-result-reason"
                ref={hasCurrentScore ? assignInitialFocus : undefined}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={3}
                disabled={pending}
                placeholder={mode === 'correction' ? '정정 사유를 입력해 주세요.' : '결과 입력 사유를 입력해 주세요.'}
                className={[
                  'px-3 py-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
                  'placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                  trimmedReason.length === 0 ? 'border-[var(--border)]' : 'border-[var(--border-strong)]',
                ].join(' ')}
                aria-required="true"
                aria-describedby="league-result-reason-char-count"
              />
              <p
                id="league-result-reason-char-count"
                className={[
                  'text-[length:var(--font-size-caption)] text-right tabular-nums',
                  reason.length >= REASON_MAX ? 'text-[var(--red700)]' : 'text-[var(--text-muted)]',
                ].join(' ')}
                aria-live="polite"
              >
                {reason.length} / {REASON_MAX}
              </p>
            </div>

            {/* Required hint */}
            {trimmedReason.length === 0 && reason.length > 0 && (
              <p className="text-[12px] text-[var(--red700)]" role="alert">
                공백만 입력하면 제출할 수 없어요.
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className={`shrink-0 flex items-center gap-2 px-5 pb-5${
              bodyOverflows ? ' border-t border-[var(--border)] pt-4' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[15px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
              ].join(' ')}
              aria-disabled={!canSubmit}
            >
              {pending ? '처리 중…' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
