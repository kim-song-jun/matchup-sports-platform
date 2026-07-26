import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import {
  CreateTournamentCampaignDto,
  ChangeTournamentCampaignStatusDto,
  UpdateTournamentCampaignDto,
} from './tournament-campaign.dto';

const metadata: ArgumentMetadata = { type: 'body', metatype: CreateTournamentCampaignDto };
const updateMetadata: ArgumentMetadata = { type: 'body', metatype: UpdateTournamentCampaignDto };
const statusMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: ChangeTournamentCampaignStatusDto,
};
const validPayload = {
  slug: 'summer-futsal-cup',
  content: {
    version: 1,
    hero: {
      title: '여름 풋살 컵',
      summary: '서울 대표 8팀의 결승전',
      imageUrl: 'https://cdn.teammeet.test/tournaments/summer.jpg',
    },
    intro: { title: '대회 소개', body: '모두가 즐기는 여름 대회예요.' },
    highlightsSectionTitle: '대회 하이라이트',
    highlights: [],
    faqSectionTitle: '자주 묻는 질문',
    faq: [],
  },
};

describe('Tournament campaign DTO validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

  it('accepts a lowercase kebab slug and version-1 typed content', async () => {
    await expect(pipe.transform(validPayload, metadata)).resolves.toMatchObject(validPayload);
  });

  it('accepts a safe local upload image path', async () => {
    const payload = {
      ...validPayload,
      content: {
        ...validPayload.content,
        hero: { ...validPayload.content.hero, imageUrl: '/uploads/2026/여름-컵.jpg' },
      },
    };

    await expect(pipe.transform(payload, metadata)).resolves.toMatchObject(payload);
  });

  it.each([
    ['uppercase slug', { ...validPayload, slug: 'Summer-Cup' }],
    [
      'unsupported content version',
      { ...validPayload, content: { ...validPayload.content, version: 2 } },
    ],
    [
      'raw HTML',
      {
        ...validPayload,
        content: { ...validPayload.content, intro: { title: '소개', body: '<script>alert(1)</script>' } },
      },
    ],
    [
      'raw JavaScript',
      {
        ...validPayload,
        content: { ...validPayload.content, intro: { title: '소개', body: 'alert(document.cookie)' } },
      },
    ],
    [
      'non-HTTPS image URL',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          hero: { ...validPayload.content.hero, imageUrl: 'http://cdn.teammeet.test/summer.jpg' },
        },
      },
    ],
    ['missing content', { slug: validPayload.slug }],
    ['missing hero', { ...validPayload, content: { ...validPayload.content, hero: undefined } }],
    ['missing intro', { ...validPayload, content: { ...validPayload.content, intro: undefined } }],
    [
      'missing highlights section title',
      { ...validPayload, content: { ...validPayload.content, highlightsSectionTitle: undefined } },
    ],
    [
      'missing FAQ section title',
      { ...validPayload, content: { ...validPayload.content, faqSectionTitle: undefined } },
    ],
    [
      'whitespace-only title',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          hero: { ...validPayload.content.hero, title: '   ' },
        },
      },
    ],
    [
      'raw CSS declaration',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          intro: { ...validPayload.content.intro, body: 'color:red;' },
        },
      },
    ],
    [
      'fetch call',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          intro: { ...validPayload.content.intro, body: "fetch('/private')" },
        },
      },
    ],
    [
      'CSS-breaking HTTPS URL',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          hero: {
            ...validPayload.content.hero,
            imageUrl: 'https://cdn.teammeet.test/image.jpg\\");color:red;/*',
          },
        },
      },
    ],
    [
      'private HTTPS URL',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          hero: { ...validPayload.content.hero, imageUrl: 'https://127.0.0.1/private.jpg' },
        },
      },
    ],
    [
      'local upload traversal',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          hero: { ...validPayload.content.hero, imageUrl: '/uploads/../private.jpg' },
        },
      },
    ],
    [
      'unknown content field',
      { ...validPayload, content: { ...validPayload.content, customHtml: '<p>custom</p>' } },
    ],
    [
      'more than eight highlights',
      {
        ...validPayload,
        content: {
          ...validPayload.content,
          highlights: Array.from({ length: 9 }, (_, index) => ({
            title: `하이라이트 ${index + 1}`,
            body: '설명',
          })),
        },
      },
    ],
  ])('rejects %s', async (_caseName, payload) => {
    await expect(pipe.transform(payload, metadata)).rejects.toThrow(BadRequestException);
  });

  it.each([
    ['null slug', { slug: null }],
    ['null content', { content: null }],
  ])('rejects %s in partial updates', async (_caseName, payload) => {
    await expect(pipe.transform(payload, updateMetadata)).rejects.toThrow(BadRequestException);
  });

  it('requires a non-empty audit reason for status changes', async () => {
    await expect(pipe.transform({ status: 'published' }, statusMetadata)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      pipe.transform({ status: 'published', reason: '   ' }, statusMetadata),
    ).rejects.toThrow(BadRequestException);
    await expect(
      pipe.transform({ status: 'published', reason: '캠페인 검수 완료' }, statusMetadata),
    ).resolves.toMatchObject({ status: 'published', reason: '캠페인 검수 완료' });
  });
});
