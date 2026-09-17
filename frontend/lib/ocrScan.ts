/**
 * Compatibility exports for the receipt-capture module.
 * New callers should use receiptCapture.ts so result interpretation stays
 * consistent between the batch capture feed and the Expense form.
 */
export {
 captureReceipt,
 compressImage,
 interpretReceiptCapture,
 isReceiptCaptureCancelled,
 scanReceipt,
 ScanCancelledError,
 ScanJobError,
 ScanTimeoutError,
} from "./receiptCapture";
export type {
 ReceiptCapture,
 ScanOptions,
 ScanPhase,
 ScanProgress,
} from "./receiptCapture";
