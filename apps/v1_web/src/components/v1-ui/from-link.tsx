'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { sanitizeRedirectPath, withFromPath } from '@/lib/session-storage';

type FromLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'replace' | 'scroll'> & { href: string };

/**
 * 모든 화면의 셸에 놓이는 링크용. href 는 출처(`?from=`) 없이 렌더해서 서버 HTML 이 화면마다 달라지지 않고,
 * 보조키 없는 왼쪽 클릭에서만 그 순간의 주소(쿼리·앵커 포함)를 출처로 붙여 이동한다 — 도착 화면의
 * 뒤로가기(AppBackLink)가 `?from=` 을 읽는다. 그 밖의 클릭(새 탭·새 창·다운로드)과 사이트 밖을 가리키는
 * href(절대 주소·`//host`·`/\host`)는 현재 주소를 실어 보내지 않도록 브라우저에 맡긴다.
 */
export function FromLink({ href, onClick, target, download, ...props }: FromLinkProps) {
  const router = useRouter();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const isDownload = download !== undefined && download !== null && download !== false;
    if ((target && target !== '_self') || isDownload) return;
    if (sanitizeRedirectPath(href) === null) return;
    event.preventDefault();
    const { pathname, search, hash } = window.location;
    router.push(withFromPath(href, `${pathname}${search}${hash}`));
  };
  return <Link {...props} href={href} target={target} download={download} onClick={handleClick} />;
}
