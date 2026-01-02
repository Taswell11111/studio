
// This file contains the central configuration for all stores.
// Other scripts should import this STORES list to ensure consistency.

export type Store = {
    name: string;
    apiKey: string;
    apiSecret: string;
    storeId: string;
    prefix: string;
};

// Function to get STORES array to ensure environment variables are evaluated at call time, not import time
export const getStores = (): Store[] => [
    {
        "name": "DIESEL",
        "apiKey": process.env.DIESEL_WAREHOUSE_API_USERNAME || "",
        "apiSecret": process.env.DIESEL_WAREHOUSE_API_PASSWORD || "",
        "storeId": "7b0fb2ac-51bd-47ea-847e-cfb1584b4aa2",
        "prefix": "D"
    },
    {
        "name": "HURLEY",
        "apiKey": process.env.HURLEY_WAREHOUSE_API_USERNAME || "",
        "apiSecret": process.env.HURLEY_WAREHOUSE_API_PASSWORD || "",
        "storeId": "a504304c-ad27-4b9b-8625-92a314498e64",
        "prefix": "H"
    },
    {
        "name": "JEEP",
        "apiKey": process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME || "",
        "apiSecret": process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD || "",
        "storeId": "80f123d6-f9de-45b9-938c-61c0a358f205",
        "prefix": "J"
    },
    {
        "name": "SUPERDRY",
        "apiKey": process.env.SUPERDRY_WAREHOUSE_API_USERNAME || "",
        "apiSecret": process.env.SUPERDRY_WAREHOUSE_API_PASSWORD || "",
        "storeId": "b112948b-0390-4833-8f41-47f997c5382c",
        "prefix": "S"
    },
    {
        "name": "REEBOK",
        "apiKey": process.env.REEBOK_WAREHOUSE_API_USERNAME || "",
        "apiSecret": process.env.REEBOK_WAREHOUSE_API_PASSWORD || "",
        "storeId": "963f57af-6f46-4d6d-b07c-dc4aa684cdfa",
        "prefix": "R"
    }
];

// Keep STORES for backwards compatibility, but it might be empty if imported before env vars are set
export const STORES: Store[] = getStores();
