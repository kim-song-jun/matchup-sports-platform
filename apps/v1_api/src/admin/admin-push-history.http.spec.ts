import { ExecutionContext, ForbiddenException, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextService } from '../common/admin-context.service';
import { AdminOpsController } from './admin-ops.controller';
import { AdminOpsService } from './admin-ops.service';
import { AdminPushHistoryService } from './admin-push-history.service';

describe('Admin push history HTTP contract', () => {
  let app: INestApplication;
  const history = { list: jest.fn(), detail: jest.fn() };
  const context = { getActiveAdmin: jest.fn(), getMutationAdmin: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminOpsController], providers: [
        { provide: AdminOpsService, useValue: {} },
        { provide: AdminPushHistoryService, useValue: history },
        { provide: AdminContextService, useValue: context },
      ],
    }).overrideGuard(V1AuthGuard).useValue({ canActivate(ctx: ExecutionContext) {
      const req = ctx.switchToHttp().getRequest();
      if (!req.headers['x-test-identity']) throw new UnauthorizedException();
      req.v1User = { id: 'operator' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    jest.resetAllMocks();
    context.getActiveAdmin.mockResolvedValue({ id: 'admin', adminRole: 'support' });
    history.list.mockResolvedValue({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } });
  });

  it('exposes the actual GET route and transforms its bounded query', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/admin/ops/push-history?limit=5&target=broadcast').set('x-test-identity', 'admin').expect(200);
    expect(response.body).toEqual({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } });
    expect(history.list).toHaveBeenCalledWith({ limit: 5, target: 'broadcast' });
    expect(context.getActiveAdmin).toHaveBeenCalledWith('operator');
    expect(context.getMutationAdmin).not.toHaveBeenCalled();
  });

  it.each(['limit=0', 'limit=51', 'target=all', 'unknown=true'])('rejects invalid queries at the real route (%s)', async (query) => {
    await request(app.getHttpServer()).get(`/api/v1/admin/ops/push-history?${query}`).set('x-test-identity', 'admin').expect(400);
    expect(history.list).not.toHaveBeenCalled();
  });

  it('requires authentication and an active administrator for both history routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/ops/push-history').expect(401);
    context.getActiveAdmin.mockRejectedValue(new ForbiddenException());
    await request(app.getHttpServer()).get('/api/v1/admin/ops/push-history').set('x-test-identity', 'member').expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/ops/push-history/00000000-0000-4000-8000-000000000001').set('x-test-identity', 'member').expect(403);
    expect(history.list).not.toHaveBeenCalled();
    expect(history.detail).not.toHaveBeenCalled();
  });

  it('validates the real detail path before allowing a lookup', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/ops/push-history/not-a-uuid').set('x-test-identity', 'admin').expect(400);
    const id = '00000000-0000-4000-8000-000000000001';
    history.detail.mockResolvedValue({ id, content: { source: 'unavailable', body: null, url: null } });
    await request(app.getHttpServer()).get(`/api/v1/admin/ops/push-history/${id}`).set('x-test-identity', 'admin').expect(200);
    expect(history.detail).toHaveBeenCalledWith(id);
  });
});
