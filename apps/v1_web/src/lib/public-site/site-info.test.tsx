import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicBusinessInfo } from '@/components/public-site/public-site-footer';
import {
  SITE_INFO_DEFAULTS,
  SITE_INFO_TIMEOUT_MS,
  businessInfoRows,
  fetchPublicSiteInfo,
  normalizeSiteInfo,
} from './site-info';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('사업자 정보 블록', () => {
  it('값이 없는 항목은 줄째 렌더하지 않는다(빈 문자열·공백 포함)', () => {
    const info = normalizeSiteInfo({
      companyName: '가상 회사',
      representativeName: '   ',
      businessRegistrationNumber: null,
      address: '',
      mailOrderSalesNumber: '제2026-가상-0000호',
      contactEmail: 'help@example.com',
    });
    render(<PublicBusinessInfo siteInfo={info} />);
    const block = screen.getByRole('region', { name: '사업자 정보' });
    const labels = within(block).getAllByRole('term').map((node) => node.textContent);
    expect(labels).toEqual(['상호', '통신판매업 신고번호', '이메일']);
    expect(block.textContent).not.toMatch(/대표자|사업자등록번호|사업장 주소/);
    expect(within(block).getByRole('link', { name: 'help@example.com' })).toHaveAttribute('href', 'mailto:help@example.com');
  });

  it('어드민 값이 비면 저장소에 공개된 상호·이메일만 남는다', () => {
    const rows = businessInfoRows(normalizeSiteInfo({ companyName: null, contactEmail: '' }));
    expect(rows).toEqual([
      { key: 'companyName', label: '상호', value: SITE_INFO_DEFAULTS.companyName },
      { key: 'contactEmail', label: '이메일', value: SITE_INFO_DEFAULTS.contactEmail },
    ]);
  });

  it('문자열이 아닌 값은 버린다', () => {
    const info = normalizeSiteInfo({ address: 123, representativeName: { name: 'x' } });
    expect(info.address).toBeNull();
    expect(info.representativeName).toBeNull();
  });
});

describe('fetchPublicSiteInfo', () => {
  it('API 가 실패하면 조용히 넘기지 않고 warn 을 남긴 뒤 기본값만 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = await fetchPublicSiteInfo();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(businessInfoRows(info).map((row) => row.key)).toEqual(['companyName', 'contactEmail']);
  });

  it('API 가 응답하지 않으면 상한 시간 뒤 기본값으로 넘어간다(렌더가 멈추지 않는다)', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pending = fetchPublicSiteInfo();
      await vi.advanceTimersByTimeAsync(SITE_INFO_TIMEOUT_MS);
      const info = await pending;
      expect(info.contactEmail).toBe(SITE_INFO_DEFAULTS.contactEmail);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('404 도 warn 을 남기고 기본값으로 간다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = await fetchPublicSiteInfo();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(info.guestInquiryRetention).toBeNull();
  });

  it('성공 응답은 envelope 의 data 를 읽고, 경로는 /public/site-info 다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: { address: '가상시 가상로 1', guestInquiryRetention: '문의 처리 완료 후 1년' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const info = await fetchPublicSiteInfo();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/public\/site-info$/);
    expect(info.address).toBe('가상시 가상로 1');
    expect(info.guestInquiryRetention).toBe('문의 처리 완료 후 1년');
    expect(info.companyName).toBe(SITE_INFO_DEFAULTS.companyName);
  });
});
