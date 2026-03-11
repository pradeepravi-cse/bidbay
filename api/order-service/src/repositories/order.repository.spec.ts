import { OrderRepository } from './order.repository';
import { OrderStatus } from '../entities/order.entity';

describe('OrderRepository', () => {
  let repository: OrderRepository;
  let mockDataSource: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    const mockRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepo),
    };

    repository = new OrderRepository(mockDataSource);
  });

  describe('findById', () => {
    it('should find an order by id', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING };
      mockDataSource.getRepository().findOne.mockResolvedValue(order);

      const result = await repository.findById('order-1');

      expect(result).toEqual(order);
      expect(mockDataSource.getRepository().findOne).toHaveBeenCalledWith({ where: { id: 'order-1' } });
    });

    it('should return null when order not found', async () => {
      mockDataSource.getRepository().findOne.mockResolvedValue(null);

      const result = await repository.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return paginated summary with itemCount', async () => {
      const orders = [
        { id: 'order-1', status: OrderStatus.PENDING, totalAmount: '50.00', items: [{ sku: 'SKU-1' }, { sku: 'SKU-2' }], createdAt: new Date() },
      ];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([orders, 1]);

      const result = await repository.findByUser('user-1', undefined, 1, 10);

      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        orderId: 'order-1',
        status: OrderStatus.PENDING,
        itemCount: 2,
      });
    });

    it('should apply status filter when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findByUser('user-1', OrderStatus.CONFIRMED, 1, 10);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'o.status = :status',
        { status: OrderStatus.CONFIRMED },
      );
    });

    it('should not apply status filter when undefined', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findByUser('user-1', undefined, 1, 10);

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('should use correct skip/take for pagination', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findByUser('user-1', undefined, 3, 5);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10); // (3-1)*5
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
    });

    it('should handle items = undefined with itemCount = 0', async () => {
      const orders = [
        { id: 'order-2', status: OrderStatus.CANCELLED, totalAmount: '0', items: undefined, createdAt: new Date() },
      ];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([orders, 1]);

      const result = await repository.findByUser('user-1', undefined, 1, 10);

      expect(result.data[0]).toMatchObject({ itemCount: 0 });
    });
  });
});
