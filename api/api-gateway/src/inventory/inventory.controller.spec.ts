import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

const mockInventoryService = {
  createInventory: jest.fn(),
  restockInventory: jest.fn(),
  listAllInventory: jest.fn(),
  getInventoryBySku: jest.fn(),
};

function mockRequest(headers: Record<string, string> = {}) {
  return { headers } as any;
}

describe('InventoryController', () => {
  let controller: InventoryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: mockInventoryService }],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  describe('createInventory', () => {
    it('should delegate to InventoryService.createInventory with trace ID', async () => {
      const dto: CreateInventoryDto = { sku: 'SKU-001', availableQty: 100 };
      const result = { id: 'inv-1', sku: 'SKU-001', availableQty: 100, reservedQty: 0 };
      mockInventoryService.createInventory.mockResolvedValue(result);

      const req = mockRequest({ 'x-trace-id': 'trace-111' });
      const response = await controller.createInventory(dto, req);

      expect(response).toEqual(result);
      expect(mockInventoryService.createInventory).toHaveBeenCalledWith(dto, 'trace-111');
    });

    it('should pass undefined trace when header absent', async () => {
      const dto: CreateInventoryDto = { sku: 'SKU-001', availableQty: 10 };
      mockInventoryService.createInventory.mockResolvedValue({});

      await controller.createInventory(dto, mockRequest({}));

      expect(mockInventoryService.createInventory).toHaveBeenCalledWith(dto, undefined);
    });
  });

  describe('restockInventory', () => {
    it('should delegate to InventoryService.restockInventory', async () => {
      const dto: UpdateInventoryDto = { availableQty: 200 };
      const updated = { id: 'inv-1', sku: 'SKU-001', availableQty: 200 };
      mockInventoryService.restockInventory.mockResolvedValue(updated);

      const req = mockRequest({ 'x-trace-id': 'trace-222' });
      const response = await controller.restockInventory('SKU-001', dto, req);

      expect(response).toEqual(updated);
      expect(mockInventoryService.restockInventory).toHaveBeenCalledWith('SKU-001', dto, 'trace-222');
    });
  });

  describe('listAllInventory', () => {
    it('should delegate to InventoryService.listAllInventory', async () => {
      const result = { data: [{ sku: 'SKU-001' }], total: 1 };
      mockInventoryService.listAllInventory.mockResolvedValue(result);

      const req = mockRequest({ 'x-trace-id': 'trace-333' });
      const response = await controller.listAllInventory(req);

      expect(response).toEqual(result);
      expect(mockInventoryService.listAllInventory).toHaveBeenCalledWith('trace-333');
    });
  });

  describe('getInventoryBySku', () => {
    it('should delegate to InventoryService.getInventoryBySku', async () => {
      const item = { id: 'inv-1', sku: 'SKU-001', availableQty: 100 };
      mockInventoryService.getInventoryBySku.mockResolvedValue(item);

      const req = mockRequest({ 'x-trace-id': 'trace-444' });
      const response = await controller.getInventoryBySku('SKU-001', req);

      expect(response).toEqual(item);
      expect(mockInventoryService.getInventoryBySku).toHaveBeenCalledWith('SKU-001', 'trace-444');
    });
  });
});
