# Runbooks

One Markdown file per alarm id in `infra/lib/observability/alarms.config.ts`.
The CI gate `scripts/check-runbooks.ts` enforces that every alarm has a
matching `<id>.md` here, and (separately) that every runbook here maps
back to a known alarm — so stale runbooks fail CI too.

## Authoring conventions

Each runbook should answer, in this order:

1. **What this alarm means.** One sentence.
2. **First-response steps.** A numbered checklist a tired oncall can follow.
3. **Dashboards.** Direct links into CloudWatch / X-Ray.
4. **Escalation.** Who pages next; how long to wait.
5. **Owner.** A single GitHub handle responsible for the alarm's accuracy.

Keep them short. A runbook that takes >2 minutes to read at 03:00 won't be
read at 03:00.
