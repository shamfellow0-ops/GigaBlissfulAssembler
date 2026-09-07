---
name: Recovering a missing web artifact
description: How to restore a project when a user supplies a live Vite preview but its artifact is missing locally.
---

When a supplied Replit preview works but its source folder is missing from the current checkout, inspect the Vite-served source maps before rebuilding from scratch. App source maps can contain `sourcesContent`, and the Vite `@fs` path can expose related source files and workspace API contracts.

**Why:** The preview and the checked-out workspace can be briefly out of sync, and rebuilding only the visible page can lose the existing product behavior and data contract.

**How to apply:** Use the recovered source only to restore the existing artifact into the current project, then make the requested change normally and regenerate any contract-derived clients before typechecking.