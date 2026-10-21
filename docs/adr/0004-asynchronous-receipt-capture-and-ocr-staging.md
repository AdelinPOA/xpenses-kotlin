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
3. **Graceful Photo-Only Draft Fallback**: If OCR extraction fails or produces low confidence, the item is promoted to a photo-only draft **Expense**. The persisted Expense status remains `draft`; the capture UI derives the visible `"Needs Review"` marker from missing details or the OcrJob error metadata. The app never navigates away during capture.
4. **Batch Review at Technician's Convenience**: Technicians can review and edit all captured drafts in one batch either from the session drawer or the main Expense list.

## Consequences

- The capture view remains responsive and operable even during slow network conditions or offline periods.
- The frontend consumes the Expense and Receipt IDs produced by the durable pipeline; it does not upload the captured image a second time.
- Stage promotion is lease-fenced and queue rejection leaves the OcrJob pending for scheduled recovery.
- Synchronous error alerts are replaced with persistent, non-intrusive status badges on draft cards.

## Superseding navigation default for #45/#49

The original continuous-camera and batch-review default above remains the historical rationale for the durable staged OcrJob. The approved #45/#49 product direction supersedes only that navigation default for single-receipt Technician capture: the default becomes capture → background processing → immediate per-Expense review/confirmation. A second capture is an explicit secondary action after server acknowledgement, not an automatic camera reset. Leaving the page still stops observation only; it does not cancel accepted server work, and known Expense/Receipt IDs and owner recovery remain authoritative. Bulk capture is unchanged. This amendment records the selected direction, not an implementation or deployment claim; see `docs/contracts/expense-verification-and-immediate-review.md` for the integration contract.
