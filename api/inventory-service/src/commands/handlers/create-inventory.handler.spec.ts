import { ConflictException } from '@nestjs/common';
import { CreateInventoryHandler } from './create-inventory.handler';
import { CreateInventoryCommand } from '../create-inventory.command';

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

describe('CreateInventoryHandler', () => {
  let handler: CreateInventoryHandler;
  let mockInventoryRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInventoryRepo = {
      findBySku: jest.fn(),
      create: jest.fn(),
    };
    handler = new CreateInventoryHandler(mockInventoryRepo, mockLogger as any);
  });

  it('should create inventory when SKU does not exist', async () => {
    const created = { id: 'inv-1', sku: 'SKU-001', availableQty: 100, reservedQty: 0 };
    mockInventoryRepo.findBySku.mockResolvedValue(null);
    mockInventoryRepo.create.mockResolvedValue(created);

    const result = await handler.execute(new CreateInventoryCommand('SKU-001', 100));

    expect(result).toEqual(created);
    expect(mockInventoryRepo.create).toHaveBeenCalledWith('SKU-001', 100);
  });

  it('should throw ConflictException when SKU already exists', async () => {
    mockInventoryRepo.findBySku.mockResolvedValue({ id: 'inv-existing', sku: 'SKU-001' });

    await expect(
      handler.execute(new CreateInventoryCommand('SKU-001', 50)),
    ).rejects.toThrow(ConflictException);
  });

  it('should check SKU existence before creating', async () => {
    mockInventoryRepo.findBySku.mockResolvedValue(null);
    mockInventoryRepo.create.mockResolvedValue({});

    await handler.execute(new CreateInventoryCommand('SKU-NEW', 10));

    expect(mockInventoryRepo.findBySku).toHaveBeenCalledWith('SKU-NEW');
  });
});
