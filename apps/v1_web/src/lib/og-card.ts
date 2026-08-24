import type { V1PlayerCard } from '@/types/api';

/**
 * 선수 카드 공유 이미지의 공통 재료 (Task 155).
 *
 * ## 왜 폰트를 레포에 넣었나
 * `next/og`(satori)는 **WOFF2 를 읽지 못한다.** 레포의 브랜드 폰트는
 * `public/fonts/PretendardVariable.woff2` 하나뿐이라, 그대로 쓰면 한글이 전부 빈
 * 네모로 그려진다 -- 닉네임과 "골"·"도움" 같은 라벨이 전부 사라진다는 뜻이다.
 *
 * 그래서 같은 Pretendard 를 **TTF 로 변환 + KS X 1001 상용 2,350 음절로 서브셋**해
 * `src/lib/og-fonts/` 에 뒀다(Regular 451KB · Bold 461KB, OFL 라이선스 원문 동봉).
 * 전체 11,172 음절을 넣으면 파일이 몇 배로 커지는데, 한국어 닉네임·팀명은 사실상
 * 이 범위 안에 든다. 범위 밖 글자는 tofu 로 그려지므로, 그런 사례가 보고되면
 * 서브셋 범위를 넓히는 것이 대응이다(원본 woff2 는 그대로 있으므로 재생성 가능).
 */

let cached: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

/**
 * 폰트를 `new URL(..., import.meta.url)` 로 읽는다 -- **`process.cwd()` 기반 경로를
 * 쓰면 배포에서 깨진다.**
 *
 * 런타임 이미지(`deploy/Dockerfile.v1-web`)는 `.next/standalone`, `.next/static`,
 * `public` 세 가지만 복사한다. `src/` 는 컨테이너에 아예 없으므로 `process.cwd()` 로
 * `src/...` 를 읽으면 로컬에서는 되고 alpha 에서는 500 이 난다. 이 형태로 쓰면
 * 번들러가 에셋을 추적해 standalone 출력에 함께 넣어 준다.
 */
export async function loadOgFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer } | null> {
  // 이미지 요청마다 900KB 를 두 번 읽지 않도록 프로세스 수명 동안 캐시한다.
  if (cached !== null) return cached;
  try {
    const [regular, bold] = await Promise.all([
      fetch(new URL('./og-fonts/Pretendard-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
      fetch(new URL('./og-fonts/Pretendard-Bold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    ]);
    cached = { regular, bold };
    return cached;
  } catch {
    // 에셋 추적이 어떤 이유로든 어긋나면(번들러 설정 변경, 배포 이미지 구성 변경)
    // **500 대신 라틴 전용 이미지**로 떨어진다. 카카오톡에 깨진 썸네일이 뜨는 것보다
    // 한글 없는 브랜드 이미지가 낫다 -- 링크 자체는 살아 있어야 한다.
    return null;
  }
}

export const OG_CARD_SIZE = { width: 1200, height: 630 } as const;

/** 등급색. 화면 카드(`globals.css`)와 같은 값을 쓴다 -- 링크 미리보기와 실제 화면이 달라 보이면 안 된다. */
export const OG_TIER: Record<V1PlayerCard['tier'], { label: string; ring: string; glow: string }> = {
  bronze: { label: '브론즈', ring: 'rgba(197, 132, 74, 0.55)', glow: 'rgba(197, 132, 74, 0.34)' },
  silver: { label: '실버', ring: 'rgba(176, 184, 193, 0.6)', glow: 'rgba(176, 184, 193, 0.34)' },
  gold: { label: '골드', ring: 'rgba(255, 195, 66, 0.62)', glow: 'rgba(255, 195, 66, 0.36)' },
  special: { label: '스페셜', ring: 'rgba(49, 130, 246, 0.7)', glow: 'rgba(49, 130, 246, 0.42)' },
};

export const OG_POSITION_LABEL: Record<string, string> = {
  FW: '공격수',
  MF: '미드필더',
  DF: '수비수',
  GK: '골키퍼',
};
