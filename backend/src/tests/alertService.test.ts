import { AlertService } from '../services/alertService';
import { query } from '../models/database';
import { AlertType } from '@shared/types';
import { v4 as uuidv4 } from 'uuid';

// Use mocked query from setup.ts
const mockedQuery = query as jest.Mock;

describe('AlertService', () => {
  let alertService: AlertService;
  const userId = uuidv4();
  const productId = uuidv4();

  beforeEach(() => {
    alertService = new AlertService();
    mockedQuery.mockReset();
  });

  describe('createAlert', () => {
    it('should create a new alert', async () => {
      // Mock ensureUser finding no user
      mockedQuery.mockResolvedValueOnce({ rows: [] }); // select user
      mockedQuery.mockResolvedValueOnce({ rows: [] }); // insert user

      // Mock alert insertion
      const alertId = uuidv4();
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: alertId,
          user_id: userId,
          product_id: productId,
          alert_type: AlertType.TARGET_PRICE,
          target_price: 100,
          is_active: true,
          created_at: new Date().toISOString()
        }]
      });

      const alert = await alertService.createAlert(userId, productId, AlertType.TARGET_PRICE, 100);

      expect(alert).toBeDefined();
      expect(alert.targetPrice).toBe(100);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.any(Array)
      );
    });
  });

  describe('checkAlerts', () => {
    it('should trigger target price alert', async () => {
      // Mock getProductAlerts
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: 'alert-1',
          user_id: userId,
          product_id: productId,
          alert_type: AlertType.TARGET_PRICE,
          target_price: 80,
          is_active: true,
          created_at: new Date().toISOString()
        }]
      });

      // Mock get product name
      mockedQuery.mockResolvedValueOnce({
        rows: [{ name: 'Test Product' }]
      });

      // Mock triggerAlert update
      mockedQuery.mockResolvedValueOnce({ rows: [] });

      const notifications = await alertService.checkAlerts(productId, 75, 100, 'amazon' as any);

      expect(notifications.length).toBe(1);
      expect(notifications[0].message).toContain('below your target');
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET triggered_at'),
        expect.any(Array)
      );
    });

    it('should trigger sudden drop alert', async () => {
      // Mock getProductAlerts
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: 'alert-2',
          user_id: userId,
          product_id: productId,
          alert_type: AlertType.SUDDEN_DROP,
          is_active: true,
          created_at: new Date().toISOString()
        }]
      });

      // Mock get product name
      mockedQuery.mockResolvedValueOnce({
        rows: [{ name: 'Test Product' }]
      });

      // Mock triggerAlert update
      mockedQuery.mockResolvedValueOnce({ rows: [] });

      const notifications = await alertService.checkAlerts(productId, 85, 100, 'amazon' as any);

      expect(notifications.length).toBe(1);
      expect(notifications[0].message).toContain('Sudden price drop');
    });
  });
});
