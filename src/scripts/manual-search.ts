
import { config } from 'dotenv';
import path from 'path';

// Load environments BEFORE importing anything else
const secretsPath = path.resolve(process.cwd(), 'secrets.env');
config({ path: secretsPath });
config({ path: path.resolve(process.cwd(), '.env') });

import { performLiveSearch } from '@/ai/flows/lookup-shipment';
// Import getStores to get fresh config
import { getStores } from '@/lib/stores';

async function main() {
  const searchTerm = 'SHP-10000535797';
  
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
  const dieselStore = stores.find(s => s.name === 'DIESEL');
  if (dieselStore && dieselStore.apiKey) {
       console.log('Store config has API Key.');
  } else {
       console.error('Store config is missing API Key.');
  }
  
  try {
      console.log(`\nSearching for: ${searchTerm}`);
      console.log('Testing direct Live API search...');
      const fromDate = new Date('2024-01-01');
      const toDate = new Date(); // Today
      
      const { record, logs } = await performLiveSearch(searchTerm, fromDate, toDate, undefined, 'all', undefined);
      
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
