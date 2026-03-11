import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  HttpCode,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { readTraceIdFromHeaders } from '@bidbay/logger';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(201)
  createInventory(@Body() dto: CreateInventoryDto, @Req() req: Request) {
    const traceId = readTraceIdFromHeaders(req.headers);
    return this.inventoryService.createInventory(dto, traceId);
  }

  @Patch(':sku')
  restockInventory(
    @Param('sku') sku: string,
    @Body() dto: UpdateInventoryDto,
    @Req() req: Request,
  ) {
    const traceId = readTraceIdFromHeaders(req.headers);
    return this.inventoryService.restockInventory(sku, dto, traceId);
  }

  @Get()
  listAllInventory(@Req() req: Request) {
    const traceId = readTraceIdFromHeaders(req.headers);
    return this.inventoryService.listAllInventory(traceId);
  }

  @Get(':sku')
  getInventoryBySku(@Param('sku') sku: string, @Req() req: Request) {
    const traceId = readTraceIdFromHeaders(req.headers);
    return this.inventoryService.getInventoryBySku(sku, traceId);
  }
}
