import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';

import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { TRACE_ID_HEADER } from '@bidbay/logger';

const mockHttpService = {
  post: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
};

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: {} as any };
}

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  describe('createInventory', () => {
    const dto: CreateInventoryDto = { sku: 'SKU-001', availableQty: 100 };

    it('should POST to inventory service and return data', async () => {
      const inventoryItem = { id: 'inv-1', sku: 'SKU-001', availableQty: 100, reservedQty: 0 };
      mockHttpService.post.mockReturnValue(of(axiosResponse(inventoryItem, 201)));

      const result = await service.createInventory(dto, 'trace-1');

      expect(result).toEqual(inventoryItem);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/inventory'),
        dto,
        expect.objectContaining({ headers: { [TRACE_ID_HEADER]: 'trace-1' } }),
      );
    });

    it('should throw HttpException on 409 conflict', async () => {
      const axiosErr = new AxiosError('Conflict');
      axiosErr.response = { status: 409, data: { message: 'SKU already exists' } } as any;
      mockHttpService.post.mockReturnValue(throwError(() => axiosErr));

      await expect(service.createInventory(dto)).rejects.toThrow(HttpException);
    });

    it('should use empty headers when traceId is undefined', async () => {
      mockHttpService.post.mockReturnValue(of(axiosResponse({}, 201)));

      await service.createInventory(dto, undefined);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        dto,
        expect.objectContaining({ headers: {} }),
      );
    });
  });

  describe('restockInventory', () => {
    const dto: UpdateInventoryDto = { availableQty: 50 };

    it('should PATCH inventory/:sku and return updated data', async () => {
      const updated = { id: 'inv-1', sku: 'SKU-001', availableQty: 50 };
      mockHttpService.patch.mockReturnValue(of(axiosResponse(updated)));

      const result = await service.restockInventory('SKU-001', dto, 'trace-2');

      expect(result).toEqual(updated);
      expect(mockHttpService.patch).toHaveBeenCalledWith(
        expect.stringContaining('/api/inventory/SKU-001'),
        dto,
        expect.objectContaining({ headers: { [TRACE_ID_HEADER]: 'trace-2' } }),
      );
    });

    it('should throw 404 HttpException when SKU not found', async () => {
      const axiosErr = new AxiosError('Not Found');
      axiosErr.response = { status: 404, data: { message: 'SKU not found' } } as any;
      mockHttpService.patch.mockReturnValue(throwError(() => axiosErr));

      await expect(service.restockInventory('UNKNOWN', dto)).rejects.toThrow(HttpException);
    });
  });

  describe('listAllInventory', () => {
    it('should GET /api/inventory and return data', async () => {
      const responseData = { data: [{ sku: 'SKU-001' }], total: 1 };
      mockHttpService.get.mockReturnValue(of(axiosResponse(responseData)));

      const result = await service.listAllInventory('trace-3');

      expect(result).toEqual(responseData);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/inventory'),
        expect.objectContaining({ headers: { [TRACE_ID_HEADER]: 'trace-3' } }),
      );
    });

    it('should throw HttpException on upstream failure', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Network error')));

      await expect(service.listAllInventory()).rejects.toThrow(HttpException);
    });
  });

  describe('getInventoryBySku', () => {
    it('should GET /api/inventory/:sku and return item', async () => {
      const item = { id: 'inv-1', sku: 'SKU-001', availableQty: 100 };
      mockHttpService.get.mockReturnValue(of(axiosResponse(item)));

      const result = await service.getInventoryBySku('SKU-001', 'trace-4');

      expect(result).toEqual(item);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/inventory/SKU-001'),
        expect.objectContaining({ headers: { [TRACE_ID_HEADER]: 'trace-4' } }),
      );
    });

    it('should throw 404 HttpException when SKU not found', async () => {
      const axiosErr = new AxiosError('Not Found');
      axiosErr.response = { status: 404, data: { message: 'SKU not found' } } as any;
      mockHttpService.get.mockReturnValue(throwError(() => axiosErr));

      await expect(service.getInventoryBySku('MISSING')).rejects.toThrow(HttpException);
    });
  });
});
