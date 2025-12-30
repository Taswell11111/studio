
// This file contains the central configuration for all stores.
// Other scripts should import this STORES list to ensure consistency.

export type Store = {
    name: string;
    apiKey: string;
    apiSecret: string;
    storeId: string;
    prefix: string;
};

export const STORES: Store[] = [
    {
        "name": "DIESEL",
        "apiKey": "ENgsxyMbeqVGvGzTCpVdkZmsjz/VCDeF+NWHlRk3Hk0=",
        "apiSecret": "EuoTNvCvp5imhOR2TZDe/fnKDxfoPK+EORSqfGvafZk=",
        "storeId": "7b0fb2ac-51bd-47ea-847e-cfb1584b4aa2",
        "prefix": "D"
    },
    {
        "name": "HURLEY",
        "apiKey": "CtAAy94MhKTJClgAwEfQL9LfkM14CegkeUbpBfhwt68=",
        "apiSecret": "AmlbcKtg1WQsLuivLpjyOTVizNrijZiXY6vVJoT5a1U=",
        "storeId": "a504304c-ad27-4b9b-8625-92a314498e64",
        "prefix": "H"
    },
    {
        "name": "JEEP",
        "apiKey": "+w3K5hLq56MQ4ijqFH78lV0xQCTTzP9mNAqToCUL9Cw=",
        "apiSecret": "l2+ozGqsA6PX7MSHrl4OMwZRTieKzUpJVWv/WYye8iA=",
        "storeId": "80f123d6-f9de-45b9-938c-61c0a358f205",
        "prefix": "J"
    },
    {
        "name": "Superdry",
        "apiKey": "zcUrzwFh2QwtH1yEJixFXtUA4XGQyx2wbNVLpYTzZ8M=",
        "apiSecret": "92Av8tHsbq2XLEZZeRwYNsPFSkca+dD1cwRQs79rooM=",
        "storeId": "b112948b-0390-4833-8f41-47f997c5382c",
        "prefix": "S"
    },
    {
        "name": "Reebok",
        "apiKey": "9oZ10dMWlyQpEmS0Kw6xhIcKYXw8lB2az3Q0Zb+KBAw=",
        "apiSecret": "Cq/Zn86P7FT3EN0C5qzOewAQssyvrDSbkzmQBSAOrMY=",
        "storeId": "963f57af-6f46-4d6d-b07c-dc4aa684cdfa",
        "prefix": "R"
    }
];
