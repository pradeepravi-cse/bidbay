/**
 * HTTP Controller — Order Service
 * ────────────────────────────────
 * The controller is THIN by design (SOLID — S).
 * It only handles:
 *   1. HTTP concerns  (routing, status codes, DTO binding)
 *   2. Dispatching to CommandBus or QueryBus
 *
 * ALL business logic lives in command/query handlers.
 *
 * CQRS BUS USAGE
 * ──────────────
 * commandBus.execute(cmd)  → runs the matching @CommandHandler
 * queryBus.execute(query)  → runs the matching @QueryHandler
 *
 * The bus resolves the correct handler by matching the class constructor.
 * This is the Open/Closed principle in action: add a new command/query without
 * touching the controller or the bus — just register a new handler.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { PlaceOrderDto } from '../dto/place-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { PlaceOrderCommand } from '../commands/place-order.command';
import { GetOrderByIdQuery } from '../queries/get-order-by-id.query';
import { GetOrdersByUserQuery } from '../queries/get-orders-by-user.query';
import { Order } from '../entities/order.entity';

@Controller('orders')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AppController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * POST /api/orders → 202 Accepted
   *
   * Returns 202 (not 201) because the order is PENDING — the final outcome
   * (CONFIRMED or CANCELLED) is determined asynchronously by the SAGA.
   * The client should poll GET /api/orders/:orderId to observe the transition.
   */
  @Post()
  @HttpCode(202)
  placeOrder(@Body() dto: PlaceOrderDto) {
    return this.commandBus.execute(
      new PlaceOrderCommand(dto.userId, dto.items),
    );
  }

  /** GET /api/orders/:orderId → 200 | 404 */
  @Get(':orderId')
  async getOrderById(@Param('orderId') orderId: string) {
    const order: Order | null = await this.queryBus.execute(
      new GetOrderByIdQuery(orderId),
    );
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    return order;
  }

  /** GET /api/orders?userId=&status=&page=&limit= → 200 */
  @Get()
  listOrdersByUser(@Query() query: ListOrdersQueryDto) {
    return this.queryBus.execute(
      new GetOrdersByUserQuery(
        query.userId,
        query.status,
        query.page,
        query.limit,
      ),
    );
  }
}
