import Image from 'next/image';

/**
 * 사진이 없는 매치·팀매치·홈 카드에 쓰는 종목 그래픽 이름(public/illustrations/<name>-640.webp).
 * 운영 4종목은 전용 그래픽, 그 외는 공용 스포츠 그래픽(스톱워치+공+콘). agy-3d-graphic 스킬 산출물.
 *
 * `variant: 'hero'` 는 **176px 이상으로 그려지는 자리**(매치 상세 히어로: 176px, ≥1024 208px)
 * 전용 판을 고른다. agy-3d-graphic 스킬은 그 크기에서 오브젝트 셋(삼각 구도)을 요구하고,
 * 76px 목록 썸네일에서는 셋이 뭉개지므로 둘을 요구한다 — 한 파일로 둘 다 만족시킬 수 없어
 * 자리별로 파일을 나눈다(사용자 확정 2026-09-07, B안).
 *
 * `landing-hero`(4종목 외 폴백)는 이미 오브젝트 셋이라 hero 판을 따로 두지 않는다.
 */
export function sportIllustration(sportName: string | null | undefined, variant: 'card' | 'hero' = 'card'): string {
  const base = sportIllustrationBase(sportName);
  return variant === 'hero' && base !== 'landing-hero' ? `${base}-hero` : base;
}

function sportIllustrationBase(sportName: string | null | undefined): string {
  switch (sportName) {
    case '축구': return 'sport-soccer';
    case '풋살': return 'sport-futsal';
    case '러닝': return 'sport-running';
    case '수영': return 'sport-swimming';
    default: return 'landing-hero';
  }
}

/**
 * 매치 목록·상세, 팀매치, 홈 추천 카드가 공유한다 — 같은 종목이면 어느 화면에서든 같은 그래픽이
 * 나와야 해서 세 곳에 복사돼 있던 것을 하나로 모았다. 장식이라 aria-hidden 이고,
 * 크기는 소비처(카드/히어로)가 CSS 로 정한다.
 */
export function SportIllustration({ sport, sizes, className, variant = 'card' }: { sport: string | null | undefined; sizes: string; className?: string; variant?: 'card' | 'hero' }) {
  return (
    <Image
      className={`tm-match-sport-illustration${className ? ` ${className}` : ''}`}
      src={`/illustrations/${sportIllustration(sport, variant)}-640.webp`}
      alt=""
      aria-hidden="true"
      width={640}
      height={640}
      sizes={sizes}
    />
  );
}
