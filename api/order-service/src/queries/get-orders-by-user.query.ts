import { OrderStatus } from '../entities/order.entity';

export class GetOrdersByUserQuery {
  constructor(
    public readonly userId: string,
    public readonly status?: OrderStatus,
    public readonly page: number = 1,
    public readonly limit: number = 10,
  ) {}
}
