# Design: Logo Link & Sidebar Padding

## 1. Sidebar Header Padding & Link
In `Sidebar.tsx`:
Change sidebar top header container from `px-6 py-4 pt-safe` to `px-6 pt-6 pb-4 pt-safe`.
Wrap logo `Image` + `span` title in `<Link href="/dashboard" onClick={onClose} className="flex items-center gap-2 hover:opacity-90 transition-opacity">`.

## 2. AppShell Mobile Header Logo Link
In `AppShell.tsx`:
Change center logo div from `pointer-events-none` `div` to `<Link href="/dashboard" className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity z-10">`.
