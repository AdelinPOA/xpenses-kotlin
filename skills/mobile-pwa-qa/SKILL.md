---
name: mobile-pwa-qa
description: Audit and test mobile PWA interfaces. Use for responsive layout bugs, iOS issues, overflow, and frontend regression testing
---

# Mobile PWA Quality Assurance

1. Inspect the frontend framework and existing tests.
2. Start the application locally using its documented commands.
3. Use Playwright to inspect the application at:
   - 320 x 568
   - 375 x 667
   - 390 x 844
   - 430 x 932
   - 768 x 1024
4. Check:
   - Horizontal overflow
   - Date inputs and modals
   - Forms and validation
   - Navigation and touch targets
   - Safe areas and viewport sizing
   - Browser console and network errors
5. Capture screenshots for problems found.
6. Fix confirmed issues with minimal changes.
7. Run existing tests and create regression tests.
8. Summarize the fixes, tests, and remaining risks.

Do not claim native iOS compatibility solely from
Chromium emulation. Report what still needs Safari
or real-device validation.
