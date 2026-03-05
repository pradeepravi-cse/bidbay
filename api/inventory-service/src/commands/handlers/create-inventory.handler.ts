/**
 * CreateInventoryHandler
 * ───────────────────────
 * Seeds a new SKU into the inventory table.
 * Returns 409 Conflict if the SKU already exists (enforced by the UNIQUE
 * constraint on inventory.sku).
 */
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConflictException } from '@nestjs/common';
import { CreateInventoryCommand } from '../create-inventory.command';
import { InventoryRepository } from '../../repositories/inventory.repository';

@CommandHandler(CreateInventoryCommand)
export class CreateInventoryHandler implements ICommandHandler<CreateInventoryCommand> {
  constructor(private readonly inventoryRepo: InventoryRepository) {}

  async execute(command: CreateInventoryCommand) {
    const existing = await this.inventoryRepo.findBySku(command.sku);
    if (existing) {
      throw new ConflictException(`SKU ${command.sku} already exists`);
    }
    return this.inventoryRepo.create(command.sku, command.availableQty);
  }
}
