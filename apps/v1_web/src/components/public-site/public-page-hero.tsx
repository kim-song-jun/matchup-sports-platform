import Image from 'next/image';
import type { ReactNode } from 'react';
import type { BreadcrumbItem } from '@/lib/structured-data';
import { publicIllustrationSrc, type PublicIllustration } from './public-illustration';
import { PublicBreadcrumb } from './public-breadcrumb';

/** 일러스트 옆에 겹쳐 놓는 예시 카드. 본문에 이미 있는 문장을 되풀이하므로 장식으로 둔다(1024+ 에서만 보인다). */
export type PublicHeroFloat = { readonly tag: string; readonly title: string; readonly body: string };

export type PublicPageHeroProps = {
  /** 제목 id 의 앞부분. 페이지 안에서 고유해야 한다. */
  id: string;
  keyword: string;
  /** 페이지의 h1. 줄을 나눌 때는 `.tm-ps-hero-line` 사이에 공백을 두어 textContent 가 한 문장으로 읽히게 한다. */
  title: ReactNode;
  lead?: ReactNode;
  illustration?: PublicIllustration;
  floats?: readonly PublicHeroFloat[];
  /** 설명 아래(검색창·갱신일 등). */
  children?: ReactNode;
  /** 그리드 아래 전체 폭(주제 카드 등). */
  after?: ReactNode;
};

/**
 * 공개 페이지 히어로: 키워드 → 큰 제목 → 설명 → (1024+ 오른쪽 / 그 아래는 설명 밑) 3D 일러스트.
 * 첫 화면이라 등장 모션을 걸지 않는다 — 하이드레이션 뒤에 숨겼다 보이면 깜빡임만 남는다.
 */
export function PublicPageHero({
  id,
  keyword,
  title,
  lead,
  illustration,
  floats,
  children,
  after,
  trail,
}: PublicPageHeroProps & { trail: readonly BreadcrumbItem[] }) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="tm-ps-hero" aria-labelledby={headingId}>
      <div className="tm-ps-container">
        <PublicBreadcrumb items={trail} />
        <div className="tm-ps-hero-grid" data-art={illustration ? 'true' : undefined}>
          <div className="tm-ps-hero-copy">
            <p className="tm-ps-hero-kw">
              <span className="tm-ps-hero-kw-dot" aria-hidden="true" />
              {keyword}
            </p>
            <h1 id={headingId} className="tm-ps-hero-title">{title}</h1>
            {lead ? <p className="tm-ps-hero-lead">{lead}</p> : null}
            {children ? <div className="tm-ps-hero-body">{children}</div> : null}
          </div>
          {illustration ? (
            <div className="tm-ps-hero-art" aria-hidden="true" data-floats={floats?.length ? 'true' : undefined}>
              <Image
                className="tm-ps-hero-illu"
                src={publicIllustrationSrc(illustration)}
                alt=""
                width={640}
                height={640}
                sizes="(min-width: 1024px) 320px, 176px"
              />
              {floats?.slice(0, 2).map((float, index) => (
                <div key={float.title} className="tm-ps-hero-float" data-pos={index === 0 ? 'a' : 'b'}>
                  <span className="tm-ps-hero-float-tag">{float.tag}</span>
                  <b className="tm-ps-hero-float-title">{float.title}</b>
                  <span className="tm-ps-hero-float-body">{float.body}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {after}
      </div>
    </section>
  );
}
