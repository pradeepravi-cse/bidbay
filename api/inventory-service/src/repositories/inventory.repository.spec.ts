import { InventoryRepository } from './inventory.repository';

describe('InventoryRepository', () => {
  let repository: InventoryRepository;
  let mockDataSource: any;
  let mockQueryBuilder: any;
  let mockRepo: any;

  beforeEach(() => {
    mockQueryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    mockRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepo),
    };

    repository = new InventoryRepository(mockDataSource);
  });

  describe('findBySku', () => {
    it('should find inventory by SKU', async () => {
      const item = { id: 'inv-1', sku: 'SKU-001', availableQty: 100 };
      mockRepo.findOne.mockResolvedValue(item);

      const result = await repository.findBySku('SKU-001');

      expect(result).toEqual(item);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { sku: 'SKU-001' } });
    });

    it('should return null when SKU not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await repository.findBySku('MISSING');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all items ordered by SKU with total count', async () => {
      const items = [
        { id: 'inv-1', sku: 'SKU-001', availableQty: 100 },
        { id: 'inv-2', sku: 'SKU-002', availableQty: 50 },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(items);

      const result = await repository.findAll();

      expect(result.data).toEqual(items);
      expect(result.total).toBe(2);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('inv.sku', 'ASC');
    });

    it('should return empty list when no inventory exists', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('create', () => {
    it('should create and save a new inventory item', async () => {
      const item = { id: 'inv-new', sku: 'SKU-NEW', availableQty: 10, reservedQty: 0 };
      mockRepo.create.mockReturnValue(item);
      mockRepo.save.mockResolvedValue(item);

      const result = await repository.create('SKU-NEW', 10);

      expect(result).toEqual(item);
      expect(mockRepo.create).toHaveBeenCalledWith({ sku: 'SKU-NEW', availableQty: 10, reservedQty: 0 });
      expect(mockRepo.save).toHaveBeenCalledWith(item);
    });
  });

  describe('save', () => {
    it('should save and return updated inventory item', async () => {
      const item: any = { id: 'inv-1', sku: 'SKU-001', availableQty: 200 };
      mockRepo.save.mockResolvedValue(item);

      const result = await repository.save(item);

      expect(result).toEqual(item);
      expect(mockRepo.save).toHaveBeenCalledWith(item);
    });
  });
});
