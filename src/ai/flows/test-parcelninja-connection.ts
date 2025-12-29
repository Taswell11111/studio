'use server';
/**
 * @fileOverview A Genkit flow to test the API connection to Parcelninja for all configured stores.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// --- SCHEMAS ---

const ConnectionTestResultSchema = z.object({
  storeName: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;

const TestConnectionOutputSchema = z.object({
  results: z.array(ConnectionTestResultSchema),
});
export type TestConnectionOutput = z.infer<typeof TestConnectionOutputSchema>;


// --- Exported Function ---

export async function testParcelninjaConnection(): Promise<TestConnectionOutput> {
  return testParcelninjaConnectionFlow();
}


// --- GENKIT FLOW ---

const testParcelninjaConnectionFlow = ai.defineFlow(
  {
    name: 'testParcelninjaConnectionFlow',
    outputSchema: TestConnectionOutputSchema,
  },
  async () => {
    
    type WarehouseCredentials = {
      name: string;
      apiUsername?: string;
      apiPassword?: string;
    };

    const credentialsList: WarehouseCredentials[] = [
      { name: 'DIESEL', apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME, apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD },
      { name: 'HURLEY', apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME, apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD },
      { name: 'JEEP', apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME, apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD },
      { name: 'SUPERDRY', apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME, apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD },
      { name: 'REEBOK', apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME, apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD },
    ];
    
    const testResults: ConnectionTestResult[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    };

    const startDate = formatDate(yesterday);
    const endDate = formatDate(today);


    for (const creds of credentialsList) {
      if (!creds.apiUsername || !creds.apiPassword) {
        testResults.push({
          storeName: creds.name,
          success: false,
          error: 'Missing API Username or Password in environment variables.',
        });
        continue;
      }

      // A lightweight API call to list outbounds from the last day.
      const url = `https://storeapi.parcelninja.com/api/v1/outbounds?startDate=${startDate}&endDate=${endDate}&pageSize=1`;
      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Basic ${basicAuth}` },
        });

        if (response.ok) {
          testResults.push({ storeName: creds.name, success: true });
        } else {
          let errorMessage = `API returned status ${response.status}.`;
          if (response.status === 401) {
              errorMessage = 'Authentication failed. Please check API credentials.';
          } else {
            try {
              const errorBody = await response.text();
              errorMessage += ` Body: ${errorBody.substring(0, 150)}`; // Limit error body length
            } catch (e) {}
          }
          testResults.push({ storeName: creds.name, success: false, error: errorMessage });
        }
      } catch (err: any) {
        console.error(`Error testing connection for ${creds.name}:`, err);
        testResults.push({ storeName: creds.name, success: false, error: err.message || 'A network error occurred.' });
      }
    }
    
    return { results: testResults };
  }
);
