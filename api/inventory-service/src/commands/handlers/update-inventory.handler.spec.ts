import { NotFoundException } from '@nestjs/common';
import { UpdateInventoryHandler } from './update-inventory.handler';
import { UpdateInventoryCommand } from '../update-inventory.command';

const mockLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logOperationStart: jest.fn(),
  logOperationSuccess: jest.fn(),
  logOperationError: jest.fn(),
};

describe('UpdateInventoryHandler', () => {
  let handler: UpdateInventoryHandler;
  let mockInventoryRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInventoryRepo = {
      findBySku: jest.fn(),
      save: jest.fn(),
    };
    handler = new UpdateInventoryHandler(mockInventoryRepo, mockLogger as any);
  });

  it('should update availableQty when SKU exists', async () => {
    const item = { id: 'inv-1', sku: 'SKU-001', availableQty: 50, reservedQty: 5 };
    const saved = { ...item, availableQty: 200 };
    mockInventoryRepo.findBySku.mockResolvedValue(item);
    mockInventoryRepo.save.mockResolvedValue(saved);

    const result = await handler.execute(new UpdateInventoryCommand('SKU-001', 200));

    expect(result).toEqual(saved);
    expect(item.availableQty).toBe(200);
    expect(mockInventoryRepo.save).toHaveBeenCalledWith(item);
  });

  it('should throw NotFoundException when SKU does not exist', async () => {
    mockInventoryRepo.findBySku.mockResolvedValue(null);

    await expect(
      handler.execute(new UpdateInventoryCommand('MISSING-SKU', 100)),
    ).rejects.toThrow(NotFoundException);
  });

  it('should not modify reservedQty', async () => {
    const item = { id: 'inv-1', sku: 'SKU-001', availableQty: 50, reservedQty: 10 };
    mockInventoryRepo.findBySku.mockResolvedValue(item);
    mockInventoryRepo.save.mockResolvedValue(item);

    await handler.execute(new UpdateInventoryCommand('SKU-001', 300));

    expect(item.reservedQty).toBe(10);
  });
});
