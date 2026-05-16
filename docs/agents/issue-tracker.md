# Issue Tracker

Issues for this repo are tracked in **GitHub Issues** at `u5r0/vault-app`.

## Creating issues

Use the `gh` CLI:

```bash
gh issue create --title "Title" --body "Description"
```

## Reading issues

```bash
gh issue list
gh issue view <number>
```

## Updating issues

```bash
gh issue edit <number> --add-label "label-name"
gh issue comment <number> --body "Comment text"
gh issue close <number>
```

The `gh` CLI must be installed and authenticated. If not available, fall back to manual GitHub web UI instructions.
