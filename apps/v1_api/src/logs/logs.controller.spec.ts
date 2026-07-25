import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { LogsController } from './logs.controller';
import { ErrorLogService } from '../error-logs/error-log.service';

describe('LogsController', () => {
  const logger = { warn: jest.fn(), error: jest.fn() };
  const errorLogService = { record: jest.fn() };
  let controller: LogsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [LogsController],
      providers: [
        { provide: getLoggerToken(LogsController.name), useValue: logger },
        { provide: ErrorLogService, useValue: errorLogService },
      ],
    }).compile();
    controller = moduleRef.get(LogsController);
  });

  it('logs error-level client errors via pino error with the client-tagged payload', () => {
    controller.report({ message: 'boom', url: '/matches/1', level: 'error' });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'client', url: '/matches/1' }),
      'boom',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs warn-level client errors via pino warn', () => {
    controller.report({ message: 'slow request', url: '/home', level: 'warn' });

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ url: '/home' }), 'slow request');
  });

  it('drops oversized context payloads instead of forwarding them', () => {
    const bigContext = { blob: 'x'.repeat(5000) };
    controller.report({ message: 'boom', url: '/x', level: 'error', context: bigContext });

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ context: undefined }), 'boom');
  });

  it('records the client error via ErrorLogService with source:client', () => {
    controller.report({ message: 'boom', url: '/matches/1', level: 'error', stack: 'Error: boom' });

    expect(errorLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'client',
        level: 'error',
        route: '/matches/1',
        message: 'boom',
        stack: 'Error: boom',
      }),
    );
  });

  it('still returns without throwing when ErrorLogService.record throws', () => {
    errorLogService.record.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });

    expect(() =>
      controller.report({ message: 'boom', url: '/matches/1', level: 'error' }),
    ).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ source: 'client' }), 'boom');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to record client error log',
    );
  });
});
