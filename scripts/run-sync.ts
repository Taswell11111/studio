import { syncRecentShipments } from '../src/ai/flows/sync-recent-shipments';

async function main() {
  console.log('Starting sync of shipments for the last 20 days...');
  try {
    const result = await syncRecentShipments({ days: 20 });
    console.log('Sync Result:', result);
  } catch (error) {
    console.error('Error running sync script:', error);
  }
}

main();
