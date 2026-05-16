# Triage Labels

This repo uses a five-state triage vocabulary for issue management.

## Label Mapping

| Role | GitHub Label |
|------|--------------|
| Needs evaluation by maintainer | `needs-triage` |
| Waiting on reporter for more info | `needs-info` |
| Ready for AI agent to implement | `ready-for-agent` |
| Ready for human to implement | `ready-for-human` |
| Will not be actioned | `wontfix` |

When the `triage` skill processes an issue, it will apply these labels to track state transitions.
