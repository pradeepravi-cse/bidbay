/**
 * CQRS — QUERY HANDLER
 * ─────────────────────
 * Pure read. No side-effects. No state mutation.
 * Returns null when not found; the controller decides the HTTP status.
 */
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetOrderByIdQuery } from '../get-order-by-id.query';
import { OrderRepository } from '../../repositories/order.repository';
import { Order } from '../../entities/order.entity';

@QueryHandler(GetOrderByIdQuery)
export class GetOrderByIdHandler implements IQueryHandler<GetOrderByIdQuery, Order | null> {
  constructor(private readonly orderRepo: OrderRepository) {}

  execute(query: GetOrderByIdQuery): Promise<Order | null> {
    return this.orderRepo.findById(query.orderId);
  }
}
