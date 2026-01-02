
import { lookupShipmentFlow } from '@/ai/flows/lookup-shipment';
import { getStores } from '@/lib/stores';

async function main() {
    console.log("Stores loaded:", getStores().length);
    
    console.log("Checking lookupShipmentFlow type:", typeof lookupShipmentFlow);
    console.log("lookupShipmentFlow keys:", Object.keys(lookupShipmentFlow));

    const input = {
        sourceStoreOrderId: "TEST",
        searchBy: "all" as const,
        direction: "all" as const
    };

    console.log("Calling lookupShipmentFlow(input)...");
    const result = lookupShipmentFlow(input);
    console.log("Result type:", typeof result);
    console.log("Result constructor:", result.constructor.name);
    console.log("Is Promise?", result instanceof Promise);
    
    if (result && typeof (result as any)[Symbol.asyncIterator] === 'function') {
        console.log("Result IS async iterable");
    } else {
        console.log("Result IS NOT async iterable");
    }

    if ('stream' in lookupShipmentFlow && typeof (lookupShipmentFlow as any).stream === 'function') {
        console.log("lookupShipmentFlow HAS .stream() method");
         const streamResult = (lookupShipmentFlow as any).stream(input);
         console.log("streamResult type:", typeof streamResult);
         if (streamResult && typeof (streamResult as any)[Symbol.asyncIterator] === 'function') {
            console.log("streamResult IS async iterable");
         } else {
            console.log("streamResult IS NOT async iterable. Keys:", Object.keys(streamResult));
             // Maybe it returns a Promise<Stream>?
             if (streamResult instanceof Promise) {
                 console.log("streamResult is a Promise. Awaiting...");
                 try {
                     const resolved = await streamResult;
                     console.log("Resolved streamResult:", resolved);
                     if (resolved && typeof (resolved as any)[Symbol.asyncIterator] === 'function') {
                         console.log("Resolved streamResult IS async iterable");
                     }
                      if (resolved && (resolved as any).stream) {
                         console.log("Resolved result has .stream property");
                     }
                 } catch(e) { console.error(e); }
             }
         }
    } else {
         console.log("lookupShipmentFlow DOES NOT have .stream() method");
    }
}

main();
