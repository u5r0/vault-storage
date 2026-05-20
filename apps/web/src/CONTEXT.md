# Frontend Context

## Glossary

**VaultEntry**
The canonical type for a file or folder displayed in the UI. Sourced from the `@vault/sdk` contract — not defined locally. Frontend-only display fields (`starred`, `tags`, `items`, `ext`) are deferred; the UI renders only what the API returns.

**FileList**
The main panel component that renders a collection of VaultEntries in list or grid view.

**DetailsPanel**
The right-hand panel showing metadata for the currently selected VaultEntry.

**AppSidebar**
The left-hand navigation showing the folder tree and quick links (Starred, Recent, Tags, Trash). Currently static; will be driven by `files.list` calls.

**Routing**
`vue-router` with HTML5 history mode. Main route: `/contents/:entityId?` rendered by `views/FilesView.vue`. Entity ID is a route param (UUID-based identifier per ADR 0006); selected file is a `?selected=<id>` query param. `App.vue` is a thin shell containing `AppHeader` + `<RouterView>`. Navigation flows: clicking a folder calls `router.push` with new entity ID; clicking a file pushes the same ID with `?selected=`. Back/forward buttons and deep links work because the URL is the single source of truth for current location and selection.

**Theme system**
Theme mode (light / dark) driven by `useTheme` composable and CSS custom properties defined in `style.css`. All components reference colors exclusively through `var(--color-*)` tokens — never hardcoded hex/oklch values. The `dark` class on `<html>` toggles the dark palette; `[data-theme]` stores the current mode. Persisted to `localStorage` under `vault.theme`. New components must follow this pattern: use `var(--color-*)` tokens and the `glass`, `grain`, `ring-soft` utility classes where appropriate.

**AI Frontend Development Requirement**
All AI-created frontend components, pages, and features must seamlessly integrate with the existing application theme. This includes:
- Using the design tokens (colors, spacing, radius, typography) defined in `style.css`
- Following the established component patterns (glass effects, rounded corners, hover states, transitions)
- Maintaining visual consistency with existing UI elements
- Using Lucide icons where icons are needed
- Supporting light/dark mode through CSS custom properties
- Matching the overall aesthetic: clean, modern, with subtle shadows and smooth interactions
