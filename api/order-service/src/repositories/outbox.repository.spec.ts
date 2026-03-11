import { OutboxRepository } from './outbox.repository';
import { OutboxStatus } from '../entities/order-outbox.entity';

describe('OutboxRepository', () => {
  let repository: OutboxRepository;
  let mockDataSource: any;
  let mockQueryBuilder: any;
  let mockEm: any;

  beforeEach(() => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    mockEm = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      }),
      save: jest.fn(),
    };

    mockDataSource = {};
    repository = new OutboxRepository(mockDataSource);
  });

  describe('findUnsentLocked', () => {
    it('should query UNSENT rows with FOR UPDATE SKIP LOCKED', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.findUnsentLocked(mockEm);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'outbox.status = :status',
        { status: OutboxStatus.UNSENT },
      );
      expect(mockQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(mockQueryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should return rows from query builder', async () => {
      const rows = [{ id: 'row-1', status: OutboxStatus.UNSENT }];
      mockQueryBuilder.getMany.mockResolvedValue(rows);

      const result = await repository.findUnsentLocked(mockEm);

      expect(result).toEqual(rows);
    });

    it('should respect custom batchSize', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.findUnsentLocked(mockEm, 5);

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
    });
  });

  describe('markSent', () => {
    it('should set status to SENT and sentAt timestamp', async () => {
      const outbox: any = { id: 'row-1', status: OutboxStatus.UNSENT, retryCount: 0, sentAt: null };
      mockEm.save.mockResolvedValue({ ...outbox, status: OutboxStatus.SENT });

      await repository.markSent(mockEm, outbox);

      expect(outbox.status).toBe(OutboxStatus.SENT);
      expect(outbox.sentAt).toBeInstanceOf(Date);
      expect(mockEm.save).toHaveBeenCalled();
    });
  });

  describe('markFailed', () => {
    it('should increment retryCount', async () => {
      const outbox: any = { id: 'row-1', status: OutboxStatus.UNSENT, retryCount: 1 };
      mockEm.save.mockResolvedValue(outbox);

      await repository.markFailed(mockEm, outbox);

      expect(outbox.retryCount).toBe(2);
      expect(outbox.status).toBe(OutboxStatus.UNSENT);
    });

    it('should set status to FAILED when retryCount reaches 5', async () => {
      const outbox: any = { id: 'row-1', status: OutboxStatus.UNSENT, retryCount: 4 };
      mockEm.save.mockResolvedValue(outbox);

      await repository.markFailed(mockEm, outbox);

      expect(outbox.retryCount).toBe(5);
      expect(outbox.status).toBe(OutboxStatus.FAILED);
    });

    it('should not change status to FAILED before 5 retries', async () => {
      const outbox: any = { id: 'row-1', status: OutboxStatus.UNSENT, retryCount: 3 };
      mockEm.save.mockResolvedValue(outbox);

      await repository.markFailed(mockEm, outbox);

      expect(outbox.retryCount).toBe(4);
      expect(outbox.status).toBe(OutboxStatus.UNSENT);
    });
  });
});
