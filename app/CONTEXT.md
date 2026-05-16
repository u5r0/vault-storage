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
