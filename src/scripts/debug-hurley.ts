import { config } from 'dotenv';
import path from 'path';

const secretsPath = path.resolve(process.cwd(), 'secrets.env');
config({ path: secretsPath });
config(); 

import { getStores } from '@/lib/stores';

async function main() {
  const searchTerm = 'H10809';
  const storeName = 'HURLEY';
  
  console.log('Checking environment variables...');
  const hurleyUser = process.env.HURLEY_WAREHOUSE_API_USERNAME;
  if (hurleyUser) {
      console.log('HURLEY_WAREHOUSE_API_USERNAME is set.');
  } else {
      console.error('HURLEY_WAREHOUSE_API_USERNAME is NOT set!');
  }

  const stores = getStores();
  const hurleyStore = stores.find(s => s.name === 'HURLEY');
  if (hurleyStore && hurleyStore.apiKey) {
       console.log('HURLEY Store config has API Key.');
  } else {
       console.error('HURLEY Store config is missing API Key.');
  }
  
  try {
      const { performLiveSearch } = await import('@/ai/flows/lookup-shipment');

      console.log(`\nSearching for: ${searchTerm} in ${storeName}`);
      console.log('Testing direct Live API search with searchBy="all"...');
      
      const toDate = new Date(); 
      const fromDate = new Date(toDate);
      fromDate.setFullYear(toDate.getFullYear() - 7);
      
      const { record, logs } = await performLiveSearch(searchTerm, 'all', fromDate, toDate, storeName, 'all', undefined);
      
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
