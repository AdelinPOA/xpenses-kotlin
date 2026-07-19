# Spec: receipt-capture-preview

## ADDED Requirements

### Requirement: Direct camera capture for receipts
The expense form SHALL offer a dedicated "Take photo" action on mobile that opens the device camera directly (hidden input with `accept="image/*"` and `capture="environment"`), feeding the same OCR scan pipeline as the browse/drop input.

#### Scenario: Technician photographs a receipt
- **WHEN** a user on iOS taps "Take photo" in the new-expense form
- **THEN** the camera opens and the captured photo is sent for OCR scanning

#### Scenario: Browse option preserved
- **WHEN** a user taps the drop zone itself
- **THEN** the regular file picker (library/files/camera choice) still opens

### Requirement: Upload copy matches device capabilities
The receipt drop zone SHALL NOT instruct mobile users to "drag & drop" (impossible on touch devices); mobile copy SHALL describe tapping to photograph or choose a receipt.

#### Scenario: Mobile copy
- **WHEN** the new-expense form is viewed below the `lg` breakpoint
- **THEN** the drop-zone text references tapping/photographing, not dragging

### Requirement: Receipt list keys are unique and stable
Each newly added receipt file SHALL be keyed by a unique id generated at add time, not by `name + size`, so re-adding the same file does not produce duplicate React keys.

#### Scenario: Same file added twice
- **WHEN** a user selects the same receipt image twice
- **THEN** both entries render without React key warnings and can be removed independently

### Requirement: Zoomed receipt preview pans with touch
The receipt preview drag interaction SHALL use Pointer Events with pointer capture and `touch-action: none` on the drag surface, so zoomed images can be panned on touch devices. Zoom button controls SHALL remain available.

#### Scenario: Pan while zoomed on iPhone
- **WHEN** a user zooms a receipt to 200% and drags with one finger
- **THEN** the image follows the finger and the page does not scroll
