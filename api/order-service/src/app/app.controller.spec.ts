import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AppController } from './app.controller';
import { PlaceOrderCommand } from '../commands/place-order.command';
import { GetOrderByIdQuery } from '../queries/get-order-by-id.query';
import { GetOrdersByUserQuery } from '../queries/get-orders-by-user.query';
import { OrderStatus } from '../entities/order.entity';
import { PlaceOrderDto } from '../dto/place-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';

describe('AppController (Order Service)', () => {
  let controller: AppController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: CommandBus, useValue: { execute: jest.fn() } },
        { provide: QueryBus, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    commandBus = module.get(CommandBus);
    queryBus = module.get(QueryBus);
  });

  describe('placeOrder', () => {
    it('should execute PlaceOrderCommand and return result', async () => {
      const dto: PlaceOrderDto = {
        userId: 'user-uuid-1',
        items: [{ sku: 'SKU-001', quantity: 2, price: 15 }],
      };
      const expected = {
        orderId: 'order-1',
        status: OrderStatus.PENDING,
        totalAmount: 30,
        createdAt: new Date(),
      };
      commandBus.execute.mockResolvedValue(expected);

      const result = await controller.placeOrder(dto);

      expect(result).toEqual(expected);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new PlaceOrderCommand('user-uuid-1', dto.items),
      );
    });
  });

  describe('getOrderById', () => {
    it('should return order when found', async () => {
      const order = { id: 'order-1', status: OrderStatus.CONFIRMED };
      queryBus.execute.mockResolvedValue(order);

      const result = await controller.getOrderById('order-1');

      expect(result).toEqual(order);
      expect(queryBus.execute).toHaveBeenCalledWith(new GetOrderByIdQuery('order-1'));
    });

    it('should throw NotFoundException when order not found', async () => {
      queryBus.execute.mockResolvedValue(null);

      await expect(controller.getOrderById('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listOrdersByUser', () => {
    it('should execute GetOrdersByUserQuery with correct params', async () => {
      const query: ListOrdersQueryDto = { userId: 'user-1', page: 2, limit: 5 };
      const expected = { data: [], total: 0 };
      queryBus.execute.mockResolvedValue(expected);

      const result = await controller.listOrdersByUser(query);

      expect(result).toEqual(expected);
      expect(queryBus.execute).toHaveBeenCalledWith(
        new GetOrdersByUserQuery('user-1', undefined, 2, 5),
      );
    });

    it('should pass status filter when provided', async () => {
      const query: ListOrdersQueryDto = { userId: 'user-1', status: OrderStatus.CANCELLED, page: 1, limit: 10 };
      queryBus.execute.mockResolvedValue({ data: [], total: 0 });

      await controller.listOrdersByUser(query);

      expect(queryBus.execute).toHaveBeenCalledWith(
        new GetOrdersByUserQuery('user-1', OrderStatus.CANCELLED, 1, 10),
      );
    });
  });
});
