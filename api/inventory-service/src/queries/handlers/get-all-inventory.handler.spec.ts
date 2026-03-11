import { GetAllInventoryHandler } from './get-all-inventory.handler';
import { GetAllInventoryQuery } from '../get-all-inventory.query';

describe('GetAllInventoryHandler', () => {
  let handler: GetAllInventoryHandler;
  let mockInventoryRepo: any;

  beforeEach(() => {
    mockInventoryRepo = { findAll: jest.fn() };
    handler = new GetAllInventoryHandler(mockInventoryRepo);
  });

  it('should return all inventory items', async () => {
    const items = [
      { id: 'inv-1', sku: 'SKU-001', availableQty: 100 },
      { id: 'inv-2', sku: 'SKU-002', availableQty: 50 },
    ];
    mockInventoryRepo.findAll.mockResolvedValue({ data: items, total: 2 });

    const result = await handler.execute(new GetAllInventoryQuery());

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockInventoryRepo.findAll).toHaveBeenCalled();
  });

  it('should return empty list when no inventory exists', async () => {
    mockInventoryRepo.findAll.mockResolvedValue({ data: [], total: 0 });

    const result = await handler.execute(new GetAllInventoryQuery());

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
