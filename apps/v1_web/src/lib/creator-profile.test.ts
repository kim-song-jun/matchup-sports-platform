import { describe, expect, it } from 'vitest';
import { V1ApiError } from './api-client';
import { getCreatorProfilePrompt, profileEditHref } from './creator-profile';

describe('creator profile helpers', () => {
  it('turns missing fields into a user-facing prompt', () => {
    const error = new V1ApiError({
      status: 'error',
      statusCode: 422,
      code: 'PROFILE_COMPLETION_REQUIRED',
      message: 'profile required',
      details: { missingFields: ['realName', 'phone'] },
      timestamp: '2026-07-16T00:00:00.000Z',
    });

    expect(getCreatorProfilePrompt(error, '매치')).toContain('이름, 휴대폰 번호');
  });

  it('ignores unrelated failures and rejects external return routes', () => {
    expect(getCreatorProfilePrompt(new Error('network'), '팀')).toBeNull();
    expect(profileEditHref('//evil.example')).toBe('/my/profile/edit?returnTo=%2Fmy');
  });
});