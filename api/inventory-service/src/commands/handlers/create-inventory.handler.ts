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
import { AppLogger } from '@bidbay/logger';

const CTX = { service: 'InventoryService', location: 'CreateInventoryHandler' };

@CommandHandler(CreateInventoryCommand)
export class CreateInventoryHandler implements ICommandHandler<CreateInventoryCommand> {
  constructor(
    private readonly inventoryRepo: InventoryRepository,
    private readonly logger: AppLogger,
  ) {}

  async execute(command: CreateInventoryCommand) {
    this.logger.logOperationStart('CreateInventory', { sku: command.sku, availableQty: command.availableQty }, CTX);

    try {
      const existing = await this.inventoryRepo.findBySku(command.sku);
      if (existing) {
        throw new ConflictException(`SKU ${command.sku} already exists`);
      }
      const result = await this.inventoryRepo.create(command.sku, command.availableQty);
      this.logger.logOperationSuccess('CreateInventory', { sku: result.sku, id: result.id }, CTX);
      return result;
    } catch (err) {
      this.logger.logOperationError('CreateInventory', err, CTX);
      throw err;
    }
  }
}
