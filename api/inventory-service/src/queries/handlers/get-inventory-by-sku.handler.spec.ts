import { GetInventoryBySkuHandler } from './get-inventory-by-sku.handler';
import { GetInventoryBySkuQuery } from '../get-inventory-by-sku.query';

describe('GetInventoryBySkuHandler', () => {
  let handler: GetInventoryBySkuHandler;
  let mockInventoryRepo: any;

  beforeEach(() => {
    mockInventoryRepo = { findBySku: jest.fn() };
    handler = new GetInventoryBySkuHandler(mockInventoryRepo);
  });

  it('should return inventory item when SKU exists', async () => {
    const item = { id: 'inv-1', sku: 'SKU-001', availableQty: 100, reservedQty: 5 };
    mockInventoryRepo.findBySku.mockResolvedValue(item);

    const result = await handler.execute(new GetInventoryBySkuQuery('SKU-001'));

    expect(result).toEqual(item);
    expect(mockInventoryRepo.findBySku).toHaveBeenCalledWith('SKU-001');
  });

  it('should return null when SKU does not exist', async () => {
    mockInventoryRepo.findBySku.mockResolvedValue(null);

    const result = await handler.execute(new GetInventoryBySkuQuery('MISSING-SKU'));

    expect(result).toBeNull();
  });
});
