import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const PORT = config.server.port;
const API_BASE = `http://localhost:${PORT}/api/v1`;
const API_KEY = process.env.API_KEY?.trim();

const api = axios.create({
  baseURL: API_BASE,
  headers:
    API_KEY && !config.auth.skipAuth
      ? { 'X-API-Key': API_KEY }
      : {},
});

async function runE2E() {
  logger.info('🚀 Starting E2E Verification...');
  if (!config.auth.skipAuth && !API_KEY) {
    logger.warn(
      'WARNING: backend/.env should set API_KEY (same as server) or run server with SKIP_AUTH=1 for keyless local runs.'
    );
  }

  try {
    // 1. Check Health
    logger.info('\n1. Checking Health...');
    const health = await axios.get(`http://localhost:${PORT}/health`);
    logger.info('✅ Health status:', health.data.data.status);

    // 2. Detect Product
    logger.info('\n2. Simulating Product Detection (Amazon)...');
    const detectionPayload = {
      name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
      brand: 'Sony',
      modelNumber: 'WH-1000XM5',
      currentPrice: 348.00,
      currency: 'USD',
      platform: 'amazon',
      url: 'https://www.amazon.com/dp/B09XS7GNLJ'
    };
    const detectRes = await axios.post(`${API_BASE}/products/detect`, detectionPayload);
    const product = detectRes.data.data.product;
    logger.info('✅ Product resolved:', product.universalProductId);
    logger.info('✅ Product ID:', product.id);

    // 3. Record price on another platform
    logger.info('\n3. Recording price from another platform (Walmart)...');
    await api.post('/prices/record', {
      productId: product.id,
      platform: 'walmart',
      price: 330.00,
      shippingCost: 0,
      inStock: true,
      url: 'https://www.walmart.com/ip/sony-headphones'
    });
    logger.info('✅ Walmart price recorded');

    // 4. Get Comparison
    logger.info('\n4. Fetching Price Comparison...');
    const comparisonRes = await api.get(`/prices/compare/${product.id}`);
    logger.info('✅ Found', comparisonRes.data.data.listings.length, 'listings');
    logger.info('✅ Lowest price:', comparisonRes.data.data.lowestPrice.totalEffectivePrice);

    // 5. Get Prediction
    logger.info('\n5. Fetching Price Prediction...');
    const predictionRes = await api.get(`/predictions/${product.id}`);
    logger.info('✅ Prediction confidence:', predictionRes.data.data.confidenceScore);
    logger.info('✅ Drop probability:', predictionRes.data.data.dropProbability);

    // 6. Get Recommendation
    logger.info('\n6. Fetching Recommendation...');
    const recommendationRes = await api.get(`/recommendation/${product.id}`);
    logger.info('✅ Action:', recommendationRes.data.data.action);
    logger.info('✅ Reasoning:', recommendationRes.data.data.reasoning[0]);

    // 7. Create Alert
    logger.info('\n7. Creating Price Alert...');
    const e2eUserId = '00000000-0000-0000-0000-000000000001';
    const alertRes = await api.post(
      '/alerts',
      {
        productId: product.id,
        type: 'target_price',
        targetPrice: 300.0,
      },
      { headers: { 'X-User-Id': e2eUserId } }
    );
    logger.info('✅ Alert created ID:', alertRes.data.data.id);

    logger.info('\n✨ E2E Verification Completed Successfully!');
  } catch (error: any) {
    logger.error('\n❌ E2E Verification Failed!');
    if (error.response) {
      logger.error('Status:', error.response.status);
      logger.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      logger.error('Error:', error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runE2E();
}

export { runE2E };
