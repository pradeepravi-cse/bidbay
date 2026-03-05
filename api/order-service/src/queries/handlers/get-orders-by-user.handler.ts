import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetOrdersByUserQuery } from '../get-orders-by-user.query';
import { OrderRepository } from '../../repositories/order.repository';

@QueryHandler(GetOrdersByUserQuery)
export class GetOrdersByUserHandler implements IQueryHandler<GetOrdersByUserQuery> {
  constructor(private readonly orderRepo: OrderRepository) {}

  execute(query: GetOrdersByUserQuery) {
    return this.orderRepo.findByUser(
      query.userId,
      query.status,
      query.page,
      query.limit,
    );
  }
}
