import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

function buildSocket(handshakeHeaders: Record<string, string> = {}) {
  return {
    id: 'socket-1',
    handshake: { headers: handshakeHeaders, auth: {} },
    data: {},
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  const prisma = {
    v1User: { findFirst: jest.fn() },
  };
  const server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      providers: [RealtimeGateway, { provide: PrismaService, useValue: prisma }],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
    gateway.server = server as never;
  });

  it('joins the user room on a successful dev-header handshake', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'active',
    });
    const socket = buildSocket({ 'x-v1-user-id': 'user-1' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket with no resolvable identity', async () => {
    const socket = buildSocket({});

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket for a suspended account', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'suspended',
    });
    const socket = buildSocket({ 'x-v1-user-id': 'user-1' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('emitToUser sends the event to that user room only', () => {
    gateway.emitToUser('user-1', 'notification:new', { id: 'notif-1' });

    expect(server.to).toHaveBeenCalledWith('user:user-1');
    expect(server.emit).toHaveBeenCalledWith('notification:new', { id: 'notif-1' });
  });
});
