import axios from 'axios';
import { config } from '../config';

const PORT = config.server.port;
const API_BASE = `http://localhost:${PORT}/api/v1`;

async function runE2E() {
  console.log('🚀 Starting E2E Verification...');

  try {
    // 1. Check Health
    console.log('\n1. Checking Health...');
    const health = await axios.get(`http://localhost:${PORT}/health`);
    console.log('✅ Health status:', health.data.data.status);

    // 2. Detect Product
    console.log('\n2. Simulating Product Detection (Amazon)...');
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
    console.log('✅ Product resolved:', product.universalProductId);
    console.log('✅ Product ID:', product.id);

    // 3. Record price on another platform
    console.log('\n3. Recording price from another platform (Walmart)...');
    await axios.post(`${API_BASE}/prices/record`, {
      productId: product.id,
      platform: 'walmart',
      price: 330.00,
      shippingCost: 0,
      inStock: true,
      url: 'https://www.walmart.com/ip/sony-headphones'
    });
    console.log('✅ Walmart price recorded');

    // 4. Get Comparison
    console.log('\n4. Fetching Price Comparison...');
    const comparisonRes = await axios.get(`${API_BASE}/prices/compare/${product.id}`);
    console.log('✅ Found', comparisonRes.data.data.listings.length, 'listings');
    console.log('✅ Lowest price:', comparisonRes.data.data.lowestPrice.totalEffectivePrice);

    // 5. Get Prediction
    console.log('\n5. Fetching Price Prediction...');
    const predictionRes = await axios.get(`${API_BASE}/predictions/${product.id}`);
    console.log('✅ Prediction confidence:', predictionRes.data.data.confidenceScore);
    console.log('✅ Drop probability:', predictionRes.data.data.dropProbability);

    // 6. Get Recommendation
    console.log('\n6. Fetching Recommendation...');
    const recommendationRes = await axios.get(`${API_BASE}/recommendation/${product.id}`);
    console.log('✅ Action:', recommendationRes.data.data.action);
    console.log('✅ Reasoning:', recommendationRes.data.data.reasoning[0]);

    // 7. Create Alert
    console.log('\n7. Creating Price Alert...');
    const alertRes = await axios.post(`${API_BASE}/alerts`, {
      userId: '00000000-0000-0000-0000-000000000000', // Demo user
      productId: product.id,
      type: 'target_price',
      targetPrice: 300.00
    });
    console.log('✅ Alert created ID:', alertRes.data.data.id);

    console.log('\n✨ E2E Verification Completed Successfully!');
  } catch (error: any) {
    console.error('\n❌ E2E Verification Failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runE2E();
}

export { runE2E };
