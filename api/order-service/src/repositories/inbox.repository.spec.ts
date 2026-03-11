import { InboxRepository } from './inbox.repository';
import { InboxStatus } from '../entities/order-inbox.entity';

describe('InboxRepository', () => {
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
    it('should return true on successful insert (new event)', async () => {
      mockEm.insert.mockResolvedValue({ identifiers: [{ eventId: 'evt-1' }] });

      const result = await repository.tryInsert(mockEm, 'evt-1', 'topic', 'eventType');

      expect(result).toBe(true);
      expect(mockEm.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventId: 'evt-1', status: InboxStatus.UNPROCESSED }),
      );
    });

    it('should return false on duplicate key error', async () => {
      mockEm.insert.mockRejectedValue(new Error('duplicate key value'));

      const result = await repository.tryInsert(mockEm, 'evt-duplicate', 'topic', 'eventType');

      expect(result).toBe(false);
    });
  });

  describe('markProcessed', () => {
    it('should update inbox record to PROCESSED with processedAt', async () => {
      await repository.markProcessed(mockEm, 'evt-1');

      expect(mockRepo.update).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({ status: InboxStatus.PROCESSED }),
      );
    });
  });

  describe('markFailed', () => {
    it('should update inbox record to FAILED with failureReason', async () => {
      await repository.markFailed(mockEm, 'evt-1', 'Something went wrong');

      expect(mockRepo.update).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({
          status: InboxStatus.FAILED,
          failureReason: 'Something went wrong',
        }),
      );
    });
  });
});
