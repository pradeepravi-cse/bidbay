import {
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { TRACE_ID_HEADER } from '@bidbay/logger';

@Injectable()
export class InventoryService {
  private readonly baseUrl =
    process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:3002';

  constructor(private readonly http: HttpService) {}

  async createInventory(dto: CreateInventoryDto, traceId?: string) {
    return this.forward(() =>
      this.http.post(`${this.baseUrl}/api/inventory`, dto, {
        headers: this.headers(traceId),
      }),
    );
  }

  async restockInventory(
    sku: string,
    dto: UpdateInventoryDto,
    traceId?: string,
  ) {
    return this.forward(() =>
      this.http.patch(`${this.baseUrl}/api/inventory/${sku}`, dto, {
        headers: this.headers(traceId),
      }),
    );
  }

  async listAllInventory(traceId?: string) {
    return this.forward(() =>
      this.http.get(`${this.baseUrl}/api/inventory`, {
        headers: this.headers(traceId),
      }),
    );
  }

  async getInventoryBySku(sku: string, traceId?: string) {
    return this.forward(() =>
      this.http.get(`${this.baseUrl}/api/inventory/${sku}`, {
        headers: this.headers(traceId),
      }),
    );
  }

  private headers(traceId?: string): Record<string, string> {
    if (!traceId) return {};
    return { [TRACE_ID_HEADER]: traceId };
  }

  private async forward<T>(
    call: () => ReturnType<HttpService['get']>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(call());
      return response.data as T;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status =
        axiosErr.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      const data = axiosErr.response?.data ?? { message: 'Service unavailable' };
      throw new HttpException(data, status);
    }
  }
}
