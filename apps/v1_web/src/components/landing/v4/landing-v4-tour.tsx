import { LandingDevice, LandingScreen } from '../landing-device';
import { TOUR_EXAMPLE_NOTE, TOUR_STEPS, TourHeader, TourStepCopy, TourStepDevice } from '../landing-tour';
import { LandingV4TourFrame } from './landing-v4-tour-pin';

const PIN_LABEL = `팀밋 앱 화면 예시. 왼쪽 설명을 읽는 순서대로 매치 목록, 팀, 대진표, 라이브 스코어, 선수 카드 화면으로 바뀌어요. ${TOUR_EXAMPLE_NOTE}`;

/**
 * 제품 투어(v4). 내용·순서·카피는 v3 투어(TOUR_STEPS)와 같다. 기본은 v3 식 "설명 + 그 단계 화면" 행이고,
 * 1024+·높이 700+ 에서는 훅이 frame[data-pin] 을 달아 행의 화면을 숨기고 오른쪽 고정 폰 한 대로 바꾼다.
 * 투어 폰은 보기 전용이다 — 버튼·단계 표시를 두지 않는다(조작은 히어로 폰만).
 */
export function LandingV4Tour() {
  return (
    <section id="tour" className="tm-landing-section" aria-labelledby="tour-heading">
      <div className="tm-landing-section-inner">
        <TourHeader />
        <LandingV4TourFrame className="tm-landing-v4-tour">
          <ol className="tm-landing-v3-tour tm-landing-v4-tour-rows">
            {TOUR_STEPS.map((step, i) => (
              <li key={step.kind} className="tm-landing-v3-tour-row" data-v4-tour-row>
                <div className="tm-landing-v3-tour-copy">
                  <TourStepCopy step={step} index={i} />
                </div>
                <div className="tm-landing-v3-tour-shot tm-landing-v4-tour-shot" data-loop="off" data-reveal>
                  <TourStepDevice step={step} />
                </div>
              </li>
            ))}
          </ol>
          <div className="tm-landing-v4-tour-pin" data-v4-tour-pin>
            <LandingDevice size="stage" activeTab="match" label={PIN_LABEL}>
              {TOUR_STEPS.map(({ kind, tab, Screen }, i) => (
                <LandingScreen key={kind} kind={kind} tabKey={tab} on={i === 0}>
                  <Screen />
                </LandingScreen>
              ))}
            </LandingDevice>
          </div>
        </LandingV4TourFrame>
      </div>
    </section>
  );
}
