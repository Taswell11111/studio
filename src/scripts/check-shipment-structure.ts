import { config } from 'dotenv';
import path from 'path';

const secretsPath = path.resolve(process.cwd(), 'secrets.env');
config({ path: secretsPath });
config(); 

import { lookupShipmentFlow } from '@/ai/flows/lookup-shipment';

async function main() {
  const searchTerm = 'SHP-10000534785';
  
  try {
      console.log(`\nSearching for: ${searchTerm}`);
      // Use the flow directly. Since it is a generator, we need to iterate or get result.
      // lookupShipmentFlow.stream(...) returns { stream: AsyncIterable }
      
      const flowResponse = lookupShipmentFlow.stream({
          sourceStoreOrderId: searchTerm,
          searchBy: 'shipmentId',
          storeName: 'All'
      });
      
      let finalResult = null;
      for await (const chunk of flowResponse.stream) {
          if (chunk.log) console.log(`[LOG] ${chunk.log}`);
          if (chunk.result) finalResult = chunk.result;
      }
      
      if (finalResult && finalResult.shipment) {
          console.log('\n--- RESULT ---');
          console.log(JSON.stringify(finalResult.shipment, null, 2));
      } else {
          console.log('\n--- RESULT ---');
          console.log('Record not found.');
          if (finalResult?.error) console.error("Error:", finalResult.error);
      }

  } catch (error) {
    console.error('Search failed:', error);
  }
}

main();
