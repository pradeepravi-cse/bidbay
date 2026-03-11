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

describe('OutboxPollerService (Inventory Service)', () => {
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
    it('should skip emit when no unsent rows', async () => {
      mockOutboxRepo.findUnsentLocked.mockResolvedValue([]);

      await service.poll();

      expect(mockKafkaClient.emit).not.toHaveBeenCalled();
    });

    it('should emit inventory.reserved to Kafka with event-id header', async () => {
      const rows = [
        { id: 'outbox-1', eventType: 'inventory.reserved', payload: { orderId: 'o1' }, retryCount: 0 },
      ];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(of({}));

      await service.poll();

      expect(mockKafkaClient.emit).toHaveBeenCalledWith(
        'inventory.reserved',
        expect.objectContaining({
          headers: { 'event-id': 'outbox-1' },
          value: JSON.stringify({ orderId: 'o1' }),
        }),
      );
      expect(mockOutboxRepo.markSent).toHaveBeenCalledWith(mockEm, rows[0]);
    });

    it('should emit inventory.failed to Kafka', async () => {
      const rows = [
        { id: 'outbox-2', eventType: 'inventory.failed', payload: { orderId: 'o2', reason: 'Insufficient stock' }, retryCount: 0 },
      ];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(of({}));

      await service.poll();

      expect(mockKafkaClient.emit).toHaveBeenCalledWith('inventory.failed', expect.any(Object));
      expect(mockOutboxRepo.markSent).toHaveBeenCalled();
    });

    it('should mark row as FAILED when Kafka emit throws', async () => {
      const rows = [{ id: 'outbox-1', eventType: 'inventory.reserved', payload: {}, retryCount: 0 }];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(throwError(() => new Error('Kafka connection lost')));

      await service.poll();

      expect(mockOutboxRepo.markFailed).toHaveBeenCalledWith(mockEm, rows[0]);
      expect(mockOutboxRepo.markSent).not.toHaveBeenCalled();
    });

    it('should process multiple rows in one poll cycle', async () => {
      const rows = [
        { id: 'outbox-1', eventType: 'inventory.reserved', payload: {}, retryCount: 0 },
        { id: 'outbox-2', eventType: 'inventory.failed', payload: {}, retryCount: 0 },
      ];
      mockOutboxRepo.findUnsentLocked.mockResolvedValue(rows);
      mockKafkaClient.emit.mockReturnValue(of({}));

      await service.poll();

      expect(mockKafkaClient.emit).toHaveBeenCalledTimes(2);
      expect(mockOutboxRepo.markSent).toHaveBeenCalledTimes(2);
    });

    it('should continue processing remaining rows after one failure', async () => {
      const rows = [
        { id: 'outbox-1', eventType: 'inventory.reserved', payload: {}, retryCount: 0 },
        { id: 'outbox-2', eventType: 'inventory.failed', payload: {}, retryCount: 0 },
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
