import { OutboxPollerService } from './outbox-poller.service';
import { of, throwError } from 'rxjs';

const mockLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logOutboxPublished: jest.fn(),
  logOutboxError: jest.fn(),
};

describe('OutboxPollerService (Order Service)', () => {
  let service: OutboxPollerService;
  let mockDataSource: any;
  let mockOutboxRepo: any;
  let mockKafkaClient: any;
  let mockEm: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEm = {};

    mockOutboxRepo = {
      findUnsentLocked: jest.fn(),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };

    mockKafkaClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb: any) => cb(mockEm)),
    };

    service = new OutboxPollerService(mockDataSource, mockOutboxRepo, mockKafkaClient, mockLogger as any);
  });

  describe('onModuleInit', () => {
    it('should connect to Kafka on module init', async () => {
      await service.onModuleInit();

      expect(mockKafkaClient.connect).toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    it('should do nothing when no unsent rows found', async () => {
      mockOutboxRepo.findUnsentLocked.mockResolvedValue([]);

      await service.poll();

      expect(mockKafkaClient.emit).not.toHaveBeenCalled();
    });

    it('should emit each row to Kafka with event-id header', async () => {
      const rows = [
        { id: 'outbox-1', eventType: 'order.created', payload: { orderId: 'o1' }, retryCount: 0 },
      ];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(of({}));

      await service.poll();

      expect(mockKafkaClient.emit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({
          headers: { 'event-id': 'outbox-1' },
          value: JSON.stringify({ orderId: 'o1' }),
        }),
      );
    });

    it('should mark row as SENT on successful publish', async () => {
      const rows = [{ id: 'outbox-1', eventType: 'order.created', payload: {}, retryCount: 0 }];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(of({}));

      await service.poll();

      expect(mockOutboxRepo.markSent).toHaveBeenCalledWith(mockEm, rows[0]);
      expect(mockOutboxRepo.markFailed).not.toHaveBeenCalled();
    });

    it('should mark row as FAILED when Kafka emit throws', async () => {
      const rows = [{ id: 'outbox-1', eventType: 'order.created', payload: {}, retryCount: 0 }];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(throwError(() => new Error('Kafka down')));

      await service.poll();

      expect(mockOutboxRepo.markFailed).toHaveBeenCalledWith(mockEm, rows[0]);
      expect(mockOutboxRepo.markSent).not.toHaveBeenCalled();
    });

    it('should process multiple rows in one poll cycle', async () => {
      const rows = [
        { id: 'outbox-1', eventType: 'order.created', payload: { orderId: 'o1' }, retryCount: 0 },
        { id: 'outbox-2', eventType: 'order.created', payload: { orderId: 'o2' }, retryCount: 0 },
      ];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(of({}));

      await service.poll();

      expect(mockKafkaClient.emit).toHaveBeenCalledTimes(2);
      expect(mockOutboxRepo.markSent).toHaveBeenCalledTimes(2);
    });

    it('should continue processing remaining rows after one failure', async () => {
      const rows = [
        { id: 'outbox-1', eventType: 'order.created', payload: {}, retryCount: 0 },
        { id: 'outbox-2', eventType: 'order.created', payload: {}, retryCount: 0 },
      ];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit
        .mockReturnValueOnce(throwError(() => new Error('Kafka down')))
        .mockReturnValueOnce(of({}));

      await service.poll();

      expect(mockOutboxRepo.markFailed).toHaveBeenCalledWith(mockEm, rows[0]);
      expect(mockOutboxRepo.markSent).toHaveBeenCalledWith(mockEm, rows[1]);
    });
  });
});
