import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AppController } from './app.controller';
import { CreateInventoryCommand } from '../commands/create-inventory.command';
import { UpdateInventoryCommand } from '../commands/update-inventory.command';
import { GetAllInventoryQuery } from '../queries/get-all-inventory.query';
import { GetInventoryBySkuQuery } from '../queries/get-inventory-by-sku.query';
import { CreateInventoryDto } from '../dto/create-inventory.dto';
import { UpdateInventoryDto } from '../dto/update-inventory.dto';

describe('AppController (Inventory Service)', () => {
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

  describe('createInventory', () => {
    it('should execute CreateInventoryCommand and return created item', async () => {
      const dto: CreateInventoryDto = { sku: 'SKU-001', availableQty: 100 };
      const created = { id: 'inv-1', sku: 'SKU-001', availableQty: 100, reservedQty: 0 };
      commandBus.execute.mockResolvedValue(created);

      const result = await controller.createInventory(dto);

      expect(result).toEqual(created);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new CreateInventoryCommand('SKU-001', 100),
      );
    });
  });

  describe('restockInventory', () => {
    it('should execute UpdateInventoryCommand and return updated item', async () => {
      const dto: UpdateInventoryDto = { availableQty: 200 };
      const updated = { id: 'inv-1', sku: 'SKU-001', availableQty: 200 };
      commandBus.execute.mockResolvedValue(updated);

      const result = await controller.restockInventory('SKU-001', dto);

      expect(result).toEqual(updated);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new UpdateInventoryCommand('SKU-001', 200),
      );
    });
  });

  describe('listAllInventory', () => {
    it('should execute GetAllInventoryQuery and return list', async () => {
      const expected = { data: [{ sku: 'SKU-001' }], total: 1 };
      queryBus.execute.mockResolvedValue(expected);

      const result = await controller.listAllInventory();

      expect(result).toEqual(expected);
      expect(queryBus.execute).toHaveBeenCalledWith(new GetAllInventoryQuery());
    });
  });

  describe('getInventoryBySku', () => {
    it('should return inventory when SKU exists', async () => {
      const item = { id: 'inv-1', sku: 'SKU-001', availableQty: 100 };
      queryBus.execute.mockResolvedValue(item);

      const result = await controller.getInventoryBySku('SKU-001');

      expect(result).toEqual(item);
      expect(queryBus.execute).toHaveBeenCalledWith(new GetInventoryBySkuQuery('SKU-001'));
    });

    it('should throw NotFoundException when SKU not found', async () => {
      queryBus.execute.mockResolvedValue(null);

      await expect(controller.getInventoryBySku('MISSING')).rejects.toThrow(NotFoundException);
    });
  });
});
