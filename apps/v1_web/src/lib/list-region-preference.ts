/*
 * 팀 목록의 "내 지역 팀 먼저" — 어느 지역을 기준으로 할지 정한다.
 * 기준은 ① 이어 보기 주소가 싣고 온 값(near) ② 저장한 활동 지역뿐이고, 둘 다 없으면 기본 순서다.
 * 소속 팀의 지역으로 대신하지 않는다 — 활동 지역을 정하지 않은 사람은 팀이 있든 없든 똑같이 대한다.
 * 서버는 사용자의 지역을 읽지 않는다(같은 주소는 같은 결과) — 여기서 정한 값을 요청에 실어 보낸다.
 */

export type MasterRegionLike = { id: string; name: string; parentId: string | null };

export type MyTeamRegion =
  | { status: 'unknown' }
  | { status: 'none' }
  | { status: 'ready'; provinceId: string; provinceName: string; savedName: string };

/**
 * 저장한 활동 지역(시/군/구일 수 있다)을 목록 필터가 쓰는 시/도로 올린다. 서버가 regionId 하나만 받아 기본(primary) 한 곳만 쓴다.
 * 아직 모르는 상태(로딩·프로필 조회 실패·마스터에서 못 찾음)는 'none' 과 달리 안내를 내지 않는다 — 지역이 있는 사람에게 설정을 권하지 않기 위해서다.
 */
export function resolveMyTeamRegion({ unresolved, saved, master }: {
  unresolved: boolean;
  saved: ReadonlyArray<{ regionId: string; primary: boolean }> | undefined;
  master: ReadonlyArray<MasterRegionLike>;
}): MyTeamRegion {
  if (unresolved) return { status: 'unknown' };
  const mine = saved?.find((region) => region.primary) ?? saved?.[0];
  if (!mine) return { status: 'none' };
  const district = master.find((region) => region.id === mine.regionId);
  const province = district?.parentId ? master.find((region) => region.id === district.parentId) : district;
  if (!district || !province) return { status: 'unknown' };
  return {
    status: 'ready',
    provinceId: province.id,
    provinceName: province.name,
    savedName: district.id === province.id ? province.name : `${province.name} ${district.name}`,
  };
}

export type ListRegionPreference =
  /** 적용하지 않는다 — 비로그인, 다른 정렬, 지역을 직접 고른 목록, 기준 없이 열린 이어 보기. 안내도 없다. */
  | { status: 'off' }
  /** 아직 모른다(로딩 중이거나 조회 실패). 요청도 안내도 보류한다 — 지역이 있는 사람에게 설정을 권하지 않기 위해서다. */
  | { status: 'pending' }
  /** 로그인했지만 저장한 활동 지역이 없다(소속 팀이 있든 없든 같다). 순서는 기본 그대로이고 설정을 권한다. */
  | { status: 'none' }
  /** `source`: 저장한 활동 지역(saved) · 이어 보기 주소가 싣고 온 기준(link). `name` 은 모를 수 있다. */
  | { status: 'ready'; regionId: string; name: string; source: 'saved' | 'link' };

const OFF: ListRegionPreference = { status: 'off' };

export function resolveListRegionPreference({ applicable, signedIn, linkRegionId, isContinuation, myRegion, master }: {
  /** 기본 정렬(활동 많은순)이고 지역을 직접 고르지 않은 목록인가. */
  applicable: boolean;
  signedIn: boolean;
  /** URL 의 `near` — 이어 보기 주소가 첫 페이지의 기준을 이어 간다. */
  linkRegionId: string | undefined;
  /** 커서가 붙은 주소인가. */
  isContinuation: boolean;
  myRegion: MyTeamRegion;
  master: ReadonlyArray<MasterRegionLike>;
}): ListRegionPreference {
  if (!applicable) return OFF;
  if (linkRegionId) {
    return { status: 'ready', regionId: linkRegionId, name: master.find((region) => region.id === linkRegionId)?.name ?? '', source: 'link' };
  }
  // 기준(near) 없이 커서만 있는 주소는 기본 순서로 읽던 목록의 이어 보기다. 여기서 지역을 새로 얹으면 커서가 가리키는 자리가 달라진다.
  if (isContinuation || !signedIn) return OFF;
  if (myRegion.status === 'ready') {
    return { status: 'ready', regionId: myRegion.provinceId, name: myRegion.provinceName, source: 'saved' };
  }
  return myRegion.status === 'unknown' ? { status: 'pending' } : { status: 'none' };
}

/**
 * 목록 머리에 붙는 한 줄. 알 수 없는 상태·적용하지 않는 목록에는 내지 않는다.
 * 링크는 저장한 활동 지역이 없는 사람에게만 단다 — 이미 저장한 지역을 쓰는 줄은 안내만 하고,
 * 바꾸는 길은 필터 시트의 지역 안내가 맡는다(44px 터치 줄이 목록 머리에 늘 붙지 않게).
 */
export function listRegionNotice(
  preference: ListRegionPreference,
  settingsHref: string,
  /** 목록이 담는 것의 이름 — 팀·매치·팀 매치·대회·리그. 문구가 이 말을 그대로 쓴다. */
  noun = '팀',
): ListRegionNotice | undefined {
  const what = `${noun}${objectParticle(noun)}`;
  if (preference.status === 'none') {
    // 문장이 "지역 설정" 알약으로 이어진다("…먼저 보려면 [지역 설정]"). 알약 옆 390 폭 문구 영역이 224px 라 한 줄에 들어가야 한다.
    return { text: `가까운 ${what} 먼저 보려면`, link: { label: '지역 설정', href: settingsHref } };
  }
  if (preference.status !== 'ready') return undefined;
  const where = preference.name ? `(${preference.name})` : '';
  if (preference.source === 'saved') return { text: `내 활동 지역${where}의 ${what} 먼저 보여 줘요` };
  return { text: `내 지역${where}의 ${what} 먼저 보여 줘요` };
}

/** 목록 머리 안내 한 줄. 링크는 활동 지역이 없는 사람에게만 있다. */
export type ListRegionNotice = { text: string; link?: { label: string; href: string } };

/** 받침이 있으면 "을", 없으면 "를" — 마지막 글자가 한글 음절일 때만 받침을 본다(그 밖은 "를"). */
function objectParticle(word: string): '을' | '를' {
  const code = word.charCodeAt(word.length - 1);
  const isSyllable = code >= 0xac00 && code <= 0xd7a3;
  return isSyllable && (code - 0xac00) % 28 !== 0 ? '을' : '를';
}
