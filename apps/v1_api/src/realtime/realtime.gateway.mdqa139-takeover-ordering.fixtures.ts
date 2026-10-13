import { Test } from '@nestjs/testing';
import { V1OnboardingStatus } from '@prisma/client';
import { getLoggerToken } from 'nestjs-pino';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { GameBroadcastRegistry } from '../games/game-broadcast.registry';
import { GameTakeoverService } from '../games/game-takeover.service';
import {
  createOrderingService, ORDERING_GAME_ID, ORDERING_USER,
} from '../games/game-takeover.mdqa139-ordering.fixtures';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import { RealtimeGateway } from './realtime.gateway';

function deferred() {
  const resolver: { release?: () => void } = {};
  const promise = new Promise<void>((resolve) => { resolver.release = resolve; });
  return {
    promise,
    release() {
      if (resolver.release === undefined) throw new TypeError('Deferred resolver is unavailable');
      resolver.release();
    },
  };
}

export async function createGatewayOrderingFixture() {
  const actual = await createOrderingService();
  let nextProfileGate: { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | null = null;
  let nextProfileFailure: Error | null = null;
  const blockedUsers = new Set<string>();
  const profileDatabase = {
    v1User: {
      async findFirst({ where }: { where: { id: string } }) {
        const gate = nextProfileGate;
        nextProfileGate = null;
        if (gate !== null) { gate.entered.release(); await gate.released.promise; }
        const failure = nextProfileFailure;
        nextProfileFailure = null;
        if (failure !== null) throw failure;
        return {
          onboardingStatus: blockedUsers.has(where.id)
            ? V1OnboardingStatus.social_profile_deferred : V1OnboardingStatus.completed,
          adminUser: null,
        };
      },
    },
  };
  const moduleRef = await Test.createTestingModule({ providers: [
    RealtimeGateway,
    { provide: PrismaService, useValue: profileDatabase },
    { provide: GamesService, useValue: actual.service },
    { provide: GameTakeoverService, useValue: actual.takeover },
    { provide: TournamentStaffAccessService, useValue: {} },
    { provide: ManagedTermsRuntimeService, useValue: {} },
    { provide: getLoggerToken(RealtimeGateway.name), useValue: {} },
    { provide: GameBroadcastRegistry, useValue: {} },
  ] }).compile();
  const gateway = moduleRef.get(RealtimeGateway);
  function socket(user: V1AuthUser, clientInstanceId: string) {
    return {
      id: `socket-${user.id}-${clientInstanceId}`,
      data: { userId: user.id, authUser: user, clientInstanceId, authorizationSubjectVersion: 1 },
      emit: jest.fn<void, [string, unknown]>(),
    };
  }
  return {
    ...actual, blockedUsers,
    request(user = ORDERING_USER, clientInstanceId = 'same-tab'): ReturnType<RealtimeGateway['requestGameTakeover']> {
      return Reflect.apply(gateway.requestGameTakeover, gateway, [socket(user, clientInstanceId), {
        gameId: ORDERING_GAME_ID, authorizationSubjectVersion: 1, clientInstanceId, lastSequence: 7,
      }]);
    },
    holdNextProfile() {
      const gate = { entered: deferred(), released: deferred() };
      nextProfileGate = gate;
      return { entered: gate.entered.promise, release: () => gate.released.release() };
    },
    failNextProfile(error: Error) { nextProfileFailure = error; },
    pendingOrderCount() {
      const orders: unknown = Object.getOwnPropertyDescriptor(actual.takeover, 'requestOrders')?.value;
      if (!(orders instanceof Map)) throw new TypeError('Takeover request order registry is unavailable');
      return orders.size;
    },
    async close() { await moduleRef.close(); await actual.close(); },
  };
}
