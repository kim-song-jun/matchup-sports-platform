import { Card } from '@/components/v1-ui/primitives';
import { isLeagueCompetition } from '@/lib/competition-kind';
import type { V1TournamentDetail } from '@/types/api';

type FlowCompetition = Pick<V1TournamentDetail, 'kind' | 'format'>;

/* ── TournamentFlowSection — explains how the tournament progresses ──
 * The format badge alone ("조별리그 후 토너먼트") doesn't tell a participant how it
 * actually runs, so spell it out as numbered steps, format-aware, in 해요체.
 */
function tournamentFormatLabel(competition: FlowCompetition): string {
  if (isLeagueCompetition(competition)) return '리그 방식 (풀리그)';
  return competition.format === 'knockout' ? '토너먼트 (단판 승부)' : '조별 리그 후 토너먼트';
}

function getFlowSteps(competition: FlowCompetition): Array<{ title: string; body: string }> {
  // 정규 리그를 **먼저** 걸러야 한다. 거울 행은 group_knockout 이라 아래 첫 분기에 걸려
  // "조별 리그 → 결선 진출 → 결선 토너먼트" 를 리그 참가자에게 보여준다. isLeagueCompetition 은
  // format=league 단발 대회도 참이라 쓰면 안 된다 — 단발 대회는 맨 아래 대진표 안내로 가야 한다.
  if (competition.kind === 'regular_league') {
    return [
      { title: '풀리그', body: '참가한 모든 팀이 서로 맞붙어요. 맞붙는 횟수는 시즌 주차 수에 따라 달라져요.' },
      { title: '순위 집계', body: '승점과 득실차로 최종 순위를 가려요.' },
      { title: '시상', body: '최종 순위에 따라 상금과 순위를 시상해요.' },
    ];
  }
  const { format } = competition;
  if (format === 'group_knockout') {
    return [
      { title: '조별 리그', body: '같은 조 팀끼리 돌아가며 맞붙어 조 안에서 순위를 가려요.' },
      { title: '결선 진출', body: '각 조 상위 팀이 결선 토너먼트에 올라가요.' },
      { title: '결선 토너먼트', body: '편성된 16강·12강·8강·4강 중 해당하는 단계를 거쳐 결승에서 우승팀을 가려요. 부전승 팀은 경기 없이 다음 단계로 올라가요.' },
    ];
  }
  if (format === 'knockout') {
    return [
      { title: '대진 편성', body: '참가 팀을 토너먼트 대진표에 배치해요.' },
      { title: '토너먼트', body: '단판 승부로 이긴 팀만 다음 라운드에 올라가요.' },
      { title: '결승 · 시상', body: '마지막까지 이긴 팀이 우승해요. 3·4위전도 함께 진행돼요.' },
    ];
  }
  // 단발 대회의 리그 방식에는 시즌·주차가 없다 — 몇 번 맞붙는지는 대진 생성 때 정한 회전 수다.
  return [
    { title: '풀리그', body: '참가한 모든 팀이 서로 맞붙어요. 몇 번씩 맞붙는지는 대진표에서 확인할 수 있어요.' },
    { title: '순위 집계', body: '승점과 득실차로 최종 순위를 가려요.' },
    { title: '시상', body: '최종 순위에 따라 상금과 순위를 시상해요.' },
  ];
}

export function TournamentFlowSection({ tournament }: { tournament: FlowCompetition }) {
  const steps = getFlowSteps(tournament);
  return (
    <section aria-labelledby="flow-heading" style={{ marginTop: 24 }}>
      <div id="flow-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>대회 진행 방식</div>
      <Card pad={16} style={{ marginTop: 4 }}>
        <div className="tm-tourn-flow-format">{tournamentFormatLabel(tournament)}</div>
        <ol className="tm-tourn-flow">
          {steps.map((step, index) => (
            <li key={step.title} className="tm-tourn-flow-step">
              <span className="tm-tourn-flow-num" aria-hidden="true">{index + 1}</span>
              <div className="tm-tourn-flow-text">
                <div className="tm-text-label">{step.title}</div>
                <div className="tm-text-caption" style={{ marginTop: 2, lineHeight: 1.5 }}>{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
