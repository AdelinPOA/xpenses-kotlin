# Design: Dashboard UI/UX Overhaul

## Context

The expense management system serves technicians in the field and managers who review, approve, and settle expenses and advance requests. 

The previous implementation:
1. Conflated manager and employee concerns without clean operational focus.
2. Relied on an external slide-over drawer modal that felt disjointed, especially on mobile.
3. Left technician desktop views with unpopulated reimbursement metrics (rendering `-` placeholders).
4. Provided no dedicated fast-action capture trigger on mobile for field workers.

## Goals / Non-Goals

**Goals:**
- Provide an **Action-Only Desk** for Managers on Web and Mobile: immediate visibility of pending reports and pending advances, with inline accordion expansion for rapid review without modal overhead.
- Provide a **Field-First Mobile Experience** for Technicians: prominent quick receipt capture floating action, clear reimbursement status tracker, and clean recent receipt list.
- Provide a **Master-Detail Desktop Experience** for Technicians: full-width searchable recent expenses on the left, with real EUR reimbursement totals, categories, and monthly trajectory on the right.
- Ensure 100% responsiveness without nested scroll traps.

**Non-Goals:**
- Building heavy corporate turnaround / KPI analytics suites (agreed to be unnecessary for small-to-mid operations).
- Changing backend database schemas or core REST API contracts.

## Decisions

### 1. Inline Accordion Review instead of Slide-Over Drawer
- **Rationale**: Expanding report details directly in the list allows managers to review line items, totals, receipts, and descriptions with zero context-switching or modal viewport clipping on mobile.
- **Alternatives considered**: Slide-over drawer (harder on mobile, overlays screen content) or navigating to dedicated page (slow, loses position in queue).

### 2. Mobile Quick Action Bar / Floating Action Button
- **Rationale**: Technicians in the field need to snap receipt photos or upload immediately. A prominent bottom/floating action button ensures 1-tap capture is always accessible.
- **Alternatives considered**: Header icon only (too small, hard to reach with one hand).

### 3. Master-Detail 2-Column Desktop Layout for Technicians
- **Rationale**: Placing recent expenses in a spacious left table gives full readability for dates, merchants, and statuses, while the right rail consolidates status cards and category distribution.
- **Alternatives considered**: 2x2 grid with small square cards (causes awkward scrollbars and cramped data).

## Risks / Trade-offs

- **[Risk] Accordion fetching overhead**: Expanding multiple reports could trigger repeated API calls.
  - **Mitigation**: Use React Query caching (`reportKeys.detail(id)`) with staleTime so fetching is fast and cached.
- **[Risk] Mobile action button overlaying bottom navigation**:
  - **Mitigation**: Position floating action button above the safe area bottom navigation with proper z-index and padding.
