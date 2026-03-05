/**
 * REPOSITORY PATTERN (SOLID — S & D)
 * ────────────────────────────────────
 * Single Responsibility: this class ONLY knows how to persist/query Orders.
 * Dependency Inversion: handlers depend on this class (an abstraction over the
 * DB), not on TypeORM's EntityManager or Repository directly.
 *
 * Injecting DataSource (not a specific Repository) lets us run queries inside
 * an externally-managed transaction: the handler passes `em` (EntityManager)
 * from `dataSource.transaction(em => …)` for atomic writes; this repo handles
 * standalone reads.
 */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';

@Injectable()
export class OrderRepository {
  constructor(private readonly dataSource: DataSource) {}

  findById(id: string): Promise<Order | null> {
    return this.dataSource.getRepository(Order).findOne({ where: { id } });
  }

  async findByUser(
    userId: string,
    status?: OrderStatus,
    page = 1,
    limit = 10,
  ): Promise<{ data: Partial<Order>[]; total: number }> {
    const qb = this.dataSource
      .getRepository(Order)
      .createQueryBuilder('o')
      .where('o.userId = :userId', { userId })
      .orderBy('o.createdAt', 'DESC');

    if (status) qb.andWhere('o.status = :status', { status });

    const [orders, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Return summary shape (itemCount instead of full items array)
    const data = orders.map((o) => ({
      orderId:     o.id,
      status:      o.status,
      totalAmount: Number(o.totalAmount),
      itemCount:   o.items?.length ?? 0,
      createdAt:   o.createdAt,
    }));

    return { data, total };
  }
}
