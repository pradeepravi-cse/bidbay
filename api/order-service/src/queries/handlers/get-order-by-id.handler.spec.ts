import { GetOrderByIdHandler } from './get-order-by-id.handler';
import { GetOrderByIdQuery } from '../get-order-by-id.query';
import { OrderStatus } from '../../entities/order.entity';

describe('GetOrderByIdHandler', () => {
  let handler: GetOrderByIdHandler;
  let mockOrderRepo: any;

  beforeEach(() => {
    mockOrderRepo = { findById: jest.fn() };
    handler = new GetOrderByIdHandler(mockOrderRepo);
  });

  it('should return an order when found', async () => {
    const order = { id: 'order-1', status: OrderStatus.CONFIRMED, userId: 'user-1' };
    mockOrderRepo.findById.mockResolvedValue(order);

    const result = await handler.execute(new GetOrderByIdQuery('order-1'));

    expect(result).toEqual(order);
    expect(mockOrderRepo.findById).toHaveBeenCalledWith('order-1');
  });

  it('should return null when order is not found', async () => {
    mockOrderRepo.findById.mockResolvedValue(null);

    const result = await handler.execute(new GetOrderByIdQuery('missing-id'));

    expect(result).toBeNull();
  });
});
