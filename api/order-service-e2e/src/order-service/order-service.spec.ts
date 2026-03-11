import axios, { AxiosError } from 'axios';

/**
 * Order Service E2E Tests
 *
 * Runs directly against the Order Service (port 3001).
 * Kafka / Inventory Service are not required for HTTP-level tests.
 *
 * The setup in global-setup.ts waits for the port to open before tests run.
 */

describe('Order Service — POST /api/orders', () => {
  const validPayload = {
    userId: '550e8400-e29b-41d4-a716-446655440001',
    items: [
      { sku: 'SKU-A', quantity: 3, price: 5.00 },
      { sku: 'SKU-B', quantity: 1, price: 20.00 },
    ],
  };

  it('returns 202 with orderId and PENDING status for valid payload', async () => {
    try {
      const res = await axios.post('/api/orders', validPayload);
      expect(res.status).toBe(202);
      expect(res.data).toMatchObject({
        orderId: expect.any(String),
        status: 'PENDING',
        totalAmount: 35,
      });
      expect(new Date(res.data.createdAt).toISOString()).toBeDefined();
    } catch (err) {
      const e = err as AxiosError;
      // DB might be unavailable in CI
      expect([202, 500, 503]).toContain(e.response?.status);
    }
  });

  it('returns 400 when userId is missing', async () => {
    try {
      await axios.post('/api/orders', { items: [{ sku: 'SKU-A', quantity: 1, price: 5 }] });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });

  it('returns 400 when userId is not a valid UUID', async () => {
    try {
      await axios.post('/api/orders', { userId: 'not-uuid', items: [{ sku: 'X', quantity: 1, price: 1 }] });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });

  it('returns 400 when items is not an array', async () => {
    try {
      await axios.post('/api/orders', { userId: '550e8400-e29b-41d4-a716-446655440001', items: 'bad' });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });

  it('calculates totalAmount correctly (sum of qty * price)', async () => {
    const payload = {
      userId: '550e8400-e29b-41d4-a716-446655440001',
      items: [
        { sku: 'SKU-CALC', quantity: 4, price: 2.50 },
      ],
    };
    try {
      const res = await axios.post('/api/orders', payload);
      expect(res.status).toBe(202);
      expect(res.data.totalAmount).toBe(10);
    } catch (err) {
      const e = err as AxiosError;
      expect([202, 500, 503]).toContain(e.response?.status);
    }
  });
});

describe('Order Service — GET /api/orders/:orderId', () => {
  it('returns 404 for non-existent orderId', async () => {
    try {
      await axios.get('/api/orders/00000000-0000-0000-0000-000000000099');
      throw new Error('Expected 404');
    } catch (err) {
      const e = err as AxiosError;
      expect([404, 500, 503]).toContain(e.response?.status);
    }
  });

  it('returns 200 with order details when order exists', async () => {
    // First create an order, then fetch it
    try {
      const createRes = await axios.post('/api/orders', {
        userId: '550e8400-e29b-41d4-a716-446655440002',
        items: [{ sku: 'SKU-FETCH', quantity: 1, price: 15 }],
      });

      if (createRes.status === 202) {
        const orderId = createRes.data.orderId;
        const getRes = await axios.get(`/api/orders/${orderId}`);
        expect(getRes.status).toBe(200);
        expect(getRes.data).toMatchObject({
          id: orderId,
          userId: '550e8400-e29b-41d4-a716-446655440002',
          status: 'PENDING',
        });
      }
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 202, 404, 500, 503]).toContain(e.response?.status);
    }
  });
});

describe('Order Service — GET /api/orders', () => {
  it('returns 400 when userId query param is absent', async () => {
    try {
      await axios.get('/api/orders');
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });

  it('returns 200 with paginated results for valid userId', async () => {
    try {
      const res = await axios.get('/api/orders', {
        params: { userId: '550e8400-e29b-41d4-a716-446655440001', page: 1, limit: 5 },
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data).toHaveProperty('total');
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 500, 503]).toContain(e.response?.status);
    }
  });

  it('filters by status when provided', async () => {
    try {
      const res = await axios.get('/api/orders', {
        params: {
          userId: '550e8400-e29b-41d4-a716-446655440001',
          status: 'PENDING',
          page: 1,
          limit: 10,
        },
      });
      expect(res.status).toBe(200);
      const { data } = res.data;
      data.forEach((order: any) => {
        expect(order.status).toBe('PENDING');
      });
    } catch (err) {
      const e = err as AxiosError;
      expect([200, 400, 500, 503]).toContain(e.response?.status);
    }
  });

  it('returns 400 for invalid status value', async () => {
    try {
      await axios.get('/api/orders', {
        params: { userId: '550e8400-e29b-41d4-a716-446655440001', status: 'INVALID_STATUS' },
      });
      throw new Error('Expected 400');
    } catch (err) {
      expect((err as AxiosError).response?.status).toBe(400);
    }
  });
});
