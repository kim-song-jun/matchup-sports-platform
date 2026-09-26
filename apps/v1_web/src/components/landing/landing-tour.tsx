import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { LandingDevice, LandingScreen, type LandingTabKey } from './landing-device';
import { MatchScreenBody, TeamScreenBody } from './landing-app-screens';
import { BracketScreenBody, CardScreenBody, LiveScreenBody } from './landing-competition-screens';

type TourStep = {
  kind: 'match' | 'team' | 'bracket' | 'live' | 'card';
  tab: LandingTabKey;
  label: string;
  title: [string, string];
  body: string;
  points: [string, string, string];
  screenLabel: string;
  Screen: () => ReactNode;
};

const STEPS: readonly TourStep[] = [
  {
    kind: 'match', tab: 'match', label: '매치 찾기',
    title: ['내 동네, 내 종목 매치를', '바로 찾아요'],
    body: '지역과 종목으로 거르면 경기 전 매치가 모여요. 모집 중인지 마감됐는지도 카드에서 바로 보여요.',
    points: ['축구·풋살·러닝·수영 종목 탭', '수준·성별 조건으로 한 번 더 거르기', '개인·팀 매치를 탭 하나로 전환'],
    screenLabel: '매치 목록 화면 예시: 종목 탭과 모집 인원이 보이는 매치 카드',
    Screen: MatchScreenBody,
  },
  {
    kind: 'team', tab: 'team', label: '팀 꾸리기',
    title: ['팀원 관리와 전적을', '한곳에서'],
    body: '초대하거나 가입 신청을 수락해 팀원을 모아요.',
    points: ['팀장·운영진·멤버 역할 구분', '전체·대회·리그·친선 전적 탭', '인원이 모자라면 용병(게스트) 모집'],
    screenLabel: '팀 화면 예시: 전적 탭과 역할별 멤버 목록',
    Screen: TeamScreenBody,
  },
  {
    kind: 'bracket', tab: 'cup', label: '대회 대진',
    title: ['대진표가', '알아서 채워져요'],
    body: '조별리그부터 결승까지, 이긴 팀이 대진표 다음 칸으로 알아서 올라가요. 현장 안내판을 찾아다닐 필요가 없어요.',
    points: ['토너먼트·조별+결선·정규 리그', '명단은 등번호와 이름으로', '시상 결과까지 공식 페이지로'],
    screenLabel: '대회 대진표 화면 예시: 4강 승자가 결승으로 올라간 브래킷',
    Screen: BracketScreenBody,
  },
  {
    kind: 'live', tab: 'cup', label: '라이브 스코어',
    title: ['경기장 밖에서도', '스코어를 실시간으로'],
    body: '운영 스태프가 득점을 입력하면 관람 화면의 스코어와 기록이 바로 바뀌어요. 링크만 있으면 누구나 볼 수 있어요.',
    points: ['전반·후반 진행 상황', '득점·도움을 등번호로 기록', '경기가 끝나도 기록 화면으로 남아요'],
    screenLabel: '라이브 스코어 화면 예시: 후반 진행 중인 결승 경기와 득점 기록',
    Screen: LiveScreenBody,
  },
  {
    kind: 'card', tab: 'my', label: '기록·선수 카드',
    title: ['뛴 만큼 쌓이는', '나만의 선수 카드'],
    body: '골·도움·엔트리·실력·매너·시간약속, 여섯 가지 능력치가 카드 한 장에 모여요. 등급은 실력이 아니라 활동량으로 올라가요.',
    points: ['공식 경기 기록 자동 누적', '공개 신원은 닉네임만, 카드 숨김도 가능', '링크 하나로 카드 공유'],
    screenLabel: '선수 카드 화면 예시: 여섯 가지 능력치와 활동량 기준 골드 등급',
    Screen: CardScreenBody,
  },
];

const EXAMPLE_NOTE = '화면 속 팀·점수·능력치는 모두 예시예요.';

/**
 * 제품 투어. 768 이상(창 높이 600 이상)은 오른쪽 sticky 폰이 읽는 스텝에 맞춰 바뀌고(컨트롤러가 동기화),
 * 모바일은 sticky 를 끄고 스텝마다 인라인 미니 화면을 둔다 — 390 에서 sticky 폰이 화면 절반을
 * 차지하면 설명을 읽을 자리가 없다.
 */
export function LandingTour() {
  return (
    <section id="tour" className="tm-landing-section" aria-labelledby="tour-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">기능</p>
          <h2 id="tour-heading" className="tm-landing-section-title">말보다 화면으로<br />보여 드릴게요</h2>
          <p className="tm-landing-section-sub">
            매치를 찾는 순간부터 기록이 남는 순간까지, 팀밋 화면 구성 그대로 옮겼어요. {EXAMPLE_NOTE}
          </p>
        </div>
        <div className="tm-landing-tour" data-tour>
          <div className="tm-landing-tour-stage" data-tour-stage data-loop="off">
            <LandingDevice size="stage" activeTab="match" label={`팀밋 앱 화면 예시. 왼쪽 설명을 읽는 순서대로 매치 목록, 팀, 대진표, 라이브 스코어, 선수 카드 화면으로 바뀌어요. ${EXAMPLE_NOTE}`}>
              {STEPS.map(({ kind, tab, Screen }, i) => (
                <LandingScreen key={kind} kind={kind} tabKey={tab} on={i === 0}>
                  <Screen />
                </LandingScreen>
              ))}
            </LandingDevice>
            <ol className="tm-landing-tour-dots" aria-hidden="true">
              {STEPS.map(({ kind }, i) => <li key={kind} data-tour-dot data-on={i === 0} />)}
            </ol>
          </div>
          <ol className="tm-landing-tour-steps">
            {STEPS.map((step, i) => (
              <li key={step.kind} className="tm-landing-tour-step" data-tour-step data-on={i === 0}>
                <p className="tm-landing-tour-num"><b>{String(i + 1).padStart(2, '0')}</b>{step.label}</p>
                <h3 className="tm-landing-tour-title">{step.title[0]}<br />{step.title[1]}</h3>
                <p className="tm-landing-tour-body">{step.body}</p>
                <ul className="tm-landing-tour-points">
                  {step.points.map((point) => (
                    <li key={point}><Check size={18} aria-hidden="true" />{point}</li>
                  ))}
                </ul>
                <div className="tm-landing-tour-mini" data-loop="off" data-reveal>
                  <LandingDevice size="mini" activeTab={step.tab} label={`${step.screenLabel}. ${EXAMPLE_NOTE}`}>
                    <LandingScreen kind={step.kind} tabKey={step.tab} on>
                      <step.Screen />
                    </LandingScreen>
                  </LandingDevice>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
