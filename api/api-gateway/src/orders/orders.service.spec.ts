import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';

import { OrdersService } from './orders.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { TRACE_ID_HEADER } from '@bidbay/logger';

const mockHttpService = {
  post: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
};

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: {} as any };
}

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('placeOrder', () => {
    const dto: PlaceOrderDto = {
      userId: 'user-uuid-1',
      items: [{ sku: 'SKU-001', quantity: 2, price: 10 }],
    };

    it('should forward POST and return response data', async () => {
      const responseData = { orderId: 'order-1', status: 'PENDING', totalAmount: 20 };
      mockHttpService.post.mockReturnValue(of(axiosResponse(responseData, 202)));

      const result = await service.placeOrder(dto);

      expect(result).toEqual(responseData);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders'),
        dto,
        expect.objectContaining({ headers: {} }),
      );
    });

    it('should forward trace ID header when provided', async () => {
      mockHttpService.post.mockReturnValue(of(axiosResponse({}, 202)));

      await service.placeOrder(dto, 'trace-abc');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        dto,
        expect.objectContaining({ headers: { [TRACE_ID_HEADER]: 'trace-abc' } }),
      );
    });

    it('should not include trace ID header when traceId is undefined', async () => {
      mockHttpService.post.mockReturnValue(of(axiosResponse({}, 202)));

      await service.placeOrder(dto, undefined);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        dto,
        expect.objectContaining({ headers: {} }),
      );
    });

    it('should throw HttpException with upstream status on error', async () => {
      const axiosErr = new AxiosError('Not Found');
      axiosErr.response = { status: 404, data: { message: 'Order not found' } } as any;
      mockHttpService.post.mockReturnValue(throwError(() => axiosErr));

      await expect(service.placeOrder(dto)).rejects.toThrow(HttpException);
      await expect(service.placeOrder(dto)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('should throw 500 HttpException when upstream has no response', async () => {
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Network error')));

      await expect(service.placeOrder(dto)).rejects.toThrow(HttpException);
    });
  });

  describe('getOrderById', () => {
    it('should forward GET /api/orders/:orderId and return data', async () => {
      const orderData = { id: 'order-1', status: 'CONFIRMED' };
      mockHttpService.get.mockReturnValue(of(axiosResponse(orderData)));

      const result = await service.getOrderById('order-1', 'trace-1');

      expect(result).toEqual(orderData);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders/order-1'),
        expect.objectContaining({ headers: { [TRACE_ID_HEADER]: 'trace-1' } }),
      );
    });

    it('should propagate 404 from upstream as HttpException', async () => {
      const axiosErr = new AxiosError('Not Found');
      axiosErr.response = { status: 404, data: { message: 'Order not found' } } as any;
      mockHttpService.get.mockReturnValue(throwError(() => axiosErr));

      await expect(service.getOrderById('missing-id')).rejects.toThrow(HttpException);
    });
  });

  describe('listOrdersByUser', () => {
    it('should forward GET /api/orders with query params', async () => {
      const query: ListOrdersQueryDto = { userId: 'user-1', page: 1, limit: 10 };
      const responseData = { data: [], total: 0 };
      mockHttpService.get.mockReturnValue(of(axiosResponse(responseData)));

      const result = await service.listOrdersByUser(query, 'trace-2');

      expect(result).toEqual(responseData);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/orders'),
        expect.objectContaining({
          params: query,
          headers: { [TRACE_ID_HEADER]: 'trace-2' },
        }),
      );
    });

    it('should throw HttpException on upstream error', async () => {
      const axiosErr = new AxiosError('Service Unavailable');
      axiosErr.response = { status: 503, data: { message: 'Down' } } as any;
      mockHttpService.get.mockReturnValue(throwError(() => axiosErr));

      await expect(service.listOrdersByUser({ userId: 'user-1', page: 1, limit: 10 })).rejects.toThrow(HttpException);
    });
  });
});
