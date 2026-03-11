import { InventoryEventsConsumer } from './inventory-events.consumer';
import { OrderStatus } from '../entities/order.entity';

const mockLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logKafkaIncoming: jest.fn(),
  logKafkaDuplicate: jest.fn(),
  logKafkaSuccess: jest.fn(),
  logKafkaError: jest.fn(),
};

describe('InventoryEventsConsumer', () => {
  let consumer: InventoryEventsConsumer;
  let mockDataSource: any;
  let mockInboxRepo: any;
  let mockEm: any;

  function makeKafkaContext(headers: Record<string, any> = {}) {
    return {
      getMessage: () => ({ headers }),
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockEm = {
      update: jest.fn().mockResolvedValue({}),
    };

    mockInboxRepo = {
      tryInsert: jest.fn(),
      markProcessed: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb: any) => cb(mockEm)),
    };

    consumer = new InventoryEventsConsumer(mockDataSource, mockInboxRepo, mockLogger as any);
  });

  describe('onInventoryReserved', () => {
    const reservedData = {
      orderId: 'order-1',
      reservedItems: [{ sku: 'SKU-001', quantity: 2 }],
    };

    it('should confirm order on successful inbox insert', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      const ctx = makeKafkaContext({ 'event-id': 'evt-reserved-1' });

      await consumer.onInventoryReserved(reservedData, ctx);

      expect(mockEm.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'order-1' },
        expect.objectContaining({ status: OrderStatus.CONFIRMED }),
      );
      expect(mockInboxRepo.markProcessed).toHaveBeenCalledWith(mockEm, 'evt-reserved-1');
    });

    it('should skip processing for duplicate event (tryInsert returns false)', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(false);
      const ctx = makeKafkaContext({ 'event-id': 'evt-reserved-dup' });

      await consumer.onInventoryReserved(reservedData, ctx);

      expect(mockEm.update).not.toHaveBeenCalled();
    });

    it('should return early when event-id header is missing', async () => {
      const ctx = makeKafkaContext({});

      await consumer.onInventoryReserved(reservedData, ctx);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should decode Buffer event-id header', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      const ctx = makeKafkaContext({ 'event-id': Buffer.from('evt-buffer-1') });

      await consumer.onInventoryReserved(reservedData, ctx);

      expect(mockInboxRepo.tryInsert).toHaveBeenCalledWith(
        mockEm, 'evt-buffer-1', 'inventory.reserved', 'inventory.reserved',
      );
    });
  });

  describe('onInventoryFailed', () => {
    const failedData = { orderId: 'order-2', reason: 'Insufficient stock for SKU-001' };

    it('should cancel order on successful inbox insert', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      const ctx = makeKafkaContext({ 'event-id': 'evt-failed-1' });

      await consumer.onInventoryFailed(failedData, ctx);

      expect(mockEm.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'order-2' },
        expect.objectContaining({
          status: OrderStatus.CANCELLED,
          failureReason: 'Insufficient stock for SKU-001',
        }),
      );
      expect(mockInboxRepo.markProcessed).toHaveBeenCalledWith(mockEm, 'evt-failed-1');
    });

    it('should skip processing for duplicate event', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(false);
      const ctx = makeKafkaContext({ 'event-id': 'evt-failed-dup' });

      await consumer.onInventoryFailed(failedData, ctx);

      expect(mockEm.update).not.toHaveBeenCalled();
    });

    it('should return early when event-id header is missing', async () => {
      const ctx = makeKafkaContext({});

      await consumer.onInventoryFailed(failedData, ctx);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should decode Buffer event-id header', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      const ctx = makeKafkaContext({ 'event-id': Buffer.from('evt-buffer-failed') });

      await consumer.onInventoryFailed(failedData, ctx);

      expect(mockInboxRepo.tryInsert).toHaveBeenCalledWith(
        mockEm, 'evt-buffer-failed', 'inventory.failed', 'inventory.failed',
      );
    });
  });
});
