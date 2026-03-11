import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { OrdersService } from './orders.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { readTraceIdFromHeaders } from '@bidbay/logger';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(202)
  placeOrder(@Body() dto: PlaceOrderDto, @Req() req: Request) {
    const traceId = readTraceIdFromHeaders(req.headers);
    return this.ordersService.placeOrder(dto, traceId);
  }

  @Get()
  listOrdersByUser(@Query() query: ListOrdersQueryDto, @Req() req: Request) {
    const traceId = readTraceIdFromHeaders(req.headers);
    return this.ordersService.listOrdersByUser(query, traceId);
  }

  @Get(':orderId')
  getOrderById(@Param('orderId') orderId: string, @Req() req: Request) {
    const traceId = readTraceIdFromHeaders(req.headers);
    return this.ordersService.getOrderById(orderId, traceId);
  }
}
