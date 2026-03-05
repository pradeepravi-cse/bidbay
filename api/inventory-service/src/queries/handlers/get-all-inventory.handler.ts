import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetAllInventoryQuery } from '../get-all-inventory.query';
import { InventoryRepository } from '../../repositories/inventory.repository';

@QueryHandler(GetAllInventoryQuery)
export class GetAllInventoryHandler implements IQueryHandler<GetAllInventoryQuery> {
  constructor(private readonly inventoryRepo: InventoryRepository) {}

  execute(_query: GetAllInventoryQuery) {
    return this.inventoryRepo.findAll();
  }
}
