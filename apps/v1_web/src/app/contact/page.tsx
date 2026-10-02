import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { JsonLd } from '@/components/seo/json-ld';
import {
  PublicFaqList,
  PublicHonestNote,
  PublicPageShell,
  PublicSection,
  publicIllustrationSrc,
} from '@/components/public-site';
import { audienceBySlug } from '@/lib/public-content/audiences';
import { faqsByIds } from '@/lib/public-content/faq';
import { buildContactPageLd } from '@/lib/public-site/contact-ld';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { buildPublicMetadata } from '@/lib/seo';
import { ContactChannelGrid } from './contact-channel-grid';
import { CONTACT_HEADING, CONTACT_LEAD, CONTACT_PATH, CONTACT_TITLE } from './contact-content';
import { ContactEmailCopy } from './contact-email-copy';
import { HostingInquiryForm } from './hosting-inquiry-form';
import styles from './contact.module.css';

const QUICK_FAQ_IDS = ['entry-fee-refund', 'result-correction', 'how-to-sign-up', 'delete-account', 'host-a-competition'];

export const metadata = buildPublicMetadata({ title: CONTACT_TITLE, description: CONTACT_LEAD, path: CONTACT_PATH });

// 빌드 러너는 API 에 못 닿아 보관 기간이 없는 화면(폼 없음)을 굽는다. 요청 시점 렌더로 그 창을 없앤다.
// site-info fetch 자체의 5분 캐시는 그대로다.
export const revalidate = 0;

/* 세션을 읽지 않는 정적 페이지다. 로그인 여부에 따른 기본 선택·강조는 ContactChannelGrid 가 브라우저에서만 한다. */
export default async function ContactPage() {
  const siteInfo = await fetchPublicSiteInfo();
  const email = siteInfo.contactEmail;
  const organizers = audienceBySlug('organizers');

  return (
    <PublicPageShell
      currentPath={CONTACT_PATH}
      breadcrumbs={[{ name: CONTACT_TITLE, path: CONTACT_PATH }]}
      siteInfo={siteInfo}
      hero={{
        id: 'contact',
        keyword: CONTACT_TITLE,
        // 제목 글자는 CONTACT_HEADING(메타·ContactPage LD)과 같아야 한다 — page.test 가 대조한다
        title: (
          <>
            <span className="tm-ps-hero-line">궁금한 점은</span>{' '}
            <span className="tm-ps-hero-line"><em>여기로</em> 보내 주세요</span>
          </>
        ),
        lead: CONTACT_LEAD,
        illustration: 'chat-empty',
        floats: [
          { tag: '로그인했다면', title: '1:1 문의', body: '답변이 등록되면 알림으로 알려 드려요.' },
          { tag: '대회 개설·제휴', title: '회원가입 없이 문의', body: '운영팀이 검토한 뒤 개설을 함께 준비해요.' },
        ],
      }}
    >
      <section id="contact-channels" className={styles.channelsSection} aria-label="문의 창구">
        <div className="tm-ps-container">
          <ContactChannelGrid>
            <section className={styles.channel} data-card="member" aria-labelledby="channel-member-title">
              <span className={styles.viewerBadge}>지금 쓰기 좋은 창구예요</span>
              <h2 id="channel-member-title" className={styles.channelTitle}>로그인했다면 1:1 문의</h2>
              <p className={styles.channelBody}>
                문의와 답변이 마이페이지의 내 문의에 모이고, 답변이 등록되면 알림으로 알려 드려요.
              </p>
              <ul className={styles.channelList}>
                <li>문의 유형은 계정·매치·팀·대회·결제/환불·신고·기타 가운데 골라요.</li>
                <li>특정 대회 문의는 대회 상세의 문의하기로 남기면 어느 대회 문의인지 함께 전달돼요.</li>
              </ul>
              <div className={styles.actions}>
                <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/my/inquiries/new">1:1 문의 쓰기</Link>
                <Link className="tm-btn tm-btn-lg tm-btn-outline" href="/my/inquiries">내 문의 보기</Link>
              </div>
            </section>

            <section className={styles.channel} data-card="guest" aria-labelledby="channel-guest-title">
              <span className={styles.viewerBadge}>지금 쓰기 좋은 창구예요</span>
              <h2 id="channel-guest-title" className={styles.channelTitle}>로그인하지 않았다면 이메일</h2>
              <p className={styles.channelBody}>
                로그인이 안 되거나 계정이 없을 때는 아래 주소로 보내 주세요. 답변은 보내 주신 이메일로 드려요.
              </p>
              <ContactEmailCopy email={email} />
              <p className={styles.channelBody}>이렇게 적어 주면 더 빨리 도와드릴 수 있어요.</p>
              <ul className={styles.channelList}>
                <li>가입한 계정의 이메일(가입했다면)</li>
                <li>문제가 생긴 화면과 상황</li>
                <li>관련된 대회나 매치</li>
              </ul>
              <div className={styles.actions}>
                <a className="tm-btn tm-btn-lg tm-btn-primary" href={`mailto:${email}`}>메일 앱에서 쓰기</a>
                <Link className="tm-btn tm-btn-lg tm-btn-outline" href="/login?redirect=%2Fmy%2Finquiries%2Fnew">
                  로그인하고 1:1 문의
                </Link>
              </div>
              <p className={styles.meta}>
                보내 주신 내용은 <Link className={styles.inlineLink} href="/terms?document=privacy">개인정보처리방침</Link>에 따라 다뤄요.
              </p>
            </section>
          </ContactChannelGrid>
        </div>
      </section>

      {/* 공용 강조 밴드의 "대회 개설·제휴 문의" 창구가 #hosting 으로 들어온다 */}
      <section id="hosting" className={styles.hostingSection} aria-labelledby="hosting-heading">
        <div className="tm-ps-container">
          <div className={styles.host}>
            <div className={styles.hostCopy} data-reveal>
              <Image
                className={styles.hostIllu}
                src={publicIllustrationSrc('journey-done')}
                alt=""
                width={640}
                height={640}
                sizes="(min-width: 1024px) 160px, 112px"
              />
              <p className={styles.hostKw}>대회 개설·제휴</p>
              <h2 id="hosting-heading" className={styles.hostTitle}>우리 대회를 팀밋에서 열고 싶다면</h2>
              <p className={styles.hostLead}>
                대회 개설은 지금 팀밋 운영팀을 거쳐서 해요. 문의를 남기면 운영팀이 검토한 뒤 개설을 함께 준비해요.
              </p>
              <h3 id="hosting-steps-title" className={styles.hostStepsTitle}>이렇게 시작해요</h3>
              <ol className={styles.steps} role="list" aria-labelledby="hosting-steps-title">
                {organizers.steps.map((step) => (
                  <li key={step.title}>
                    <div>
                      <p className={styles.stepTitle}>{step.title}</p>
                      <p className={styles.stepBody}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <PublicHonestNote items={organizers.notYet} collapsible />
              <p className={styles.hostMore}>
                <Link className={styles.hostLink} href={organizers.path}>
                  대회 운영자 안내 보기
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </p>
            </div>
            <div className={styles.hostForm}>
              {siteInfo.guestInquiryRetention ? (
                <HostingInquiryForm retention={siteInfo.guestInquiryRetention} contactEmail={email} />
              ) : (
                <div className={styles.fallback} role="note">
                  <p className={styles.channelTitle}>지금은 이메일로 받아요</p>
                  <p className={styles.channelBody}>
                    문의 폼을 잠시 열 수 없어요. 단체·대회 이름, 종목, 희망 시기를 적어{' '}
                    <a className={styles.inlineLink} href={`mailto:${email}`}>{email}</a> 로 보내 주세요.
                  </p>
                </div>
              )}
              {siteInfo.guestInquiryRetention ? (
                <p className={styles.hostAfter}>
                  폼 대신 <a className={styles.hostLink} href={`mailto:${email}`}>{email}</a> 로 보내도 돼요.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <PublicSection
        id="contact-faq"
        layout="split"
        keyword="자주 묻는 질문"
        title="문의 전에 많이 찾는 답"
        lead="여기서 해결되면 답변을 기다리지 않아도 돼요."
        headExtra={(
          <p className="tm-ps-split-more">
            <Link className="tm-ps-text-link" href="/faq">자주 묻는 질문 전체 보기</Link>
          </p>
        )}
      >
        <PublicFaqList items={faqsByIds(QUICK_FAQ_IDS)} appearance="cards" />
      </PublicSection>

      <JsonLd data={buildContactPageLd({ path: CONTACT_PATH, name: CONTACT_HEADING, description: CONTACT_LEAD })} />
    </PublicPageShell>
  );
}
