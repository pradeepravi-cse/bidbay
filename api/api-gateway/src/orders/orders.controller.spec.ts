import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';

const mockOrdersService = {
  placeOrder: jest.fn(),
  getOrderById: jest.fn(),
  listOrdersByUser: jest.fn(),
};

function mockRequest(headers: Record<string, string> = {}) {
  return { headers } as any;
}

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockOrdersService }],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  describe('placeOrder', () => {
    it('should delegate to OrdersService.placeOrder with trace ID', async () => {
      const dto: PlaceOrderDto = { userId: 'user-1', items: [{ sku: 'SKU-1', quantity: 1, price: 5 }] };
      const result = { orderId: 'order-1', status: 'PENDING', totalAmount: 5, createdAt: new Date() };
      mockOrdersService.placeOrder.mockResolvedValue(result);

      const req = mockRequest({ 'x-trace-id': 'trace-123' });
      const response = await controller.placeOrder(dto, req);

      expect(response).toEqual(result);
      expect(mockOrdersService.placeOrder).toHaveBeenCalledWith(dto, 'trace-123');
    });

    it('should pass undefined trace when header absent', async () => {
      const dto: PlaceOrderDto = { userId: 'user-1', items: [] };
      mockOrdersService.placeOrder.mockResolvedValue({});

      await controller.placeOrder(dto, mockRequest({}));

      expect(mockOrdersService.placeOrder).toHaveBeenCalledWith(dto, undefined);
    });
  });

  describe('listOrdersByUser', () => {
    it('should delegate to OrdersService.listOrdersByUser', async () => {
      const query: ListOrdersQueryDto = { userId: 'user-1', page: 1, limit: 10 };
      const result = { data: [], total: 0 };
      mockOrdersService.listOrdersByUser.mockResolvedValue(result);

      const req = mockRequest({ 'x-trace-id': 'trace-456' });
      const response = await controller.listOrdersByUser(query, req);

      expect(response).toEqual(result);
      expect(mockOrdersService.listOrdersByUser).toHaveBeenCalledWith(query, 'trace-456');
    });
  });

  describe('getOrderById', () => {
    it('should delegate to OrdersService.getOrderById', async () => {
      const orderData = { id: 'order-1', status: 'CONFIRMED' };
      mockOrdersService.getOrderById.mockResolvedValue(orderData);

      const req = mockRequest({ 'x-trace-id': 'trace-789' });
      const response = await controller.getOrderById('order-1', req);

      expect(response).toEqual(orderData);
      expect(mockOrdersService.getOrderById).toHaveBeenCalledWith('order-1', 'trace-789');
    });
  });
});
