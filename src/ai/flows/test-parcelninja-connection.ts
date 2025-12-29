'use server';
/**
 * @fileOverview A Genkit flow to test the API connection to Parcelninja for all configured stores.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { format } from 'date-fns';

// --- SCHEMAS ---

const ConnectionTestResultSchema = z.object({
  storeName: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;

const TestConnectionOutputSchema = z.object({
  results: z.array(ConnectionTestResultSchema),
  logs: z.array(z.string()),
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
    const logs: string[] = [];
    
    // Define a 1-day date range for the test query.
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = format(yesterday, 'yyyyMMdd');
    const endDate = format(today, 'yyyyMMdd');

    for (const creds of credentialsList) {
      logs.push(`[Connection Test] Testing store: ${creds.name}`);
      if (!creds.apiUsername || !creds.apiPassword) {
        const errorMsg = 'Missing API Username or Password in environment variables.';
        logs.push(`[Connection Test] ❌ ${creds.name}: FAILED - ${errorMsg}`);
        testResults.push({
          storeName: creds.name,
          success: false,
          error: errorMsg,
        });
        continue;
      }

      // This is a lightweight, valid API call to list outbounds.
      // It serves as a reliable way to test authentication and connectivity.
      const url = `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1`;
      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
      
      logs.push(`[Connection Test] ➡️ ${creds.name}: Requesting URL: ${url}`);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Basic ${basicAuth}` },
        });
        
        logs.push(`[Connection Test] ⬅️ ${creds.name}: Received status ${response.status}`);

        if (response.ok) {
          logs.push(`[Connection Test] ✅ ${creds.name}: SUCCESS`);
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
          logs.push(`[Connection Test] ❌ ${creds.name}: FAILED - ${errorMessage}`);
          testResults.push({ storeName: creds.name, success: false, error: errorMessage });
        }
      } catch (err: any) {
        const networkError = err.message || 'A network error occurred.';
        logs.push(`[Connection Test] ❌ ${creds.name}: FAILED - ${networkError}`);
        testResults.push({ storeName: creds.name, success: false, error: networkError });
      }
    }
    
    return { results: testResults, logs };
  }
);
