/**
 * [D14] 축구장 선 그리기. `pitch-formation-editor.tsx` 에서 **떼어냈다**.
 *
 * 분리한 이유: 선호 포지션 화면(프로필)도 같은 코트 그림을 쓰는데,
 * `PitchFormationEditor` 를 통째로 가져오면 그 파일이 import 하는
 * `@/app/team-matches/[id]/lineup/lineup.view-model` 까지 딸려온다 — **프로필 화면이
 * 팀매치 라인업 뷰모델에 의존**하게 되고, 경기별 라인업 화면을 걷어낸 방향과 어긋난다.
 *
 * 이 파일은 **순수 SVG** 다. props 도 상태도 없다 — 그래서 어디서 불러도 안전하다.
 */
export function PitchLines() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      {/* 축구장 **전체**를 그린다 — 아래쪽 절반이 우리 진영(우리 골대가 화면 맨 아래),
          위쪽 절반이 상대 진영(상대 골대가 맨 위)이고 하프라인은 정중앙(SVG y=50)이다.
          예전엔 우리 진영 절반만 그렸는데, 컨테이너 비율은 PITCH_ASPECT(105:68 = 풀
          구장)를 쓰고 서버 프리셋 좌표는 최전방을 y=85까지 밀어 두고 있어 — 그림만 반쪽
          이라 위쪽 절반이 라인 없는 빈 잔디가 되고 페널티박스는 세로로 두 배 늘어나
          있었다. 풀 구장으로 그리면 셋이 한 좌표계로 맞아떨어진다.

          좌표계: 앱 좌표 y=0(우리 골라인)이 CSS top:100%(피치 하단), y=100(상대 골라인)이
          top:0%다(PlayerToken의 topPct = 100 - positionY). 그림도 같은 방향이라 SVG y는
          `2 + (100 - 앱y) * 0.96` — 골키퍼(y=6)는 우리 페널티박스 안, 풋살 PIVO(y=85)는
          상대 페널티박스 안에 정확히 떨어진다.

          치수는 FIFA 규격(105m×68m, 페널티박스 40.32m×16.5m, 골에어리어 18.32m×5.5m,
          센터/페널티 아크 반지름 9.15m, 페널티 스폿 11m, 코너 아크 1m, 골대 폭 7.32m)을
          그대로 환산했다. viewBox 100×100을 preserveAspectRatio="none"으로 늘리므로 축별
          환산 계수가 다르다 — 폭 68m가 96 단위(x축 1m = 1.4118), 길이 105m가 96 단위
          (y축 1m = 0.9143). 두 값 모두 화면에서는 같은 픽셀 크기가 되므로(등방) 원은
          rx/ry를 나눠 준 <ellipse>로 그려야 실제로 정원으로 보인다. */}
      <rect x={2} y={2} width={96} height={96} rx={1.5} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      {/* 하프라인 + 센터 서클(9.15m) + 센터 스폿 */}
      <line x1={2} y1={50} x2={98} y2={50} stroke="rgba(255,255,255,0.9)" strokeWidth={0.9} />
      <ellipse cx={50} cy={50} rx={12.92} ry={8.37} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      <ellipse cx={50} cy={50} rx={0.85} ry={0.55} fill="rgba(255,255,255,0.85)" />
      {/* 우리 진영(아래) — 페널티 박스 · 골에어리어 · 페널티 스폿 · 페널티 아크 */}
      <rect x={21.53} y={82.91} width={56.93} height={15.09} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <rect x={37.07} y={92.97} width={25.87} height={5.03} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <ellipse cx={50} cy={87.94} rx={0.85} ry={0.55} fill="rgba(255,255,255,0.85)" />
      <path d="M 39.68 82.91 A 12.92 8.37 0 0 1 60.32 82.91" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      {/* 상대 진영(위) — 같은 규격을 하프라인 기준으로 대칭 배치 */}
      <rect x={21.53} y={2} width={56.93} height={15.09} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <rect x={37.07} y={2} width={25.87} height={5.03} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.7} />
      <ellipse cx={50} cy={12.06} rx={0.85} ry={0.55} fill="rgba(255,255,255,0.85)" />
      <path d="M 39.68 17.09 A 12.92 8.37 0 0 0 60.32 17.09" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth={0.55} />
      {/* 코너 아크 4곳(1m) — 중심이 각 코너에 오도록 sweep-flag=1로 통일한다. */}
      <path d="M 2 97.09 A 1.41 0.91 0 0 1 3.41 98" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <path d="M 96.59 98 A 1.41 0.91 0 0 1 98 97.09" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <path d="M 3.41 2 A 1.41 0.91 0 0 1 2 2.91" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      <path d="M 98 2.91 A 1.41 0.91 0 0 1 96.59 2" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
      {/* 골대 — 골라인 바깥(우리 y>98 / 상대 y<2)에 살짝 걸치는 프레임으로 표현 */}
      <rect x={44.83} y={98} width={10.33} height={1.83} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={0.8} />
      <rect x={44.83} y={0.17} width={10.33} height={1.83} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={0.8} />
    </svg>
  );
}

/** 포지션 라벨이 붙은 빈 슬롯 — 탭하면 채울 선수를 고르는 시트가 열린다. 44px 터치
 * 타겟을 확보하고, aria-label에 포지션 이름과 "비어 있음" 상태를 함께 담는다. */
