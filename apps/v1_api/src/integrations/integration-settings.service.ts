import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';
import { UpdateIntegrationSettingsDto } from './dto/integration-settings.dto';

const SETTINGS_ROW_ID = 'singleton';

/**
 * 어드민이 런타임에 편집하는 외부 연동 키(현재: 카카오맵 REST/JS 키)의 단일 소스.
 *
 * 조회 우선순위: DB(V1IntegrationSettings singleton row) > 환경변수
 * (KAKAO_REST_API_KEY / NEXT_PUBLIC_KAKAO_MAPS_JS_KEY) > 없음. 배포 시 env var로
 * 기본값을 주고, 어드민이 나중에 화면에서 값을 바꿀 수도 있다 — 둘 다 없으면
 * 호출자(KakaoGeocodingService, 지도 임베드 public 엔드포인트)가 각자
 * graceful-disable(WebPushService와 동일 패턴)로 처리한다.
 */
@Injectable()
export class IntegrationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async getKakaoRestApiKey(): Promise<string | null> {
    const row = await this.getRow();
    return nonEmpty(row?.kakaoRestApiKey) ?? nonEmpty(process.env.KAKAO_REST_API_KEY) ?? null;
  }

  async getKakaoMapsJsKey(): Promise<string | null> {
    const row = await this.getRow();
    return nonEmpty(row?.kakaoMapsJsKey) ?? nonEmpty(process.env.NEXT_PUBLIC_KAKAO_MAPS_JS_KEY) ?? null;
  }

  /** 어드민 설정 화면 조회용 — 원문 노출 없이 마스킹 + 값의 출처(admin/env/none)를 함께 반환. */
  async getMasked() {
    const row = await this.getRow();
    const restDbValue = nonEmpty(row?.kakaoRestApiKey);
    const jsDbValue = nonEmpty(row?.kakaoMapsJsKey);

    return {
      kakaoRestApiKey: maskKey(restDbValue),
      kakaoRestApiKeySource: sourceOf(restDbValue, process.env.KAKAO_REST_API_KEY),
      kakaoMapsJsKey: maskKey(jsDbValue),
      kakaoMapsJsKeySource: sourceOf(jsDbValue, process.env.NEXT_PUBLIC_KAKAO_MAPS_JS_KEY),
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async update(admin: V1ActiveAdmin, dto: UpdateIntegrationSettingsDto) {
    const data: { kakaoRestApiKey?: string | null; kakaoMapsJsKey?: string | null } = {};
    if (dto.kakaoRestApiKey !== undefined) data.kakaoRestApiKey = nonEmpty(dto.kakaoRestApiKey) ?? null;
    if (dto.kakaoMapsJsKey !== undefined) data.kakaoMapsJsKey = nonEmpty(dto.kakaoMapsJsKey) ?? null;

    // 감사 로그에는 키 원문을 남기지 않는다 — 어떤 필드가 set/cleared 됐는지만 기록한다.
    const changes: Record<string, 'set' | 'cleared'> = {};
    if (dto.kakaoRestApiKey !== undefined) changes.kakaoRestApiKey = data.kakaoRestApiKey ? 'set' : 'cleared';
    if (dto.kakaoMapsJsKey !== undefined) changes.kakaoMapsJsKey = data.kakaoMapsJsKey ? 'set' : 'cleared';

    await this.prisma.$transaction(async (tx) => {
      await tx.v1IntegrationSettings.upsert({
        where: { id: SETTINGS_ROW_ID },
        create: { id: SETTINGS_ROW_ID, updatedByAdminUserId: admin.id, ...data },
        update: { updatedByAdminUserId: admin.id, ...data },
      });

      if (Object.keys(changes).length > 0) {
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'integration_settings.update',
            targetType: 'integration_settings',
            targetId: SETTINGS_ROW_ID,
            afterJson: changes,
          },
          tx,
        );
      }
    });

    return this.getMasked();
  }

  private getRow() {
    return this.prisma.v1IntegrationSettings.findUnique({ where: { id: SETTINGS_ROW_ID } });
  }
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

function sourceOf(dbValue: string | null, envValue: string | undefined): 'admin' | 'env' | 'none' {
  if (dbValue) return 'admin';
  if (nonEmpty(envValue)) return 'env';
  return 'none';
}
