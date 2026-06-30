# Project Board — agent-test

## Workflow

All work is tracked via **GitHub Issues** in this repo.

### Issue Types
| Type | Label | Purpose |
|------|-------|---------|
| Story | `story` | Feature work with acceptance criteria |
| Bug | `bug` | Defects and fixes |
| Decision | `decision` | Technical or product decisions |
| Spike | `spike` | Time-boxed investigations |

### Process
1. **Nova (PM)** creates issues, assigns labels, and sets priorities
2. **Atlas / Lyra / Juno** pick up assigned issues and move them through milestones
3. Progress is tracked via:
   - **Labels** — `story`, `bug`, `decision`, `spike`, `blocked`, `in-progress`, `review`
   - **Milestones** — sprints or phases
   - **Assignees** — team member responsible
   - **Comments** — updates, decisions, and discussion

### Branch Naming
- `feature/<issue#>-<short-description>` — for stories
- `bugfix/<issue#>-<short-description>` — for bugs
- `spike/<issue#>-<short-description>` — for spikes

### Pull Requests
- Reference the issue: `Closes #<issue#>` in the PR description
- At least one reviewer required before merge
- QA (Juno) verifies before merge to `main`