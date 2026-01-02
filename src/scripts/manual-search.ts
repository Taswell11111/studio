import { config } from 'dotenv';
import path from 'path';

// Load environments BEFORE importing anything else
const secretsPath = path.resolve(process.cwd(), 'secrets.env');
config({ path: secretsPath });
config({ path: path.resolve(process.cwd(), '.env') });

// Import getStores to get fresh config
import { getStores } from '@/lib/stores';

async function main() {
  const searchTerm = 'J16530';
  const searchBy = 'orderId';
  const storeName = 'JEEP'; 
  
  // Debug: Check if variables are loaded
  console.log('Checking environment variables...');
  const sampleKey = process.env.DIESEL_WAREHOUSE_API_USERNAME;
  if (sampleKey) {
      console.log('DIESEL_WAREHOUSE_API_USERNAME is set (length: ' + sampleKey.length + ')');
  } else {
      console.error('DIESEL_WAREHOUSE_API_USERNAME is NOT set!');
  }

  // Debug: Check if config picked it up
  const stores = getStores();
  const jeepStore = stores.find(s => s.name === 'JEEP');
  if (jeepStore && jeepStore.apiKey) {
       console.log('JEEP Store config has API Key.');
  } else {
       console.error('JEEP Store config is missing API Key.');
  }
  
  try {
      // Dynamic import to ensure env vars are loaded before STORES is initialized in the module
      const { performLiveSearch } = await import('@/ai/flows/lookup-shipment');

      console.log(`\nSearching for: ${searchTerm} by ${searchBy} in ${storeName}`);
      console.log('Testing direct Live API search...');
      
      // Mimic the "Pass 3" historical logic I implemented in the app
      const toDate = new Date(); 
      const fromDate = new Date(toDate);
      fromDate.setFullYear(toDate.getFullYear() - 7);
      
      console.log(`Date Range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);
      
      const { record, logs } = await performLiveSearch(searchTerm, searchBy, fromDate, toDate, storeName, 'all', undefined);
      
      console.log('\n--- LOGS ---');
      logs.forEach(l => console.log(l));
      
      if (record) {
          console.log('\n--- RESULT ---');
          console.log(JSON.stringify(record, null, 2));
      } else {
          console.log('\n--- RESULT ---');
          console.log('Record not found via Live API.');
      }

  } catch (error) {
    console.error('Search failed:', error);
  }
}

main();
