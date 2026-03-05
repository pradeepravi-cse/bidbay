import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetInventoryBySkuQuery } from '../get-inventory-by-sku.query';
import { InventoryRepository } from '../../repositories/inventory.repository';
import { Inventory } from '../../entities/inventory.entity';

@QueryHandler(GetInventoryBySkuQuery)
export class GetInventoryBySkuHandler implements IQueryHandler<GetInventoryBySkuQuery, Inventory | null> {
  constructor(private readonly inventoryRepo: InventoryRepository) {}

  execute(query: GetInventoryBySkuQuery): Promise<Inventory | null> {
    return this.inventoryRepo.findBySku(query.sku);
  }
}
