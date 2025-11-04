import { Component, inject, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgIf } from '@angular/common';
import { CompressionService } from './compression.service';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [FormsModule, CommonModule, NgIf]
})
export class AppComponent {
  private compressionService = inject(CompressionService);

  // --- States ---
  dataInput: string = '';
  dataType: 'compressed' | 'json' | 'unknown' = 'unknown';
  isLoading: boolean = false;

  // NEW: Toggle state for Web Worker usage, defaulted to true for best performance
  useWebWorker: boolean = true;

  // --- Output States ---
  resultData: string = '';
  resultTitle: string = '';

  // --- Message & Size States ---
  statusMessage: string = 'Paste or drop data to begin.';
  errorMessage: string | null = null;
  originalSize: number = 0;
  resultSize: number = 0;

  // --- Drag and Drop Handlers ---
  isDragging: boolean = false;

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files.length) {
      this.readFileContent(event.dataTransfer.files[0]);
    }
  }

  // --- Input Handlers ---
  handleFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      this.readFileContent(input.files[0]);
      input.value = '';
    }
  }

  onDataChange(): void {
    this.resetOutput();
    this.analyzeInput();
  }

  onWorkerToggle() {
    // Update status message based on new worker preference
    this.statusMessage = `Processing mode set to **${this.useWebWorker ? 'Web Worker (Async)' : 'Main Thread (Sync)'}**.`;
    this.resetError();
  }

  analyzeInput(): void {
    const input = this.dataInput.trim();
    this.dataType = CompressionService.analyzeData(input);

    if (this.dataType === 'compressed') {
      this.statusMessage = 'Data recognized as **LZ-Compressed String**. Ready to Decompress.';
    } else if (this.dataType === 'json') {
      this.statusMessage = 'Data recognized as **Raw JSON Object**. Ready to Compress.';
    } else {
      this.statusMessage = input ? 'Pasted data is not recognized as valid JSON or compressed format.' : 'Paste or drop data to begin.';
    }
    this.originalSize = this.compressionService.calculateByteSize(input);
  }

  // --- Main Action Handler (Async) ---
  async handleAction(): Promise<void> {
    if (this.dataInput.trim().length === 0) {
      this.errorMessage = "Input cannot be empty.";
      return;
    }

    this.resetError();
    this.isLoading = true;
    this.resultData = '';

    const action = this.dataType === 'json' ? 'compress' : 'decompress';
    const originalInput = this.dataInput;

    // --- Time Measurement Start ---
    const startTime = performance.now();

    try {
      // Calls the service, which uses either the Web Worker or a synchronous setTimeout(0) wrapper
      const result = await this.compressionService.processDataAsync(
        action,
        originalInput,
        this.useWebWorker
      );

      // --- Time Measurement End and Calculation ---
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(2);

      this.resultData = result;
      this.resultTitle = action === 'compress' ? 'Compressed String (Base64)' : 'Decompressed JSON Object';
      this.resultSize = this.compressionService.calculateByteSize(this.resultData);

      // Update status message with time taken and mode
      this.statusMessage = `${action === 'compress' ? 'Compression' : 'Decompression'} successful! Time taken: **${duration} ms** (Mode: ${this.useWebWorker ? 'Worker' : 'Sync'}).`;

    } catch (e: any) {
      this.errorMessage = e.message || 'An unexpected error occurred during processing.';
      this.resetOutput();
    } finally {
      this.isLoading = false;
    }
  }

  // --- Internal File/State Management ---

  private readFileContent(file: File): void {
    this.resetError();
    this.statusMessage = `Reading file: ${file.name}...`;
    this.isLoading = true;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.dataInput = e.target?.result as string;
      this.analyzeInput();
      this.isLoading = false;
    };
    reader.onerror = () => {
      this.errorMessage = 'Error reading file.';
      this.isLoading = false;
    };
    reader.readAsText(file);
  }

  resetOutput(): void {
    this.resultData = '';
    this.resultTitle = '';
    this.resultSize = 0;
    this.resetError();
  }

  resetError(): void {
    this.errorMessage = null;
  }

  // --- Output Actions ---
  copyToClipboard(): void {
    this.isLoading = true;

    navigator.clipboard.writeText(this.resultData).then(() => {
      this.statusMessage = 'Result successfully copied to clipboard! ';

      setTimeout(() => {
        this.isLoading = false;
        this.analyzeInput();
      }, 1000);
    }).catch(err => {
      this.errorMessage = 'Could not copy text: ' + err;
      this.isLoading = false;
    });
  }

  downloadFile(): void {
    this.resetError();
    const filename = this.dataType === 'json'
      ? 'compressed-data.txt'
      : 'decompressed-data.json';

    const blob = new Blob([this.resultData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.statusMessage = `File '${filename}' downloaded successfully! `;
  }

  get compressionRatio(): string {
    if (this.originalSize === 0 || this.resultSize === 0 || this.dataType !== 'json') return 'N/A';
    const reduction = (1 - (this.resultSize / this.originalSize)) * 100;
    return `${reduction.toFixed(2)}% reduction`;
  }
}
