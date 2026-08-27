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
   * 감사 L-E finding 4 수정 — 정정 모드일 때만 의미가 있다. 현재 공식 결과가 몰수로
   * 표시돼 있는지("전"). 정정 모달의 몰수 체크박스 초기값으로 쓴다 — 없으면 운영자가
   * 매 정정마다 몰수 여부를 다시 판단해야 하고, 무심코 체크를 건드리지 않고 제출해도
   * 기존 몰수 표식이 무조건 사라지거나 없던 표식이 생기는 사고로 이어진다.
   */
  currentIsForfeit?: boolean;
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
    /**
     * 정정 모드에서만 몰수 체크박스의 현재 값을 싣는다(신규 입력 모드는 항상
     * undefined — 그 모드에는 몰수 개념이 없다, 전용 몰수 처리 엔드포인트가 담당한다).
     * 부모(`league-match-fixtures-client.tsx`)가 정정 모드일 때만 body 에 반영한다.
     */
    isForfeit: boolean | undefined,
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
  currentIsForfeit,
  participants,
  onSubmit,
  onClose,
  pending = false,
}: LeagueResultEntryModalProps) {
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [reason, setReason] = useState('');
  const [scorerRows, setScorerRows] = useState<ScorerRowState[]>([]);
  const [isForfeit, setIsForfeit] = useState(false);

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
  // deps 를 [open, mode] 로 좁게 유지하는 것이 의도다 — currentHomeScore/currentAwayScore/
  // currentIsForfeit 를 deps 에 넣으면 목록 refetch 로 props 가 다시 들어올 때마다 이
  // effect 가 재실행돼 운영자가 편집 중이던 값을 덮어쓴다. 세 값은 open 이 켜지는 렌더에
  // 이미 확정돼 있다.
  //
  // 감사 L-E finding 4 수정: 몰수 체크박스는 base(직전 공식 결과)의 몰수 여부로
  // 초기화한다(RecordLeagueResultDto.isForfeit 의 "미지정 = 승계" 계약과 대칭 —
  // 화면 기본값도 승계, 운영자가 건드리면 명시적 override).
  useEffect(() => {
    if (open) {
      const prefillScore = mode === 'correction' && currentHomeScore != null && currentAwayScore != null;
      setHomeScore(prefillScore ? String(currentHomeScore) : '');
      setAwayScore(prefillScore ? String(currentAwayScore) : '');
      setReason('');
      setScorerRows([]);
      setIsForfeit(mode === 'correction' && currentIsForfeit === true);
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
    onSubmit(parsedHome, parsedAway, trimmedReason, participantStats, mode === 'correction' ? isForfeit : undefined);
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
           기존 동작과 동일하다. x 는 계속 잘라 둥근 모서리를 지킨다.

           scroll-pb-21(84px) 은 그 패널 굴림의 착지 지점을 액션 바 높이만큼 위로 올린다
           (2026-08-27 C3 2라운드). 아래 본문에만 scroll-padding 을 주고 실측했더니 844x390
           에서 패널이 9/188 만 굴러 '취소·확인' 두 버튼이 화면 밖에 남았다 — 본문이 먼저
           굴려 사유 칸을 끌어올리면 패널은 더 굴릴 이유가 없어지는데, 그 지점의 화면 바닥은
           아직 본문이라 액션 바가 들어올 자리가 없다. 패널 스크롤포트를 액션 바 높이만큼
           줄이면 패널이 끝까지 굴러 액션 바가 함께 들어온다(실측 844x390: 패널 188/188 ·
           확인·취소 각 48/48 · 사유 94/94 · 글자수 18/18 — 수정 전 0/48 · 33/94 · 0/18).
           패널이 넘치지 않는 뷰포트(약 571px 이상)에서는 굴릴 것이 없어 무해하다. */
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] max-h-[calc(100dvh-32px)] flex flex-col overflow-x-hidden overflow-y-auto scroll-pb-21"
      >
        {/* Header — 패널 스크롤포트에 고정(sticky)한다.
            위 scroll-pb-21 이 가로 모드 좁은 띠(실측 844x390·410·430·450 · 915x412 · 932x430 ·
            740x360)에서 패널을 열자마자 끝까지 굴리는데(첫 포커스가 본문 맨 아래 '사유'), 헤더가
            그냥 흘러가면 모달 제목과 닫기(X)가 화면 밖으로 나간다 — 실측(2026-08-27 D3, 844x410):
            제목 24 → 0px, X 44 → 0px, X 중앙 hit-test 도 null. "지금 무슨 모달인지"와 "닫는 법"은
            굴림 위치와 무관하게 항상 보여야 한다.
            sticky 는 흐름에서 빠지지 않으므로 레이아웃은 1px 도 안 바뀐다 — 패널이 넘치지 않는
            뷰포트에서는 굴릴 것이 없어 동작도 좌표도 그대로다(390x844 · 1440x1000 스크린샷 해시
            수정 전후 동일).
            bg 는 패널과 같은 토큰이라 겹쳐도 색이 달라 보이지 않는다(투명이면 본문이 비쳐 겹쳐 보인다).
            **대가**: 그 좁은 띠에서 열자마자 보이던 '현재 공식 스코어와 비교' 박스의 꼬리 77px 이
            헤더 뒤로 들어간다(844x390 실측 112.7 → 35.7px, 스코어 입력칸 44 → 18.7px, 740x360 은
            44 → 0px). 위로 굴리면 그대로 닿고, 뷰포트 높이 ≥700 인 계약 밴드에서는 무변화다
            (스코어 비교 223.7/223.7 · 입력칸 44/44). 사유·글자수·확인·취소는 전 구간에서 무변화. */}
        <div
          id="league-result-modal-header"
          className="sticky top-0 z-10 shrink-0 flex items-start justify-between px-5 py-4 bg-[var(--card-surface)] border-b border-[var(--border)]"
        >
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
              <div className="flex flex-col items-center gap-2">
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
              <div className="flex flex-col items-center gap-2">
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
              약 165px 라 신규 입력·정정 어느 모드에서도 본문이 이미 더 크다.

              scroll-pb-21(84px) 는 그 본문 안에서 focus() 가 착지하는 지점을 84px 위로
              올린다(2026-08-27 C3). 390x844 실측에서 액션 바가 사유 입력의 아래 모서리를
              23px 덮고 있었다 — 정정 모드의 첫 포커스는 본문 맨 아래 사유인데, 브라우저의
              focus() 스크롤은 대상이 일부만 잘린 상태를 "보인다"로 판정해 굴리지 않는다
              (실컴포넌트 실측: 본문에 70px 굴릴 여유가 있는데도 scrollTop 이 0 그대로였다).
              그래서 잘린 아래 모서리와 글자수(이 칸의 aria-describedby 대상)가 액션 바에
              딱 붙은 채 남는다. scroll-padding-bottom 은 그 "가려졌나" 판정에 쓰는
              스크롤포트를 84px 줄여, 그 상태를 굴려야 할 상태로 바꾼다 — 레이아웃은 1px 도
              안 바뀌므로 본문이 넘치지 않는 뷰포트에서는 굴림도 스크롤바도 안 생기고
              (실측 1440x1000: 수정 전후 좌표 동일), 스코어 고정 영역도 그대로라 위 R3
              계약을 건드리지 않는다.

              84 는 액션 바 실측 높이(85px = pt-4 16 + 버튼 48 + pb-5 20 + 경계선 1)를 4px
              격자 유틸로 내린 값이다. 처음 넣었던 48px 은 "글자수 18 + gap 6 + 여백 24" 라는
              사후 계산이었고 실측에서 겹침을 25.7 → 12.7 로 절반만 줄였다 — 390 폭에서
              뷰포트 높이를 훑으면 48·56·64 는 각각 840·850·870 부근에서 글자수를 못 살리고
              84 만 700~932 전 구간을 닫는다. 패널에도 같은 값을 줘야 가로 모드에서 액션 바가
              함께 들어온다(위 패널 주석).

              흔한 처방인 "액션 바 높이만큼 본문에 padding-bottom" 은 여기서 듣지 않는다 —
              패딩은 내용이 접히는 지점을 옮기지 못하고 focus() 의 판정도 바꾸지 못한다.
              대상 쪽 scroll-margin-bottom 도 안 듣는다(실측: 84px 을 줘도 겹침 25.7 그대로). */}
          <div
            ref={scrollBodyRef}
            /* id 는 이 상자를 스타일과 무관하게 가리키기 위한 것이다. 위 계약들(액션 바가
               본문 밖에 있을 것 · 글자수가 입력칸과 같은 굴림 안에 있을 것)을 테스트에서
               잡을 때 예전에는 closest('div.overflow-y-auto') 를 썼는데, 본문에서 그
               클래스가 빠지면 closest 가 한 칸 더 올라가 **패널**(역시 overflow-y-auto)을
               잡아 단언이 조용히 통과했다 — 계약이 깨진 바로 그 순간에 침묵하는 로케이터였다. */
            id="league-result-modal-body"
            className="px-5 pt-4 pb-5 flex flex-col gap-4 min-h-[160px] overflow-y-auto overscroll-contain scroll-pb-21"
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
            <div className="flex flex-col gap-2">
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
                  'px-3 py-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
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

            {/* 감사 L-E finding 4 수정 — 몰수 표식 의도. 정정 전용(신규 입력은 몰수
                개념이 없다 — 전용 몰수 처리 버튼이 담당). 스크롤 본문 맨 아래에 둔다:
                고정 영역(위 스코어 블록)의 alpha 실측 px 예산을 건드리지 않기 위해서다
                — 여기 추가되는 높이는 본문이 이미 스크롤 컨테이너라 넘칠 때 스크롤로만
                흡수된다. 기본값은 base 승계(위 reset effect)라 손대지 않고 제출하면
                "정정 전과 같은 몰수 여부"가 그대로 유지된다. */}
            {mode === 'correction' && (
              <div className="flex min-h-[44px] items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 py-2">
                <input
                  id="league-result-correction-is-forfeit"
                  type="checkbox"
                  checked={isForfeit}
                  onChange={(e) => setIsForfeit(e.target.checked)}
                  disabled={pending}
                  aria-describedby="league-result-correction-is-forfeit-hint"
                  className="mt-[2px] h-5 w-5 shrink-0 rounded border-[var(--border-strong)] text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {/* label 은 제목 문장만 담는다 — 설명까지 label **안**에 두면 브라우저
                    접근성 이름은 aria-describedby 로 올바로 분리해도, testing-library
                    getByLabelText 는 label 의 전체 textContent 를 이어 붙여 매칭한다
                    (실측: 라벨 안에 두자 정확 문자열 매칭이 깨졌다). 설명은 label
                    바깥 형제로 두고 aria-describedby 로만 연결한다(사유 textarea와
                    같은 label/설명 분리 관례). */}
                <div className="flex flex-col gap-0.5">
                  <label
                    htmlFor="league-result-correction-is-forfeit"
                    className="cursor-pointer text-sm font-semibold text-[var(--text-strong)]"
                  >
                    이 결과는 몰수예요
                  </label>
                  <p id="league-result-correction-is-forfeit-hint" className="text-[12px] text-[var(--text-muted)]">
                    체크하면 순위표·경기 상세에 몰수 표시가 붙어요. 몰수가 아니면 해제해 주세요.
                  </p>
                </div>
              </div>
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
