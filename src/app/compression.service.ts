import { Injectable } from '@angular/core';
import * as LZString from 'lz-string';

@Injectable({
  providedIn: 'root'
})
export class CompressionService {

  // --- PRIVATE SYNCHRONOUS METHODS (Used for non-worker mode) ---

  private compressJsonSync(jsonObject: any): string {
    const jsonString = JSON.stringify(jsonObject);
    return LZString.compressToBase64(jsonString);
  }

  private decompressJsonSync(compressedString: string): any {
    const jsonString = LZString.decompressFromBase64(compressedString);
    if (jsonString === null || jsonString === undefined) {
      throw new Error('Decompression returned no data or failed.');
    }
    // Return the formatted string for consistency with worker output
    return JSON.stringify(JSON.parse(jsonString), null, 2);
  }

  // --- PUBLIC UTILITY METHODS ---

  /**
   * Calculates the size difference (in bytes) using TextEncoder.
   */
  calculateByteSize(str: string): number {
    if (!str) return 0;
    return new TextEncoder().encode(str).length;
  }

  /**
   * Executes the compression or decompression, choosing between synchronous execution
   * or a dedicated Web Worker based on the user's preference.
   */
  processDataAsync(action: 'compress' | 'decompress', data: string, useWorker: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      // 1. Synchronous Execution (for small data / user choice)
      if (!useWorker) {
        // Use setTimeout(0) to ensure the component can show 'Processing...' state 
        setTimeout(() => {
          try {
            if (action === 'compress') {
              // Note: Must parse first, as input is raw JSON string
              const jsonObject = JSON.parse(data);
              resolve(this.compressJsonSync(jsonObject));
            } else {
              // Decompress returns formatted string
              resolve(this.decompressJsonSync(data));
            }
          } catch (e: any) {
            reject(e.message || 'Synchronous processing failed.');
          }
        }, 0);
        return;
      }

      // 2. Web Worker Execution (for large data / user choice)
      if (typeof Worker !== 'undefined') {
        const worker = new Worker(new URL('./compression.worker', import.meta.url), { type: 'module' });

        worker.onmessage = ({ data: workerResult }) => {
          if (workerResult.success) {
            resolve(workerResult.result);
          } else {
            reject(workerResult.error || 'Worker execution failed.');
          }
          worker.terminate();
        };

        worker.onerror = (error) => {
          reject('Worker error: Could not process data.');
          worker.terminate();
        };

        // Send the raw data and action to the worker thread
        worker.postMessage({ action, data });
      } else {
        reject('Web Workers are not supported in this environment.');
      }
    });
  }

  // --- STATIC UTILITY METHOD ---

  static analyzeData(input: string): 'compressed' | 'json' | 'unknown' {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      return 'unknown';
    }

    // 1. Check for Valid JSON
    try {
      const parsed = JSON.parse(trimmedInput);
      if (typeof parsed === 'object' && parsed !== null) {
        return 'json';
      }
    } catch {
      // Not valid JSON
    }

    // 2. Check for Compressed String (Decompress -> Parse JSON)
    try {
      const decompressed = LZString.decompressFromBase64(trimmedInput);
      if (decompressed) {
        JSON.parse(decompressed);
        return 'compressed';
      }
    } catch {
      // Not a compressed string containing valid JSON
    }

    return 'unknown';
  }
}
