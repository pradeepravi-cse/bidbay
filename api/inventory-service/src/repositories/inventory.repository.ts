/**
 * InventoryRepository
 * ────────────────────
 * All DB access for the `inventory` table goes through here.
 * The SAGA consumer (order.created) uses EntityManager from the transaction,
 * NOT this repository — it needs full control over the lock and the em.
 */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';

@Injectable()
export class InventoryRepository {
  constructor(private readonly dataSource: DataSource) {}

  findBySku(sku: string): Promise<Inventory | null> {
    return this.dataSource.getRepository(Inventory).findOne({ where: { sku } });
  }

  async findAll(): Promise<{ data: Inventory[]; total: number }> {
    const data = await this.dataSource
      .getRepository(Inventory)
      .createQueryBuilder('inv')
      .orderBy('inv.sku', 'ASC')
      .getMany();

    return { data, total: data.length };
  }

  create(sku: string, availableQty: number): Promise<Inventory> {
    const repo = this.dataSource.getRepository(Inventory);
    const item = repo.create({ sku, availableQty, reservedQty: 0 });
    return repo.save(item);
  }

  save(item: Inventory): Promise<Inventory> {
    return this.dataSource.getRepository(Inventory).save(item);
  }
}
