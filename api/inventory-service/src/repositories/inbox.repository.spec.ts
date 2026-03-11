import { InboxRepository } from './inbox.repository';
import { InboxStatus } from '../entities/inventory-inbox.entity';

describe('InboxRepository (Inventory Service)', () => {
  let repository: InboxRepository;
  let mockDataSource: any;
  let mockEm: any;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      update: jest.fn().mockResolvedValue({}),
    };

    mockEm = {
      insert: jest.fn(),
      getRepository: jest.fn().mockReturnValue(mockRepo),
    };

    mockDataSource = {};
    repository = new InboxRepository(mockDataSource);
  });

  describe('tryInsert', () => {
    it('should return true on first insert (new event)', async () => {
      mockEm.insert.mockResolvedValue({});

      const result = await repository.tryInsert(mockEm, 'evt-1', 'order.created', 'order.created');

      expect(result).toBe(true);
      expect(mockEm.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventId: 'evt-1', status: InboxStatus.UNPROCESSED }),
      );
    });

    it('should return false on duplicate key constraint violation', async () => {
      mockEm.insert.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

      const result = await repository.tryInsert(mockEm, 'evt-dup', 'order.created', 'order.created');

      expect(result).toBe(false);
    });
  });

  describe('markProcessed', () => {
    it('should update record to PROCESSED with processedAt', async () => {
      await repository.markProcessed(mockEm, 'evt-1');

      expect(mockRepo.update).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({ status: InboxStatus.PROCESSED }),
      );
    });
  });

  describe('markFailed', () => {
    it('should update record to FAILED with failureReason', async () => {
      await repository.markFailed(mockEm, 'evt-1', 'Processing error');

      expect(mockRepo.update).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({
          status: InboxStatus.FAILED,
          failureReason: 'Processing error',
        }),
      );
    });
  });
});
