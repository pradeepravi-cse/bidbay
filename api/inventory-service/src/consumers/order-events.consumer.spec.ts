import { OrderEventsConsumer } from './order-events.consumer';
import { OutboxStatus } from '../entities/inventory-outbox.entity';

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

describe('OrderEventsConsumer', () => {
  let consumer: OrderEventsConsumer;
  let mockDataSource: any;
  let mockInboxRepo: any;
  let mockEm: any;
  let mockQb: any;

  function makeKafkaContext(headers: Record<string, any> = {}) {
    return {
      getMessage: () => ({ headers }),
    } as any;
  }

  const orderPayload = {
    orderId: 'order-123',
    userId: 'user-1',
    items: [{ sku: 'SKU-001', quantity: 2, price: 10 }],
    totalAmount: 20,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockQb = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    mockEm = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      }),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((_entity: any, data: any) => data),
    };

    mockInboxRepo = {
      tryInsert: jest.fn(),
      markProcessed: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb: any) => cb(mockEm)),
    };

    consumer = new OrderEventsConsumer(mockDataSource, mockInboxRepo, mockLogger as any);
  });

  describe('onOrderCreated', () => {
    it('should return early when event-id header is missing', async () => {
      const ctx = makeKafkaContext({});

      await consumer.onOrderCreated(orderPayload, ctx);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should return early for duplicate event (tryInsert returns false)', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(false);
      mockQb.getMany.mockResolvedValue([]);
      const ctx = makeKafkaContext({ 'event-id': 'evt-dup' });

      await consumer.onOrderCreated(orderPayload, ctx);

      expect(mockEm.save).not.toHaveBeenCalled();
    });

    it('should reserve stock and emit inventory.reserved when stock is sufficient', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      const inventoryRow = { sku: 'SKU-001', availableQty: 10, reservedQty: 0 };
      mockQb.getMany.mockResolvedValue([inventoryRow]);
      const ctx = makeKafkaContext({ 'event-id': 'evt-new-1' });

      await consumer.onOrderCreated(orderPayload, ctx);

      // Stock should be reserved
      expect(inventoryRow.availableQty).toBe(8); // 10 - 2
      expect(inventoryRow.reservedQty).toBe(2); // 0 + 2
      expect(mockEm.save).toHaveBeenCalledWith(expect.anything(), inventoryRow);
    });

    it('should write inventory.reserved outbox row on success', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      mockQb.getMany.mockResolvedValue([{ sku: 'SKU-001', availableQty: 10, reservedQty: 0 }]);
      const ctx = makeKafkaContext({ 'event-id': 'evt-new-2' });

      await consumer.onOrderCreated(orderPayload, ctx);

      // Last save call should be the InventoryOutbox with inventory.reserved
      const saveCalls = mockEm.save.mock.calls;
      const outboxSave = saveCalls.find((call: any) =>
        call[1]?.eventType === 'inventory.reserved',
      );
      expect(outboxSave).toBeDefined();
      expect(outboxSave[1].status).toBe(OutboxStatus.UNSENT);
      expect(outboxSave[1].payload).toMatchObject({ orderId: 'order-123' });
    });

    it('should write inventory.failed outbox row when stock is insufficient', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      mockQb.getMany.mockResolvedValue([{ sku: 'SKU-001', availableQty: 1, reservedQty: 0 }]);
      const ctx = makeKafkaContext({ 'event-id': 'evt-low-stock' });

      await consumer.onOrderCreated(orderPayload, ctx);

      const saveCalls = mockEm.save.mock.calls;
      const outboxSave = saveCalls.find((call: any) =>
        call[1]?.eventType === 'inventory.failed',
      );
      expect(outboxSave).toBeDefined();
      expect(outboxSave[1].payload).toMatchObject({ orderId: 'order-123' });
      expect(outboxSave[1].payload.reason).toContain('SKU-001');
    });

    it('should write inventory.failed when SKU not found in inventory', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      mockQb.getMany.mockResolvedValue([]); // no inventory rows
      const ctx = makeKafkaContext({ 'event-id': 'evt-missing-sku' });

      await consumer.onOrderCreated(orderPayload, ctx);

      const saveCalls = mockEm.save.mock.calls;
      const outboxSave = saveCalls.find((call: any) =>
        call[1]?.eventType === 'inventory.failed',
      );
      expect(outboxSave).toBeDefined();
    });

    it('should mark inbox as processed after handling event', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      mockQb.getMany.mockResolvedValue([{ sku: 'SKU-001', availableQty: 10, reservedQty: 0 }]);
      const ctx = makeKafkaContext({ 'event-id': 'evt-processed' });

      await consumer.onOrderCreated(orderPayload, ctx);

      expect(mockInboxRepo.markProcessed).toHaveBeenCalledWith(mockEm, 'evt-processed');
    });

    it('should decode Buffer event-id header', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      mockQb.getMany.mockResolvedValue([{ sku: 'SKU-001', availableQty: 10, reservedQty: 0 }]);
      const ctx = makeKafkaContext({ 'event-id': Buffer.from('evt-buffer') });

      await consumer.onOrderCreated(orderPayload, ctx);

      expect(mockInboxRepo.tryInsert).toHaveBeenCalledWith(
        mockEm, 'evt-buffer', 'order.created', 'order.created',
      );
    });

    it('should not modify stock on failure path', async () => {
      mockInboxRepo.tryInsert.mockResolvedValue(true);
      const inventoryRow = { sku: 'SKU-001', availableQty: 1, reservedQty: 0 };
      mockQb.getMany.mockResolvedValue([inventoryRow]);
      const ctx = makeKafkaContext({ 'event-id': 'evt-no-stock-change' });

      await consumer.onOrderCreated(orderPayload, ctx);

      // availableQty and reservedQty should not change (failure path)
      expect(inventoryRow.availableQty).toBe(1);
      expect(inventoryRow.reservedQty).toBe(0);
    });
  });
});
