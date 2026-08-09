import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { AdminOpsController } from '../../admin/admin-ops.controller';
import { AdminOpsService } from '../../admin/admin-ops.service';
import { AdminTermsService } from '../../admin/admin-terms.service';
import { AdminController } from '../../admin/admin.controller';
import { AdminModule } from '../../admin/admin.module';
import { AdminService } from '../../admin/admin.service';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { GamesModule } from '../../games/games.module';
import { GamesService } from '../../games/games.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { RealtimeModule } from '../../realtime/realtime.module';
import { TermsModule } from '../../terms/terms.module';
import { TournamentsModule } from '../tournaments.module';
import { TournamentStaffAccessService } from './tournament-staff-access.service';
import { TournamentStaffGuard } from './tournament-staff.guard';
import { TournamentStaffService } from './tournament-staff.service';

describe('Task 7 production module wiring', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        LoggerModule.forRoot(),
        TermsModule,
        GamesModule,
        RealtimeModule,
        TournamentsModule,
        AdminModule,
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('resolves the Task 7 graph while preserving the authenticated admin boundary', () => {
    expect(moduleRef.get(GamesService)).toBeInstanceOf(GamesService);
    expect(moduleRef.get(OperationAuditWriterService)).toBeInstanceOf(
      OperationAuditWriterService,
    );
    expect(moduleRef.get(TournamentStaffAccessService)).toBeInstanceOf(
      TournamentStaffAccessService,
    );
    expect(moduleRef.get(TournamentStaffGuard)).toBeInstanceOf(TournamentStaffGuard);
    expect(moduleRef.get(TournamentStaffService)).toBeInstanceOf(TournamentStaffService);
    expect(moduleRef.get(RealtimeGateway)).toBeInstanceOf(RealtimeGateway);
    expect(moduleRef.get(AdminService)).toBeInstanceOf(AdminService);
    expect(moduleRef.get(AdminOpsService)).toBeInstanceOf(AdminOpsService);
    expect(moduleRef.get(AdminTermsService)).toBeInstanceOf(AdminTermsService);
    expect(Reflect.getMetadata(PATH_METADATA, AdminController)).toBe('admin');
    expect(Reflect.getMetadata(PATH_METADATA, AdminOpsController)).toBe('admin/ops');
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toContain(V1AuthGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminOpsController)).toContain(V1AuthGuard);
    console.log(
      'TASK7_MODULE_WIRING=PASS games=audit tournaments=staff realtime=disconnect admin=unchanged task18Apis=deferred',
    );
  });
});
