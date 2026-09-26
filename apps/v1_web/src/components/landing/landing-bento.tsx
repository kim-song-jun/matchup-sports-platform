import { Check } from 'lucide-react';
import { BrandMark } from '@/components/v1-ui/brand-logo';

/* 알림 문구는 v1_api notifications.service.ts EVENT_TITLES 의 실제 제목만 쓴다. */
const NOTIFICATIONS = [
  { title: '매치 신청이 승인됐어요', detail: '성수 저녁 풋살', time: '방금' },
  { title: '리그 경기 결과가 확정됐어요', detail: '성동 풋살 리그', time: '5분 전' },
  { title: '팀 가입 신청이 수락됐어요', detail: 'FC 한강', time: '1시간 전' },
] as const;

/* 실제 상호평가는 네 항목을 함께 제출한다(v1_api reviews/dto/submit-review.dto.ts). */
const RATINGS = [
  { label: '실력', level: 'high' },
  { label: '매너', level: 'top' },
  { label: '시간약속', level: 'top' },
  { label: '안전', level: 'high' },
] as const;

const RESULT_FLOW = ['경기 종료', '결과 보내기', '운영자 확인', '결과 확정'] as const;

export function LandingBento() {
  return (
    <section id="more" className="tm-landing-section" aria-labelledby="more-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">편의 기능</p>
          <h2 id="more-heading" className="tm-landing-section-title">경기 전후에 필요한 것까지<br />담았어요</h2>
          <p className="tm-landing-section-sub">알림, 평가, 결과 확정. 매번 손으로 하던 일을 흐름 안에 넣었어요.</p>
        </div>
        <div className="tm-landing-bento">
          <article className="tm-landing-bento-card" data-size="tall" data-reveal>
            <h3>놓치지 않게,<br />알림이 먼저 알려 줘요</h3>
            <p>신청 승인, 결과 확정, 팀 가입 수락까지. 웹 푸시로 바로 받아요.</p>
            <div className="tm-landing-bento-vis">
              <ul className="tm-landing-noti" aria-label="알림 예시">
                {NOTIFICATIONS.map((item) => (
                  <li key={item.title}>
                    <span className="tm-landing-noti-app" aria-hidden="true"><BrandMark size={36} /></span>
                    <span className="tm-landing-noti-text">{item.title}<small>{item.detail}</small></span>
                    <span className="tm-landing-noti-time">{item.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
          <article className="tm-landing-bento-card" data-reveal>
            <h3>매너는 점수로 남아요</h3>
            <p>같이 뛴 사람을 실력·매너·시간약속·안전, 네 항목으로 서로 평가해요.</p>
            <div className="tm-landing-bento-vis" role="img" aria-label="상호평가 예시: 실력·매너·시간약속·안전 네 항목 막대">
              <ul className="tm-landing-rate">
                {RATINGS.map((rating) => (
                  <li key={rating.label} data-level={rating.level}>
                    <span>{rating.label}</span>
                    <span className="tm-landing-rate-track"><i /></span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
          <article className="tm-landing-bento-card" data-reveal>
            <h3>결과 확정은 한 단계</h3>
            <p>경기가 끝나면 결과를 보내고, 운영자가 확인하면 그대로 확정돼요.</p>
            <div className="tm-landing-bento-vis">
              <ol className="tm-landing-flow" aria-label="결과 확정 흐름">
                {RESULT_FLOW.map((step) => (
                  <li key={step}>
                    <span className="tm-landing-flow-node" aria-hidden="true"><Check size={14} /></span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </article>
          <article className="tm-landing-bento-card" data-size="wide" data-reveal>
            <h3>설치 없이 웹에서 바로</h3>
            <p>브라우저에서 바로 쓰고, 홈 화면에 추가하면 앱처럼 열려요.</p>
            <div className="tm-landing-bento-vis">
              <div className="tm-landing-homescreen" aria-hidden="true">
                <i /><i /><i /><i /><i />
                <span className="tm-landing-homescreen-me"><BrandMark size={52} /></span>
                <i /><i />
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
