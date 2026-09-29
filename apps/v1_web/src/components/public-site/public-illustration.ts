/** public/illustrations 에 실제로 있는 3D 그래픽 이름(agy-3d-graphic 매니페스트). 오타가 404 로 새지 않게 이름을 좁혀 둔다. */
export type PublicIllustration =
  | 'auth-notice'
  | 'auth-welcome'
  | 'chat-empty'
  | 'journey-done'
  | 'landing-hero'
  | 'matches-empty'
  | 'sport-futsal-hero'
  | 'sport-running-hero'
  | 'sport-soccer-hero'
  | 'sport-swimming-hero';

export function publicIllustrationSrc(name: PublicIllustration): string {
  return `/illustrations/${name}-640.webp`;
}
