/**
 * HTTP Controller — Inventory Service
 * ─────────────────────────────────────
 * Thin controller — dispatches to CQRS bus only.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { CreateInventoryDto } from '../dto/create-inventory.dto';
import { UpdateInventoryDto } from '../dto/update-inventory.dto';
import { CreateInventoryCommand } from '../commands/create-inventory.command';
import { UpdateInventoryCommand } from '../commands/update-inventory.command';
import { GetAllInventoryQuery } from '../queries/get-all-inventory.query';
import { GetInventoryBySkuQuery } from '../queries/get-inventory-by-sku.query';
import { Inventory } from '../entities/inventory.entity';

@Controller('inventory')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AppController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** POST /api/inventory → 201 Created */
  @Post()
  @HttpCode(201)
  createInventory(@Body() dto: CreateInventoryDto) {
    return this.commandBus.execute(
      new CreateInventoryCommand(dto.sku, dto.availableQty),
    );
  }

  /** PATCH /api/inventory/:sku → 200 Updated */
  @Patch(':sku')
  restockInventory(@Param('sku') sku: string, @Body() dto: UpdateInventoryDto) {
    return this.commandBus.execute(
      new UpdateInventoryCommand(sku, dto.availableQty),
    );
  }

  /** GET /api/inventory → 200 */
  @Get()
  listAllInventory() {
    return this.queryBus.execute(new GetAllInventoryQuery());
  }

  /** GET /api/inventory/:sku → 200 | 404 */
  @Get(':sku')
  async getInventoryBySku(@Param('sku') sku: string) {
    const item: Inventory | null = await this.queryBus.execute(
      new GetInventoryBySkuQuery(sku),
    );
    if (!item) throw new NotFoundException(`SKU ${sku} not found`);
    return item;
  }
}
