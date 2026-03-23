import { predictionOutcomeService } from '../services/predictionOutcomeService';
import { query } from '../models/database';

jest.mock('../models/database');

const mockedQuery = query as jest.Mock;

describe('PredictionOutcomeService', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('returns new outcome id on successful insert', async () => {
    mockedQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    const id = await predictionOutcomeService.recordPrediction('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 49.99, {
      baseline: 1,
    });
    expect(id).toBeTruthy();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(mockedQuery).toHaveBeenCalled();
  });

  it('returns null and does not throw when insert fails', async () => {
    mockedQuery.mockRejectedValue(new Error('constraint'));
    const id = await predictionOutcomeService.recordPrediction('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 10);
    expect(id).toBeNull();
  });
});
