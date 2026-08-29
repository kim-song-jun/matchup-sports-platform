import { Module } from '@nestjs/common';
import { WebPushService } from './web-push.service';
import { PushDeviceService } from './push-device.service';
import { FcmPushService } from './fcm-push.service';

/**
 * `WebPushService` 하나만 담는 최소 모듈 (2026-08-26).
 *
 * 왜 따로 떼는가: 이 서비스가 필요한 곳이 알림 도메인 밖으로 늘었다(승인 요청 푸시를
 * 보내는 GamesModule). 그런데 `NotificationsServiceModule` 을 통째로 import 하면
 * `RealtimeModule → GamesModule` 을 거쳐 **순환**이 되고, GamesModule 이 자기 providers 에
 * `WebPushService` 를 다시 선언하면 한 앱 그래프 안에 **인스턴스가 둘** 생긴다(스파이
 * 스펙이 조용히 무력화되는, 이 저장소가 이미 한 번 겪은 함정).
 *
 * WebPushService 의 의존은 PrismaService(@Global) + PinoLogger 뿐이라 이 모듈은 어떤
 * 도메인 모듈도 끌고 오지 않는다 — 그래서 누가 import 해도 순환이 생기지 않는다.
 */
@Module({
  providers: [WebPushService, PushDeviceService, FcmPushService],
  exports: [WebPushService, PushDeviceService, FcmPushService],
})
export class WebPushModule {}
