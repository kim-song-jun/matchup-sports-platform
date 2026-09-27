import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { PublicHonestNote, PublicPageShell, PublicSection } from '@/components/public-site';
import { audienceBySlug } from '@/lib/public-content/audiences';
import { faqsByIds } from '@/lib/public-content/faq';
import { buildContactPageLd } from '@/lib/public-site/contact-ld';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { buildPublicMetadata } from '@/lib/seo';
import { ContactChannelGrid } from './contact-channel-grid';
import { CONTACT_HEADING, CONTACT_LEAD, CONTACT_PATH, CONTACT_TITLE } from './contact-content';
import { HostingInquiryForm } from './hosting-inquiry-form';
import styles from './contact.module.css';

const QUICK_FAQ_IDS = ['entry-fee-refund', 'result-correction', 'how-to-sign-up', 'delete-account', 'host-a-competition'];

export const metadata = buildPublicMetadata({ title: CONTACT_TITLE, description: CONTACT_LEAD, path: CONTACT_PATH });

// 빌드 러너는 API 에 못 닿아 보관 기간이 없는 화면(폼 없음)을 굽는다. 요청 시점 렌더로 그 창을 없앤다.
// site-info fetch 자체의 5분 캐시는 그대로다.
export const revalidate = 0;

/* 세션을 읽지 않는 정적 페이지다. 로그인 여부에 따른 강조는 ContactChannelGrid 가 브라우저에서만 한다. */
export default async function ContactPage() {
  const siteInfo = await fetchPublicSiteInfo();
  const email = siteInfo.contactEmail;
  const organizers = audienceBySlug('organizers');

  return (
    <PublicPageShell currentPath={CONTACT_PATH} breadcrumbs={[{ name: CONTACT_TITLE, path: CONTACT_PATH }]} siteInfo={siteInfo}>
      <PublicSection id="contact-channels" as="h1" keyword={CONTACT_TITLE} title={CONTACT_HEADING} lead={CONTACT_LEAD}>
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
              <Link className="tm-btn tm-btn-md tm-btn-primary" href="/my/inquiries/new">1:1 문의 쓰기</Link>
              <Link className="tm-btn tm-btn-md tm-btn-outline" href="/my/inquiries">내 문의 보기</Link>
            </div>
          </section>

          <section className={styles.channel} data-card="guest" aria-labelledby="channel-guest-title">
            <span className={styles.viewerBadge}>지금 쓰기 좋은 창구예요</span>
            <h2 id="channel-guest-title" className={styles.channelTitle}>로그인하지 않았다면 이메일</h2>
            <p className={styles.channelBody}>
              로그인이 안 되거나 계정이 없을 때는 아래 주소로 보내 주세요. 답변은 보내 주신 이메일로 드려요.
            </p>
            <p className={styles.email}>
              <a className={styles.inlineLink} href={`mailto:${email}`}>{email}</a>
            </p>
            <p className={styles.channelBody}>이렇게 적어 주면 더 빨리 도와드릴 수 있어요.</p>
            <ul className={styles.channelList}>
              <li>가입한 계정의 이메일(가입했다면)</li>
              <li>문제가 생긴 화면과 상황</li>
              <li>관련된 대회나 매치</li>
            </ul>
            <div className={styles.actions}>
              <a className="tm-btn tm-btn-md tm-btn-primary" href={`mailto:${email}`}>메일 앱에서 쓰기</a>
              <Link className="tm-btn tm-btn-md tm-btn-outline" href="/login?redirect=%2Fmy%2Finquiries%2Fnew">
                로그인하고 1:1 문의
              </Link>
            </div>
            <p className={styles.meta}>
              보내 주신 내용은 <Link className={styles.inlineLink} href="/terms?document=privacy">개인정보처리방침</Link>에 따라 다뤄요.
            </p>
          </section>
        </ContactChannelGrid>
      </PublicSection>

      <PublicSection
        id="hosting"
        tone="muted"
        keyword="대회 개설·제휴"
        title="우리 대회를 팀밋에서 열고 싶다면"
        lead="대회 개설은 지금 팀밋 운영팀을 거쳐서 해요. 문의를 남기면 운영팀이 검토한 뒤 개설을 함께 준비해요."
      >
        <div className={styles.hostingGrid}>
          <div>
            <h3 className={styles.channelTitle}>이렇게 시작해요</h3>
            <ol className={styles.steps} role="list">
              {(organizers.steps ?? []).map((step) => (
                <li key={step.title}>
                  <div>
                    <p className={styles.stepTitle}>{step.title}</p>
                    <p className={styles.stepBody}>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <PublicHonestNote items={organizers.notYet} />
            <p className={styles.meta}>
              <Link className={styles.inlineLink} href={organizers.path}>대회 운영자 안내 보기</Link>
            </p>
          </div>
          <div>
            {siteInfo.guestInquiryRetention ? (
              <>
                <HostingInquiryForm retention={siteInfo.guestInquiryRetention} contactEmail={email} />
                <p className={styles.meta}>
                  폼 대신 <a className={styles.inlineLink} href={`mailto:${email}`}>{email}</a> 로 보내도 돼요.
                </p>
              </>
            ) : (
              <div className={styles.fallback} role="note">
                <p className={styles.channelTitle}>지금은 이메일로 받아요</p>
                <p className={styles.channelBody}>
                  문의 폼을 잠시 열 수 없어요. 단체·대회 이름, 종목, 희망 시기를 적어{' '}
                  <a className={styles.inlineLink} href={`mailto:${email}`}>{email}</a> 로 보내 주세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </PublicSection>

      <PublicSection id="contact-faq" keyword="자주 묻는 질문" title="문의 전에 많이 찾는 답" lead="여기서 해결되면 답변을 기다리지 않아도 돼요.">
        <ul className={styles.quickLinks}>
          {faqsByIds(QUICK_FAQ_IDS).map((item) => (
            <li key={item.id}>
              <Link href={`/faq#${item.id}`}>{item.question}</Link>
            </li>
          ))}
        </ul>
        <p className={styles.meta}>
          <Link className={styles.inlineLink} href="/faq">자주 묻는 질문 전체 보기</Link>
        </p>
      </PublicSection>

      <JsonLd data={buildContactPageLd({ path: CONTACT_PATH, name: CONTACT_HEADING, description: CONTACT_LEAD })} />
    </PublicPageShell>
  );
}
