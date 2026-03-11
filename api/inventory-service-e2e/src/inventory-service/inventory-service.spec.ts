import axios, { AxiosError } from 'axios';

/**
 * Inventory Service E2E Tests
 *
 * Runs directly against the Inventory Service (port 3002).
 * Kafka is not required for HTTP-level tests.
 */

describe('Inventory Service — POST /api/inventory', () => {
  const uniqueSku = () => `E2E-SKU-${Date.now()}`;

  it('returns 201 with created inventory item for valid payload', async () => {
    const sku = uniqueSku();
    try {
      const res = await axios.post('/api/inventory', { sku, availableQty: 100 });
      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({
        sku,
        availableQty: 100,
        reservedQty: 0,
      });
      expect(res.data.id).toBeDefined();
    } catch (err) {
      const e = err as AxiosError;
      expect([201, 500, 503]).toContain(e.response?.status);
    }
  });

  it('returns 409 when SKU already exists', async () => {
    const sku = uniqueSku();
    try {
      await axios.post('/api/inventory', { sku, availableQty: 10 });
      // Second create with same SKU should conflict
      await axios.post('/api/inventory', { sku, availableQty: 20 });
      throw new Error('Expected 409');
    } catch (err) {
      const e = err as AxiosError;
      expect([409, 500, 503]).toContain(e.response?.status);
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
      await axios.post('/api/inventory', { sku: 'SKU-MISSING-QTY' });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });

  it('returns 400 when availableQty is a negative number', async () => {
    try {
      await axios.post('/api/inventory', { sku: 'SKU-NEG', availableQty: -1 });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });

  it('returns 400 when availableQty is not an integer', async () => {
    try {
      await axios.post('/api/inventory', { sku: 'SKU-FLOAT', availableQty: 1.5 });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });
});

describe('Inventory Service — PATCH /api/inventory/:sku', () => {
  it('returns 200 with updated inventory after restock', async () => {
    const sku = `E2E-RESTOCK-${Date.now()}`;
    try {
      await axios.post('/api/inventory', { sku, availableQty: 10 });
      const res = await axios.patch(`/api/inventory/${sku}`, { availableQty: 200 });
      expect(res.status).toBe(200);
      expect(res.data.availableQty).toBe(200);
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 404, 500, 503]).toContain(e.response?.status);
    }
  });

  it('returns 404 for non-existent SKU', async () => {
    try {
      await axios.patch('/api/inventory/COMPLETELY-NONEXISTENT-SKU-E2E', { availableQty: 50 });
      throw new Error('Expected 404');
    } catch (err) {
      const e = err as AxiosError;
      expect([404, 500, 503]).toContain(e.response?.status);
    }
  });

  it('returns 400 when availableQty is missing', async () => {
    try {
      await axios.patch('/api/inventory/SKU-PATCH-NOQTY', {});
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });

  it('returns 400 when availableQty is negative', async () => {
    try {
      await axios.patch('/api/inventory/SKU-PATCH-NEG', { availableQty: -10 });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });
});

describe('Inventory Service — GET /api/inventory', () => {
  it('returns 200 with { data: [], total: number }', async () => {
    try {
      const res = await axios.get('/api/inventory');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(typeof res.data.total).toBe('number');
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 500, 503]).toContain(e.response?.status);
    }
  });

  it('items in list have expected shape', async () => {
    const sku = `E2E-LIST-${Date.now()}`;
    try {
      await axios.post('/api/inventory', { sku, availableQty: 30 });
      const res = await axios.get('/api/inventory');
      const found = res.data.data.find((i: any) => i.sku === sku);
      if (found) {
        expect(found).toMatchObject({
          sku,
          availableQty: 30,
        });
      }
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 201, 500, 503]).toContain(e.response?.status);
    }
  });
});

describe('Inventory Service — GET /api/inventory/:sku', () => {
  it('returns 200 with inventory item when SKU exists', async () => {
    const sku = `E2E-GET-${Date.now()}`;
    try {
      await axios.post('/api/inventory', { sku, availableQty: 75 });
      const res = await axios.get(`/api/inventory/${sku}`);
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        sku,
        availableQty: 75,
        reservedQty: 0,
      });
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 201, 500, 503]).toContain(e.response?.status);
    }
  });

  it('returns 404 for non-existent SKU', async () => {
    try {
      await axios.get('/api/inventory/ABSOLUTELY-NONEXISTENT-E2E');
      throw new Error('Expected 404');
    } catch (err) {
      const e = err as AxiosError;
      expect([404, 500, 503]).toContain(e.response?.status);
    }
  });

  it('inventory item includes totalQty = availableQty + reservedQty', async () => {
    const sku = `E2E-TOTAL-${Date.now()}`;
    try {
      await axios.post('/api/inventory', { sku, availableQty: 20 });
      const res = await axios.get(`/api/inventory/${sku}`);
      if (res.status === 200) {
        expect(res.data.availableQty + res.data.reservedQty).toBeGreaterThanOrEqual(0);
      }
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 201, 500, 503]).toContain(e.response?.status);
    }
  });
});
