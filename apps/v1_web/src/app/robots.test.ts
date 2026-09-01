/**
 * robots 의 계약은 "무엇을 열었나"보다 **"열면서 무엇을 같이 열어 버리지 않았나"**다.
 * AI 크롤러를 허용하려고 `Allow: /` 를 주면 /admin·/my 까지 통째로 넘어간다 —
 * 이 파일은 그 사고를 막는다.
 */
import { describe, expect, it } from 'vitest';
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
    expect(result.sitemap).toBe('https://teameet.co.kr/sitemap.xml');
    expect(result.host).toBe('https://teameet.co.kr');
  });
});
