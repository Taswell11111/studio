
'use server';
import { config } from 'dotenv';
config({ path: '.env.local' });

import '@/ai/flows/update-shipment-status.ts';
import '@/ai/flows/import-from-storage.ts';
import '@/ai/flows/import-from-csv.ts';
import '@/ai/flows/import-from-local.ts';
import '@/ai/flows/clear-data.ts';
import '@/ai/flows/import-inbound-from-csv.ts';
import '@/ai/flows/clear-inbound-data.ts';
