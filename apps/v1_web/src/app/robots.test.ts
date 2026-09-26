/**
 * robots 의 계약은 "무엇을 열었나"보다 **"열면서 무엇을 같이 열어 버리지 않았나"**다.
 * AI 크롤러를 허용하려고 `Allow: /` 를 주면 /admin·/my 까지 통째로 넘어간다 —
 * 이 파일은 그 사고를 막는다.
 */
import { shouldServeStreamingMetadata } from 'next/dist/server/lib/streaming-metadata';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import robots from './robots';

const rules = () => {
  const value = robots().rules;
  return Array.isArray(value) ? value : [value];
};

const PRIVATE_PATHS = ['/admin/', '/my/', '/chat/', '/api/', '/auth/', '/users/'];

describe('robots', () => {
  it('AI 크롤러와 네이버 Yeti 를 명시적으로 다룬다', () => {
    const agents = rules().map((rule) => rule.userAgent);

    expect(agents).toContain('*');
    expect(agents).toContain('Yeti');
    // 학습 / 검색 색인 / 실시간 열람 세 용도가 모두 이름을 올려야 한다.
    expect(agents).toContain('GPTBot');
    expect(agents).toContain('OAI-SearchBot');
    expect(agents).toContain('ChatGPT-User');
    expect(agents).toContain('ClaudeBot');
    expect(agents).toContain('Claude-SearchBot');
    expect(agents).toContain('PerplexityBot');
  });

  it('모든 user-agent 가 같은 비공개 경로 차단을 받는다', () => {
    for (const rule of rules()) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow ?? ''];
      for (const path of PRIVATE_PATHS) {
        expect(disallow, `${String(rule.userAgent)} 가 ${path} 를 차단하지 않는다`).toContain(path);
      }
    }
  });

  it('어떤 user-agent 에도 전체 허용(Allow: /)을 주지 않는다', () => {
    for (const rule of rules()) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow ?? ''];
      expect(allow, `${String(rule.userAgent)} 에 전체 허용이 들어갔다`).not.toContain('/');
    }
  });

  it('sitemap 과 host 를 절대 URL 로 알린다', () => {
    const result = robots();
    expect(result.sitemap).toEqual([
      'https://teameet.co.kr/sitemap.xml',
      'https://teameet.co.kr/notices/feed.xml',
    ]);
    expect(result.host).toBe('https://teameet.co.kr');
  });
});

/**
 * robots 가 이름을 올린 크롤러는 콜드 렌더에서도 <head>(title·canonical·JSON-LD)를 받아야 한다.
 * 판정은 Next 가 요청마다 쓰는 함수 그대로 돌린다 — "blocking" 이면 head 가 완성돼서 나간다.
 */
describe('htmlLimitedBots', () => {
  // Next 는 config 로드 때 RegExp 를 .source 문자열로 바꿔 서버에 넘긴다.
  const pattern = nextConfig.htmlLimitedBots?.source;
  const getsFullHead = (userAgent: string) => !shouldServeStreamingMetadata(userAgent, pattern);

  it('robots 에 이름이 있는 모든 크롤러가 head 를 완성해서 받는다', () => {
    const named = rules()
      .map((rule) => String(rule.userAgent))
      .filter((agent) => agent !== '*');
    expect(named.length).toBeGreaterThan(5);
    for (const agent of named) {
      const userAgent = `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ${agent}/1.0)`;
      expect(getsFullHead(userAgent), agent).toBe(true);
    }
  });

  it('Next 기본 봇과 국내외 검색 크롤러를 잃지 않는다', () => {
    for (const userAgent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)',
      'Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html?faqId=28966)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    ]) {
      expect(getsFullHead(userAgent), userAgent).toBe(true);
    }
  });

  it('일반 브라우저와 다음 앱 인앱 브라우저는 스트리밍을 그대로 받는다', () => {
    for (const userAgent of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 DaumApps/7.9.0',
    ]) {
      expect(getsFullHead(userAgent), userAgent).toBe(false);
    }
  });
});
