# Asynchronous Receipt Capture and OcrJob Staging for Technicians

The mobile receipt capture pipeline is decoupled from synchronous HTTP blocking. Snapping a receipt immediately creates a local **OCR source**, persists the image, and delegates processing to a staged background **OcrJob**, keeping the camera available for continuous batch capture.

## Context

Technicians in the field frequently incur multiple expenses in sequence (fuel, meals, tolls, materials). Under the previous implementation:
1. The camera UI blocked synchronously for 5–15 seconds per receipt while awaiting backend OCR.
2. If OCR extraction failed on illegible or handwritten receipts, the app forcibly navigated away to the manual edit form (`/expenses/[id]/edit`), breaking multi-receipt capture flow.
3. Mobile cellular latency compounded user friction, and spotty coverage led to client timeouts before a draft Expense could be stored.

## Decision

1. **Instant Capture to OCR Source**: Capturing a photo immediately stores the photo locally (IndexedDB if offline or temporary object store) as an **OCR source** and immediately resets the camera viewport.
2. **Background OcrJob Execution**: An **OcrJob** is initiated in the background. The mobile UI monitors progress through an unobtrusive session drawer/feed without blocking further photos.
3. **Graceful Photo-Only Draft Fallback**: If OCR extraction fails or produces low confidence, the item is promoted to a photo-only draft **Expense** tagged with a visible `"Needs Review"` status. The app never navigates away during capture.
4. **Batch Review at Technician's Convenience**: Technicians can review and edit all captured drafts in one batch either from the session drawer or the main Expense list.

## Consequences

- The capture view remains responsive and operable even during slow network conditions or offline periods.
- The frontend must manage staged `OcrJob` state transitions (`OCR` → `EXPENSE` → `RECEIPT`) and thumbnail queues.
- Synchronous error alerts are replaced with persistent, non-intrusive status badges on draft cards.
