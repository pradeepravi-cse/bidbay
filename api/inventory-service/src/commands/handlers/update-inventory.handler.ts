/**
 * UpdateInventoryHandler
 * ───────────────────────
 * Updates availableQty for an existing SKU (restock).
 * Does NOT touch reservedQty — that is managed exclusively by the SAGA
 * consumer (order.created event).
 */
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { UpdateInventoryCommand } from '../update-inventory.command';
import { InventoryRepository } from '../../repositories/inventory.repository';
import { AppLogger } from '@bidbay/logger';

const CTX = { service: 'InventoryService', location: 'UpdateInventoryHandler' };

@CommandHandler(UpdateInventoryCommand)
export class UpdateInventoryHandler implements ICommandHandler<UpdateInventoryCommand> {
  constructor(
    private readonly inventoryRepo: InventoryRepository,
    private readonly logger: AppLogger,
  ) {}

  async execute(command: UpdateInventoryCommand) {
    this.logger.logOperationStart('UpdateInventory', { sku: command.sku, availableQty: command.availableQty }, CTX);

    try {
      const item = await this.inventoryRepo.findBySku(command.sku);
      if (!item) throw new NotFoundException(`SKU ${command.sku} not found`);

      item.availableQty = command.availableQty;
      const result = await this.inventoryRepo.save(item);
      this.logger.logOperationSuccess('UpdateInventory', { sku: result.sku, availableQty: result.availableQty }, CTX);
      return result;
    } catch (err) {
      this.logger.logOperationError('UpdateInventory', err, CTX);
      throw err;
    }
  }
}
