import {
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { TRACE_ID_HEADER } from '../utils/traceContext';

@Injectable()
export class OrdersService {
  private readonly baseUrl =
    process.env.ORDER_SERVICE_URL ?? 'http://localhost:3001';

  constructor(private readonly http: HttpService) {}

  async placeOrder(dto: PlaceOrderDto, traceId?: string) {
    return this.forward(() =>
      this.http.post(`${this.baseUrl}/api/orders`, dto, {
        headers: this.headers(traceId),
      }),
    );
  }

  async getOrderById(orderId: string, traceId?: string) {
    return this.forward(() =>
      this.http.get(`${this.baseUrl}/api/orders/${orderId}`, {
        headers: this.headers(traceId),
      }),
    );
  }

  async listOrdersByUser(query: ListOrdersQueryDto, traceId?: string) {
    return this.forward(() =>
      this.http.get(`${this.baseUrl}/api/orders`, {
        params: query,
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
