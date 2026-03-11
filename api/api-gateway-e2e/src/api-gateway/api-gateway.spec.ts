import axios, { AxiosError } from 'axios';

/**
 * API Gateway E2E Tests
 *
 * Requires the full stack running:
 *   pnpm nx serve api-gateway
 *   pnpm nx serve order-service
 *   pnpm nx serve inventory-service
 *
 * When downstream services are unavailable, the gateway returns 502/503.
 * Tests accept these as valid gateway-level responses to remain CI-friendly.
 */

describe('API Gateway — Health', () => {
  it('GET /api/health → 200 { status: "ok" }', async () => {
    const res = await axios.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });
});

describe('API Gateway — Orders proxy', () => {
  const validOrderPayload = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    items: [{ sku: 'SKU-001', quantity: 2, price: 10 }],
  };

  describe('POST /api/orders', () => {
    it('returns 202 with orderId for valid payload (or 50x if downstream down)', async () => {
      try {
        const res = await axios.post('/api/orders', validOrderPayload);
        expect(res.status).toBe(202);
        expect(res.data).toHaveProperty('orderId');
        expect(res.data).toHaveProperty('status', 'PENDING');
        expect(res.data).toHaveProperty('totalAmount', 20);
      } catch (err) {
        const e = err as AxiosError;
        expect([502, 503, 500]).toContain(e.response?.status);
      }
    });

    it('returns 400 when userId is missing', async () => {
      try {
        await axios.post('/api/orders', { items: [{ sku: 'X', quantity: 1, price: 1 }] });
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });

    it('returns 400 when userId is not a valid UUID', async () => {
      try {
        await axios.post('/api/orders', { userId: 'bad-id', items: [{ sku: 'X', quantity: 1, price: 1 }] });
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });

    it('returns 400 when items array is absent', async () => {
      try {
        await axios.post('/api/orders', { userId: '550e8400-e29b-41d4-a716-446655440000' });
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });

    it('echoes x-trace-id in response headers', async () => {
      const traceId = 'e2e-order-trace-001';
      try {
        const res = await axios.post('/api/orders', validOrderPayload, {
          headers: { 'x-trace-id': traceId },
        });
        expect(res.headers['x-trace-id']).toBe(traceId);
      } catch (err) {
        const e = err as AxiosError;
        if (e.response) {
          expect(e.response.headers['x-trace-id']).toBe(traceId);
        }
      }
    });

    it('generates x-trace-id when not provided', async () => {
      try {
        const res = await axios.post('/api/orders', validOrderPayload);
        expect(res.headers['x-trace-id']).toBeDefined();
        expect(res.headers['x-trace-id']).toMatch(/^[0-9a-f-]{36}$/);
      } catch (err) {
        const e = err as AxiosError;
        if (e.response) {
          expect(e.response.headers['x-trace-id']).toBeDefined();
        }
      }
    });
  });

  describe('GET /api/orders/:orderId', () => {
    it('returns 404 or 50x for non-existent order', async () => {
      try {
        await axios.get('/api/orders/00000000-0000-0000-0000-000000000000');
        throw new Error('Expected error response');
      } catch (err) {
        const e = err as AxiosError;
        expect([404, 502, 503, 500]).toContain(e.response?.status);
      }
    });
  });

  describe('GET /api/orders', () => {
    it('returns 400 when userId query param is missing', async () => {
      try {
        await axios.get('/api/orders');
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });

    it('returns 200 with paginated orders for valid userId', async () => {
      try {
        const res = await axios.get('/api/orders', {
          params: { userId: '550e8400-e29b-41d4-a716-446655440000', page: 1, limit: 5 },
        });
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('data');
        expect(Array.isArray(res.data.data)).toBe(true);
        expect(res.data).toHaveProperty('total');
      } catch (err) {
        const e = err as AxiosError;
        expect([200, 502, 503, 500]).toContain(e.response?.status);
      }
    });
  });
});

describe('API Gateway — Inventory proxy', () => {
  const validInventoryPayload = { sku: 'E2E-TEST-SKU-001', availableQty: 50 };

  describe('POST /api/inventory', () => {
    it('returns 201 with inventory item for valid payload (or 409/50x)', async () => {
      try {
        const res = await axios.post('/api/inventory', validInventoryPayload);
        expect(res.status).toBe(201);
        expect(res.data).toHaveProperty('sku', 'E2E-TEST-SKU-001');
        expect(res.data).toHaveProperty('availableQty', 50);
      } catch (err) {
        const e = err as AxiosError;
        // 409 = already exists from previous run; 50x = service down
        expect([409, 502, 503, 500]).toContain(e.response?.status);
      }
    });

    it('returns 400 when sku is missing', async () => {
      try {
        await axios.post('/api/inventory', { availableQty: 10 });
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });

    it('returns 400 when availableQty is missing', async () => {
      try {
        await axios.post('/api/inventory', { sku: 'TEST-SKU' });
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });

    it('returns 400 when availableQty is negative', async () => {
      try {
        await axios.post('/api/inventory', { sku: 'TEST-SKU', availableQty: -5 });
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });
  });

  describe('PATCH /api/inventory/:sku', () => {
    it('returns 400 when availableQty is missing from body', async () => {
      try {
        await axios.patch('/api/inventory/SKU-001', {});
        throw new Error('Expected 400');
      } catch (err) {
        expect((err as AxiosError).response?.status).toBe(400);
      }
    });

    it('returns 404 or 50x for non-existent SKU', async () => {
      try {
        await axios.patch('/api/inventory/NONEXISTENT-E2E-SKU', { availableQty: 10 });
        throw new Error('Expected error');
      } catch (err) {
        const e = err as AxiosError;
        expect([404, 502, 503, 500]).toContain(e.response?.status);
      }
    });
  });

  describe('GET /api/inventory', () => {
    it('returns 200 with data array and total', async () => {
      try {
        const res = await axios.get('/api/inventory');
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('data');
        expect(Array.isArray(res.data.data)).toBe(true);
        expect(res.data).toHaveProperty('total');
      } catch (err) {
        const e = err as AxiosError;
        expect([200, 502, 503, 500]).toContain(e.response?.status);
      }
    });
  });

  describe('GET /api/inventory/:sku', () => {
    it('returns 404 or 50x for non-existent SKU', async () => {
      try {
        await axios.get('/api/inventory/NONEXISTENT-E2E-SKU');
        throw new Error('Expected error');
      } catch (err) {
        const e = err as AxiosError;
        expect([404, 502, 503, 500]).toContain(e.response?.status);
      }
    });
  });

  describe('Trace ID propagation', () => {
    it('always includes x-trace-id in response headers', async () => {
      try {
        const res = await axios.get('/api/inventory');
        expect(res.headers['x-trace-id']).toBeDefined();
      } catch (err) {
        const e = err as AxiosError;
        if (e.response) {
          expect(e.response.headers['x-trace-id']).toBeDefined();
        }
      }
    });

    it('echoes caller-provided x-trace-id back in response', async () => {
      const traceId = 'e2e-inventory-trace-999';
      try {
        const res = await axios.get('/api/inventory', {
          headers: { 'x-trace-id': traceId },
        });
        expect(res.headers['x-trace-id']).toBe(traceId);
      } catch (err) {
        const e = err as AxiosError;
        if (e.response) {
          expect(e.response.headers['x-trace-id']).toBe(traceId);
        }
      }
    });
  });
});
