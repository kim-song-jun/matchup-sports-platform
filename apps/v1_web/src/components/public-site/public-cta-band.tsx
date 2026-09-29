import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Mail, MessageSquareText, Trophy, type LucideIcon } from 'lucide-react';
import { publicIllustrationSrc, type PublicIllustration } from './public-illustration';

export type PublicCtaChannel = {
  readonly href: string;
  /** 어떤 사람에게 맞는 창구인지(예: 로그인했다면). */
  readonly eyebrow: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

function ChannelLink({ channel }: { channel: PublicCtaChannel }) {
  const Icon = channel.icon;
  const inner = (
    <>
      <span className="tm-ps-band-channel-icon" aria-hidden="true"><Icon size={20} /></span>
      <span className="tm-ps-band-channel-text">
        <small>{channel.eyebrow}</small>
        <b>{channel.label}</b>
      </span>
      <ArrowRight className="tm-ps-band-arrow" size={18} aria-hidden="true" />
    </>
  );
  // mailto: 는 라우팅 대상이 아니라 next/link 로 감싸지 않는다
  return channel.href.startsWith('mailto:')
    ? <a className="tm-ps-band-channel" href={channel.href}>{inner}</a>
    : <Link className="tm-ps-band-channel" href={channel.href}>{inner}</Link>;
}

/**
 * 페이지당 하나뿐인 강조 밴드. 테마와 무관한 고정 파랑(--static-blue) 위 흰 글씨라 다크에서도 대비가 같다.
 * 공개 페이지마다 제목·행동·창구만 바꿔 쓴다.
 */
export function PublicCtaBand({
  id,
  keyword,
  title,
  body,
  action,
  channels = [],
  channelsLabel,
  illustration,
}: {
  id: string;
  keyword: string;
  title: ReactNode;
  body: ReactNode;
  action: { readonly href: string; readonly label: string };
  channels?: readonly PublicCtaChannel[];
  channelsLabel?: string;
  illustration?: PublicIllustration;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="tm-ps-band-section" aria-labelledby={headingId}>
      <div className="tm-ps-container">
        <div className="tm-ps-band" data-reveal>
          <div className="tm-ps-band-top">
            <div className="tm-ps-band-copy">
              <p className="tm-ps-band-kw">{keyword}</p>
              <h2 id={headingId} className="tm-ps-band-title">{title}</h2>
              <p className="tm-ps-band-body">{body}</p>
              <Link className="tm-btn tm-btn-lg tm-ps-band-btn" href={action.href}>
                {action.label}
                <ArrowRight className="tm-ps-band-arrow" size={18} aria-hidden="true" />
              </Link>
            </div>
            {illustration ? (
              <Image
                className="tm-ps-band-illu"
                src={publicIllustrationSrc(illustration)}
                alt=""
                width={640}
                height={640}
                sizes="(min-width: 1024px) 280px, 160px"
              />
            ) : null}
          </div>
          {channels.length > 0 ? (
            <ul className="tm-ps-band-channels" aria-label={channelsLabel}>
              {channels.map((channel) => (
                <li key={channel.href}><ChannelLink channel={channel} /></li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** 도움말 트랙(/help·/faq·/help/glossary) 공용 "찾는 답이 없나요?" 밴드. 창구는 문의 페이지에 실제로 있는 것만 건다. */
export function PublicHelpCtaBand({ email }: { email: string }) {
  return (
    <PublicCtaBand
      id="help-cta"
      keyword="문의하기"
      title="찾는 답이 없나요?"
      body="로그인했다면 1:1 문의로, 로그인이 안 되면 이메일로, 대회 개설·제휴는 문의 폼으로 보내 주세요. 문의 창구에서 한 번에 고를 수 있어요."
      action={{ href: '/contact', label: '문의 창구 보기' }}
      channelsLabel="문의 창구 바로가기"
      channels={[
        { href: '/my/inquiries/new', eyebrow: '로그인했다면', label: '1:1 문의 쓰기', icon: MessageSquareText },
        { href: `mailto:${email}`, eyebrow: '로그인하지 않았다면 이메일', label: email, icon: Mail },
        { href: '/contact#hosting', eyebrow: '회원가입 없이', label: '대회 개설·제휴 문의', icon: Trophy },
      ]}
      illustration="chat-empty"
    />
  );
}
