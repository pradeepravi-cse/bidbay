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

@CommandHandler(UpdateInventoryCommand)
export class UpdateInventoryHandler implements ICommandHandler<UpdateInventoryCommand> {
  constructor(private readonly inventoryRepo: InventoryRepository) {}

  async execute(command: UpdateInventoryCommand) {
    const item = await this.inventoryRepo.findBySku(command.sku);
    if (!item) throw new NotFoundException(`SKU ${command.sku} not found`);

    item.availableQty = command.availableQty;
    return this.inventoryRepo.save(item);
  }
}
