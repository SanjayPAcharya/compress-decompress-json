// We must import the library inside the worker script context
import * as LZString from 'lz-string';

// Define the structure of the message data we expect from the main thread
interface WorkerMessage {
    action: 'compress' | 'decompress';
    data: string;
}

// Listener for messages sent from the main thread
addEventListener('message', ({ data }: { data: WorkerMessage }) => {
    try {
        let result: string;
        let originalData = data.data;

        if (data.action === 'compress') {
            // 1. Parse the stringified JSON back into an object (in the worker thread)
            const jsonObject = JSON.parse(originalData);

            // 2. Stringify the object again (or not, depends on lz-string's input type)
            const jsonString = JSON.stringify(jsonObject);

            // 3. Perform the heavy compression
            result = LZString.compressToBase64(jsonString);

        } else if (data.action === 'decompress') {
            // 1. Perform the heavy decompression
            const decompressedString = LZString.decompressFromBase64(originalData);

            if (decompressedString === null || decompressedString === undefined) {
                throw new Error('Decompression failed: Returned null/undefined.');
            }

            // 2. Parse the decompressed string into a JSON object
            const jsonObject = JSON.parse(decompressedString);

            // 3. Return the nicely formatted string
            result = JSON.stringify(jsonObject, null, 2);

        } else {
            throw new Error('Invalid action provided.');
        }

        // Send the result back to the main thread
        postMessage({ success: true, result });

    } catch (error: any) {
        // Send error message back to the main thread
        postMessage({ success: false, error: error.message || 'Worker processing failed.' });
    }
});
