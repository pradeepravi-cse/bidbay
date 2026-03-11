import { GetOrdersByUserHandler } from './get-orders-by-user.handler';
import { GetOrdersByUserQuery } from '../get-orders-by-user.query';
import { OrderStatus } from '../../entities/order.entity';

describe('GetOrdersByUserHandler', () => {
  let handler: GetOrdersByUserHandler;
  let mockOrderRepo: any;

  beforeEach(() => {
    mockOrderRepo = { findByUser: jest.fn() };
    handler = new GetOrdersByUserHandler(mockOrderRepo);
  });

  it('should return paginated orders for a user', async () => {
    const responseData = {
      data: [{ orderId: 'order-1', status: OrderStatus.PENDING, totalAmount: 100, itemCount: 2 }],
      total: 1,
    };
    mockOrderRepo.findByUser.mockResolvedValue(responseData);

    const result = await handler.execute(new GetOrdersByUserQuery('user-1', undefined, 1, 10));

    expect(result).toEqual(responseData);
    expect(mockOrderRepo.findByUser).toHaveBeenCalledWith('user-1', undefined, 1, 10);
  });

  it('should pass status filter to repository', async () => {
    mockOrderRepo.findByUser.mockResolvedValue({ data: [], total: 0 });

    await handler.execute(new GetOrdersByUserQuery('user-1', OrderStatus.CONFIRMED, 2, 5));

    expect(mockOrderRepo.findByUser).toHaveBeenCalledWith('user-1', OrderStatus.CONFIRMED, 2, 5);
  });

  it('should return empty data when no orders exist', async () => {
    mockOrderRepo.findByUser.mockResolvedValue({ data: [], total: 0 });

    const result = await handler.execute(new GetOrdersByUserQuery('user-1', undefined, 1, 10));

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
