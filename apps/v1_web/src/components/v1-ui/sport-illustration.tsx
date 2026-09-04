import Image from 'next/image';

/**
 * 사진이 없는 매치·팀매치·홈 카드에 쓰는 종목 그래픽 이름(public/illustrations/<name>-640.webp).
 * 운영 4종목은 전용 그래픽, 그 외는 공용 스포츠 그래픽(스톱워치+공+콘). agy-3d-graphic 스킬 산출물.
 */
export function sportIllustration(sportName: string | null | undefined): string {
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
export function SportIllustration({ sport, sizes, className }: { sport: string | null | undefined; sizes: string; className?: string }) {
  return (
    <Image
      className={`tm-match-sport-illustration${className ? ` ${className}` : ''}`}
      src={`/illustrations/${sportIllustration(sport)}-640.webp`}
      alt=""
      aria-hidden="true"
      width={640}
      height={640}
      sizes={sizes}
    />
  );
}
