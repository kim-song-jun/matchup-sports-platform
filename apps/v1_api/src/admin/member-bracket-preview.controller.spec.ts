import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { MemberBracketPreviewController } from './member-bracket-preview.controller';
import { MemberBracketPreviewService } from './member-bracket-preview.service';
import { V1AuthGuard } from '../auth/v1-auth.guard';

const memberId = '11111111-1111-4111-8111-111111111111';
const cupId = '22222222-2222-4222-8222-222222222222';
const previewId = '33333333-3333-4333-8333-333333333333';
describe('Member bracket preview HTTP contract', () => {
  let app: INestApplication;
  const service = { start: jest.fn(), read: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MemberBracketPreviewController],
      providers: [{ provide: MemberBracketPreviewService, useValue: service }] })
      .overrideGuard(V1AuthGuard).useValue({ canActivate: (context: { switchToHttp(): { getRequest(): { v1User?: { id: string } } } }) => {
        context.switchToHttp().getRequest().v1User = { id: 'operator' }; return true;
      } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); service.start.mockResolvedValue({ previewId, tournamentId: cupId }); service.read.mockResolvedValue({ teamIds: [] }); });
  it('validates input, retains administrator identity, and sends no-store for both routes', async () => {
    const started = await request(app.getHttpServer()).post(`/admin/users/${memberId}/bracket-preview`)
      .send({ tournamentId: cupId, reason: '대진표 표시 조사' }).expect(201);
    expect(started.headers['cache-control']).toBe('private, no-store');
    expect(service.start).toHaveBeenCalledWith('operator', memberId, { tournamentId: cupId, reason: '대진표 표시 조사' });
    const read = await request(app.getHttpServer()).get(`/admin/users/${memberId}/bracket-preview/${previewId}`).expect(200);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(service.read).toHaveBeenCalledWith('operator', memberId, previewId);
  });
  it('rejects arbitrary identity fields and invalid tournament IDs before issuing a grant', async () => {
    await request(app.getHttpServer()).post(`/admin/users/${memberId}/bracket-preview`)
      .send({ tournamentId: cupId, reason: '대진표 표시 조사', adminUserId: 'other' }).expect(400);
    await request(app.getHttpServer()).post(`/admin/users/${memberId}/bracket-preview`)
      .send({ tournamentId: 'invalid', reason: '대진표 표시 조사' }).expect(400);
    expect(service.start).not.toHaveBeenCalled();
  });
  it('has no PATCH route to act as the member', async () => {
    await request(app.getHttpServer()).patch(`/admin/users/${memberId}/bracket-preview/${previewId}`).send({}).expect(404);
    expect(service.start).not.toHaveBeenCalled();
    expect(service.read).not.toHaveBeenCalled();
  });
});
