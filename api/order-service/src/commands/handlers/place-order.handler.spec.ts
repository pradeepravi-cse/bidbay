import { PlaceOrderHandler } from './place-order.handler';
import { PlaceOrderCommand } from '../place-order.command';
import { OrderStatus } from '../../entities/order.entity';
import { OutboxStatus } from '../../entities/order-outbox.entity';

const mockLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logOperationStart: jest.fn(),
  logOperationSuccess: jest.fn(),
  logOperationError: jest.fn(),
};

const items = [
  { sku: 'SKU-001', quantity: 2, price: 10 },
  { sku: 'SKU-002', quantity: 1, price: 25 },
];

function makeHandler(orderOverrides: Record<string, any> = {}) {
  const fakeOrderId = 'order-uuid-1';
  const fakeCreatedAt = new Date('2024-01-01');
  let saveCallCount = 0;
  const em: any = {
    create: jest.fn().mockImplementation((_entity: any, data: any) => ({ ...data, ...orderOverrides })),
    save: jest.fn().mockImplementation((_entity: any, obj: any) => {
      saveCallCount++;
      if (saveCallCount === 1) {
        // Simulate TypeORM mutating the entity in-place with generated id + timestamps
        obj.id = fakeOrderId;
        obj.createdAt = fakeCreatedAt;
        return Promise.resolve(obj);
      }
      return Promise.resolve({ id: 'outbox-uuid-1' });
    }),
  };
  const mockDataSource = {
    transaction: jest.fn().mockImplementation((cb: any) => cb(em)),
  };
  const handler = new PlaceOrderHandler(mockDataSource as any, {} as any, {} as any, mockLogger as any);
  return { handler, em, fakeOrderId, fakeCreatedAt, mockDataSource };
}

describe('PlaceOrderHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should calculate totalAmount correctly (sum of qty * price)', async () => {
    const { handler } = makeHandler();
    const result = await handler.execute(new PlaceOrderCommand('user-1', items));
    // 2 * 10 + 1 * 25 = 45
    expect(result.totalAmount).toBe(45);
  });

  it('should return orderId, status PENDING, totalAmount and createdAt', async () => {
    const { handler, fakeOrderId } = makeHandler();
    const result = await handler.execute(new PlaceOrderCommand('user-1', items));

    expect(result.orderId).toBe(fakeOrderId);
    expect(result.status).toBe(OrderStatus.PENDING);
    expect(result.totalAmount).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('should run inside a transaction', async () => {
    const { handler, mockDataSource } = makeHandler();
    await handler.execute(new PlaceOrderCommand('user-1', items));
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('should create order with PENDING status and correct userId', async () => {
    const { handler, em } = makeHandler({ userId: 'user-2' });
    await handler.execute(new PlaceOrderCommand('user-2', items));

    const firstCreateCall = em.create.mock.calls[0];
    expect(firstCreateCall[1]).toMatchObject({
      userId: 'user-2',
      status: OrderStatus.PENDING,
    });
  });

  it('should create outbox row with eventType order.created and UNSENT status', async () => {
    const { handler, em } = makeHandler();
    await handler.execute(new PlaceOrderCommand('user-1', items));

    const outboxCreateCall = em.create.mock.calls[1];
    expect(outboxCreateCall[1]).toMatchObject({
      eventType: 'order.created',
      status: OutboxStatus.UNSENT,
      aggregateType: 'Order',
    });
  });

  it('should propagate transaction error', async () => {
    const { handler, mockDataSource } = makeHandler();
    mockDataSource.transaction.mockRejectedValue(new Error('DB connection failed'));

    await expect(handler.execute(new PlaceOrderCommand('user-1', items))).rejects.toThrow('DB connection failed');
  });

  it('should calculate zero totalAmount for empty items array', async () => {
    let callCount = 0;
    const em: any = {
      create: jest.fn().mockImplementation((_e: any, data: any) => data),
      save: jest.fn().mockImplementation((_entity: any, obj: any) => {
        callCount++;
        if (callCount === 1) {
          obj.id = 'order-uuid-empty';
          obj.createdAt = new Date();
          return Promise.resolve(obj);
        }
        return Promise.resolve({});
      }),
    };
    const mockDataSource = {
      transaction: jest.fn().mockImplementation((cb: any) => cb(em)),
    };
    const handler = new PlaceOrderHandler(mockDataSource as any, {} as any, {} as any, mockLogger as any);

    const result = await handler.execute(new PlaceOrderCommand('user-1', []));
    expect(result.totalAmount).toBe(0);
  });
});
