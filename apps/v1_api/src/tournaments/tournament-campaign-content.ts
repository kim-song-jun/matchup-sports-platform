import { InternalServerErrorException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '@prisma/client';
import type { TournamentCampaignContentDto } from './dto/tournament-campaign.dto';
import { TournamentCampaignContentDto as TournamentCampaignContentDtoClass } from './dto/tournament-campaign.dto';

export function toCampaignContentJson(content: TournamentCampaignContentDto): Prisma.InputJsonObject {
  return {
    version: content.version,
    hero: {
      title: content.hero.title,
      ...(content.hero.summary === undefined ? {} : { summary: content.hero.summary }),
      ...(content.hero.imageUrl === undefined ? {} : { imageUrl: content.hero.imageUrl }),
    },
    intro: { title: content.intro.title, body: content.intro.body },
    highlightsSectionTitle: content.highlightsSectionTitle,
    highlights: content.highlights.map((highlight) => ({
      title: highlight.title,
      body: highlight.body,
      ...(highlight.imageUrl === undefined ? {} : { imageUrl: highlight.imageUrl }),
    })),
    faqSectionTitle: content.faqSectionTitle,
    faq: content.faq.map((item) => ({ question: item.question, answer: item.answer })),
  };
}

export function parseCampaignContentJson(content: Prisma.JsonValue): Prisma.InputJsonObject {
  if (content === null || Array.isArray(content) || typeof content !== 'object') {
    throwInvalidCampaignContent();
  }
  const dto = plainToInstance(TournamentCampaignContentDtoClass, content);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throwInvalidCampaignContent();
  }
  return toCampaignContentJson(dto);
}

function throwInvalidCampaignContent(): never {
  throw new InternalServerErrorException({
    code: 'TOURNAMENT_CAMPAIGN_CONTENT_INVALID',
    message: '저장된 캠페인 콘텐츠 형식이 올바르지 않아요.',
  });
}
