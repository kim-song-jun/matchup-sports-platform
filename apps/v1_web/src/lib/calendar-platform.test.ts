import { describe, expect, it } from 'vitest';
import { detectCalendarPlatform, googleCalendarAddUrl } from './calendar-platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const GALAXY = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const SAMSUNG_BROWSER = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

describe('detectCalendarPlatform', () => {
  it('앱 셸이 있으면 브라우저 정보와 상관없이 셸 값을 쓴다', () => {
    expect(detectCalendarPlatform(MAC, 'ios')).toBe('ios');
    expect(detectCalendarPlatform(IPHONE, 'android')).toBe('android');
  });

  it('브라우저에서는 아이폰·갤럭시(삼성 브라우저 포함)를 나누고 그 밖은 공통 안내', () => {
    expect(detectCalendarPlatform(IPHONE, null)).toBe('ios');
    expect(detectCalendarPlatform(GALAXY, null)).toBe('android');
    expect(detectCalendarPlatform(SAMSUNG_BROWSER, null)).toBe('android');
    expect(detectCalendarPlatform(MAC, null)).toBe('other');
    expect(detectCalendarPlatform('', null)).toBe('other');
  });
});

describe('googleCalendarAddUrl', () => {
  it('구독 주소를 인코딩해 구글 캘린더 추가 링크에 싣는다', () => {
    expect(googleCalendarAddUrl('webcal://alpha.teameet.co.kr/api/v1/calendar/feed/a.b.ics')).toBe(
      'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Falpha.teameet.co.kr%2Fapi%2Fv1%2Fcalendar%2Ffeed%2Fa.b.ics',
    );
  });
});
