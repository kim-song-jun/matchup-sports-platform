import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';

// ---------------------------------------------------------------------------
// Socket mock factory
// ---------------------------------------------------------------------------

function createSocketMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    handshake: {
      auth: { token: '' },
      query: {},
    },
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    to: jest.fn().mockReturnThis(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const jwtServiceMock = {
  verifyAsync: jest.fn(),
  sign: jest.fn().mockReturnValue('mock-token'),
};

const notificationsServiceMock = {
  markRead: jest.fn(),
};

const chatServiceMock = {
  assertParticipant: jest.fn(),
  postMessage: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: ChatService, useValue: chatServiceMock },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);

    // Provide a minimal server mock so emitToUser/emitToRoom don't throw
    (gateway as unknown as { server: unknown }).server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  // ── handleConnection ────────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('sets userId on client.data when JWT is valid', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: 'user-42' });
      const client = createSocketMock({ handshake: { auth: { token: 'valid-jwt' }, query: {} } });

      await gateway.handleConnection(client as never);

      expect((client.data as { userId: string }).userId).toBe('user-42');
      expect(client.join).toHaveBeenCalledWith('user:user-42');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects client when no token provided', async () => {
      const client = createSocketMock({ handshake: { auth: {}, query: {} } });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects client when JWT verification fails', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      const client = createSocketMock({ handshake: { auth: { token: 'bad-jwt' }, query: {} } });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  // ── handleChatJoin ──────────────────────────────────────────────────────────

  describe('handleChatJoin', () => {
    it('joins chat room when user is a participant', async () => {
      chatServiceMock.assertParticipant.mockResolvedValue(undefined);
      const client = createSocketMock();
      (client.data as Record<string, unknown>).userId = 'user-1';

      const result = await gateway.handleChatJoin(client as never, { roomId: 'room-1' });

      expect(client.join).toHaveBeenCalledWith('chat:room-1');
      expect(result).toEqual({ ok: true });
    });

    it('emits CHAT_FORBIDDEN error when user is not a participant', async () => {
      chatServiceMock.assertParticipant.mockRejectedValue(new Error('not participant'));
      const client = createSocketMock();
      (client.data as Record<string, unknown>).userId = 'user-99';

      await gateway.handleChatJoin(client as never, { roomId: 'room-1' });

      expect(client.emit).toHaveBeenCalledWith(
        'chat:error',
        expect.objectContaining({ code: 'CHAT_FORBIDDEN' }),
      );
      expect(client.join).not.toHaveBeenCalledWith('chat:room-1');
    });

    it('emits CHAT_FORBIDDEN when userId is not set (unauthenticated)', async () => {
      const client = createSocketMock();
      // data.userId is not set

      await gateway.handleChatJoin(client as never, { roomId: 'room-1' });

      expect(client.emit).toHaveBeenCalledWith(
        'chat:error',
        expect.objectContaining({ code: 'CHAT_FORBIDDEN' }),
      );
    });
  });

  // ── handleChatMessage ───────────────────────────────────────────────────────

  describe('handleChatMessage', () => {
    it('calls chatService.postMessage to persist and broadcast', async () => {
      chatServiceMock.postMessage.mockResolvedValue({});
      const client = createSocketMock();
      (client.data as Record<string, unknown>).userId = 'user-1';

      await gateway.handleChatMessage(client as never, {
        roomId: 'room-1',
        message: 'Hello!',
      });

      expect(chatServiceMock.postMessage).toHaveBeenCalledWith(
        'room-1',
        'user-1',
        { content: 'Hello!' },
      );
    });

    it('emits chat:error when postMessage throws', async () => {
      chatServiceMock.postMessage.mockRejectedValue(new Error('DB error'));
      const client = createSocketMock();
      (client.data as Record<string, unknown>).userId = 'user-1';

      await gateway.handleChatMessage(client as never, {
        roomId: 'room-1',
        message: 'Hello!',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'chat:error',
        expect.objectContaining({ code: 'CHAT_FORBIDDEN' }),
      );
    });

    it('does nothing when userId is not set', async () => {
      const client = createSocketMock();
      // data.userId is not set

      await gateway.handleChatMessage(client as never, {
        roomId: 'room-1',
        message: 'Hello!',
      });

      expect(chatServiceMock.postMessage).not.toHaveBeenCalled();
    });
  });

  // ── emitToUser ──────────────────────────────────────────────────────────────

  describe('emitToUser', () => {
    it('emits event to the correct user room', () => {
      const emitMock = jest.fn();
      const toMock = jest.fn().mockReturnValue({ emit: emitMock });
      (gateway as unknown as { server: { to: jest.Mock } }).server = {
        to: toMock,
      };

      gateway.emitToUser('user-1', 'notification:new', { msg: 'hello' });

      expect(toMock).toHaveBeenCalledWith('user:user-1');
      expect(emitMock).toHaveBeenCalledWith('notification:new', { msg: 'hello' });
    });
  });
});
