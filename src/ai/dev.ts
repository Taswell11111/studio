'use server';
import { config } from 'dotenv';
config({ path: '.env.local' });

import '@/ai/flows/update-shipment-status.ts';
import '@/ai/flows/clear-data.ts';
import '@/ai/flows/clear-inbound-data.ts';
import '@/ai/flows/import-shipment-data-from-csv.ts';
import '@/ai/flows/sync-recent-shipments.ts';
import '@/ai/flows/test-parcelninja-connection.ts';
import '@/ai/flows/lookup-shipment.ts';
