import type { ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { LandingCtaLink, type LandingCtaId } from '../landing-cta-link';
import { LandingDevice, LandingScreen, type LandingTabKey } from '../landing-device';
import { MatchScreenBody } from '../landing-app-screens';
import { BracketScreenBody, CardScreenBody, LiveScreenBody } from '../landing-competition-screens';
import { LandingV2Compare } from './landing-v2-compare';

type Chapter = {
  id: string;
  label: string;
  pain: string;
  title: [string, string];
  body: string;
  points: [string, string, string];
  /** "예전엔" 면 — 가짜 화면 대신 예전 방식을 순서대로 적은 설명 카드 */
  before: { title: string; steps: [string, string, string] };
  screen: { kind: 'match' | 'bracket' | 'live' | 'card'; tab: LandingTabKey; label: string; Body: () => ReactNode };
  cta: { href: string; id: LandingCtaId; label: string };
};

const EXAMPLE_NOTE = '화면 속 팀·점수·능력치는 모두 예시예요.';

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'ch1', label: '인원 모으기',
    pain: '참석 투표를 올리고, 빠진 사람을 다시 세고…',
    title: ['매치 한 장이면', '인원 세기는 끝나요'],
    body: '시간·장소·종목을 정해 매치를 열면, 신청과 취소가 모집 인원에 바로 반영돼요.',
    points: ['모인 인원과 명단이 카드에 정리돼요', '팀 경기는 팀 매치로 상대 팀을 찾아요', '매치가 성사되면 바로 채팅할 수 있어요'],
    before: { title: '단톡방에서 인원 세기', steps: ['참석 투표를 올려요', '못 오는 사람이 생기면 다시 세요', '모자라면 용병을 따로 구해요'] },
    screen: { kind: 'match', tab: 'match', label: '매치 목록 화면 예시: 모집 인원이 보이는 매치 카드', Body: MatchScreenBody },
    cta: { href: '/matches', id: 'story_find_match', label: '모집 중인 매치 보기' },
  },
  {
    id: 'ch2', label: '대진표·일정',
    pain: '결과가 나올 때마다 표를 고치고, 다시 공유하고…',
    title: ['대진표와 일정이', '한 화면에서 이어져요'],
    body: '대회는 참가 신청부터 조별리그·결선까지 앱에서 이어져요. 결과가 확정되면 대진표 다음 라운드에 자동으로 반영돼요.',
    points: ['토너먼트·조별+결선·정규 리그', '명단은 등번호와 이름으로', '시상 결과까지 공식 페이지로'],
    before: { title: '파일로 대진표 관리하기', steps: ['경기마다 결과를 표에 옮겨 적어요', '다음 라운드 대진을 손으로 채워요', '고칠 때마다 파일을 다시 공유해요'] },
    screen: { kind: 'bracket', tab: 'cup', label: '대회 대진표 화면 예시: 4강 승자가 결승으로 올라간 브래킷', Body: BracketScreenBody },
    cta: { href: '/tournaments', id: 'story_view_tournaments', label: '진행 중인 대회 보기' },
  },
  {
    id: 'ch3', label: '점수·경기 기록',
    pain: '누군가 종이에 적고, 끝나면 사진으로 공유하고…',
    title: ['골 하나까지', '바로 기록돼요'],
    body: '대회 스태프가 득점과 전·후반을 입력하면, 경기장에 없는 팀원도 같은 스코어를 봐요. 링크만 있으면 로그인 없이 볼 수 있어요.',
    points: ['득점·도움은 등번호로 남아요', '결과를 보내면 운영자 확인 한 번으로 확정돼요', '확정된 기록은 전적·개인 기록으로 이어져요'],
    before: { title: '종이 기록지로 점수 관리하기', steps: ['벤치에서 득점을 손으로 적어요', '누가 넣었는지 경기 뒤에 다시 맞춰 봐요', '기록지를 사진으로 찍어 공유해요'] },
    screen: { kind: 'live', tab: 'cup', label: '경기 기록 화면 예시: 후반 진행 중인 결승 경기와 득점 기록', Body: LiveScreenBody },
    cta: { href: '/tournaments', id: 'story_view_live', label: '대회 경기 기록 보기' },
  },
  {
    id: 'ch4', label: '전적·선수 기록',
    pain: '결과는 대화방에, 메모는 각자 휴대폰에…',
    title: ['뛴 만큼 쌓이는', '전적과 선수 카드'],
    body: '팀 전적은 전체·대회·리그·친선으로 나뉘어 쌓이고, 내 활동은 선수 카드 한 장으로 공유할 수 있어요.',
    points: ['카드 등급은 실력이 아니라 활동량으로 올라가요', '공개 신원은 닉네임만 보여요', '카드가 부담스러우면 숨길 수 있어요'],
    before: { title: '흩어진 기록 모으기', steps: ['결과 사진을 대화방에서 찾아요', '시즌 전적을 직접 세어 봐요', '개인 기록은 각자 따로 챙겨요'] },
    screen: { kind: 'card', tab: 'my', label: '선수 카드 화면 예시: 여섯 가지 능력치와 활동량 기준 골드 등급', Body: CardScreenBody },
    cta: { href: '/teams', id: 'story_browse_teams', label: '팀 둘러보기' },
  },
];

/** 전(해결) — 불편 하나에 챕터 하나. 설명 텍스트는 늘 보이고, 오른쪽 면만 "예전엔 / 이제는" 으로 바꿔 본다. */
export function LandingV2Story() {
  return (
    <section id="story" className="tm-landing-section" aria-labelledby="v2-story-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">해결</p>
          <h2 id="v2-story-heading" className="tm-landing-section-title">예전엔 이랬고,<br />이제는 이렇게 해요</h2>
          <p className="tm-landing-section-sub">버튼으로 예전 방식과 지금 화면을 직접 비교해 보세요. {EXAMPLE_NOTE}</p>
        </div>
        <ol className="tm-landing-v2-chapters">
          {CHAPTERS.map((chapter, i) => (
            <li key={chapter.id} id={chapter.id} className="tm-landing-v2-chapter">
              <div className="tm-landing-v2-chapter-text" data-reveal>
                <p className="tm-landing-v2-chapter-num"><b>{String(i + 1).padStart(2, '0')}</b>{chapter.label}</p>
                <p className="tm-landing-v2-chapter-pain">{chapter.pain}</p>
                <h3 className="tm-landing-v2-chapter-title">
                  {chapter.title[0]}<br />{chapter.title[1]}
                </h3>
                <p className="tm-landing-v2-chapter-body">{chapter.body}</p>
                <ul className="tm-landing-v2-chapter-points">
                  {chapter.points.map((point) => (
                    <li key={point}><Check size={18} aria-hidden="true" />{point}</li>
                  ))}
                </ul>
                <LandingCtaLink className="tm-landing-v2-chapter-cta" href={chapter.cta.href} cta={chapter.cta.id} variant="v2">
                  {chapter.cta.label}
                  <ArrowRight size={18} aria-hidden="true" />
                </LandingCtaLink>
              </div>
              <div className="tm-landing-v2-chapter-visual" data-reveal="scale">
                <LandingV2Compare
                  label={chapter.label}
                  before={<BeforeCard {...chapter.before} />}
                  after={
                    <LandingDevice size="mini" activeTab={chapter.screen.tab} label={`${chapter.screen.label}. ${EXAMPLE_NOTE}`}>
                      <LandingScreen kind={chapter.screen.kind} tabKey={chapter.screen.tab} on>
                        <chapter.screen.Body />
                      </LandingScreen>
                    </LandingDevice>
                  }
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function BeforeCard({ title, steps }: Chapter['before']) {
  return (
    <div className="tm-landing-v2-before">
      <p className="tm-landing-v2-before-tag">예전 방식</p>
      <p className="tm-landing-v2-before-title">{title}</p>
      <ol className="tm-landing-v2-before-steps">
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="tm-landing-v2-before-foot">매번 누군가 손으로 다시 확인해야 했어요</p>
    </div>
  );
}
