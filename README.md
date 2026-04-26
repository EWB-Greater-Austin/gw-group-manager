# gw-group-manager

Google Apps Script that lets recipients of EWB Greater Austin distribution lists self-serve their own subscriptions through a public Google Form. On submit, the script reconciles the submitter's membership in each managed Google Group against the checkboxes they ticked.

## How it works

- A public Google Form (no Google sign-in required) asks for the recipient's email and shows a checkbox per managed list.
- Submitting the form fires an `onFormSubmit` trigger.
- The script parses the response and, for each group declared in `GROUPS`:
  - If the user ticked it and isn't already a member → add them.
  - If the user didn't tick it and they are currently a member → remove them.
- All operations are idempotent: `Members.get()` is checked before insert/remove to avoid 409/404 noise on replays.
- Works for internal and external recipients alike — the form does not require a Google account.

## Functions

| Function | Purpose |
| --- | --- |
| `onSubmit(e)` | Entry point; called by the `onFormSubmit` trigger |
| `setupTrigger()` | Run once manually to install the `onFormSubmit` trigger (replaces any existing one) |
| `dryRun(email, selections)` | Logs what `onSubmit` *would* do for a given email + selection set without modifying any group. Use this to sanity-check that the form's question titles and option labels match the constants in `manage.gs` |

## Form payload

| Field | Source | Read by |
| --- | --- | --- |
| Email address | Free-text question titled `Email address` | `EMAIL_QUESTION_TITLE` |
| List subscriptions | Checkboxes question titled `Which lists do you want to be subscribed to?`, with one option per group | `SUBSCRIPTIONS_QUESTION_TITLE` + `GROUPS` |

The checkbox option labels in the form **must** match the keys of `GROUPS` exactly — that is how a tick maps to a group email.

## Google Workspace / GCP setup

- The GCP project linked to the Apps Script (`google-workspace-utilities`) must have the **Admin SDK API** enabled.
- OAuth scopes (declared in `appsscript.json`) — minimum required, nothing more:
  - `https://www.googleapis.com/auth/admin.directory.group.member` — add/remove group members
  - `https://www.googleapis.com/auth/forms` — read the FormResponse passed to the trigger
  - `https://www.googleapis.com/auth/script.scriptapp` — install/manage the trigger
- The script must run under a Google Workspace admin account (or a service account with appropriate domain-wide delegation) for `Members.insert()` / `Members.remove()` to be authorised.

## Local development

This project uses [clasp](https://github.com/google/clasp) to push/pull code from the Apps Script project.

```bash
# one-time auth with a GCP OAuth client
clasp login --creds ~/path/to/oauth-creds.json

# push local changes to Apps Script
clasp push

# pull cloud state down
clasp pull
```

`.claspignore` restricts the push to `appsscript.json` and `manage.gs` only.

## Deployment

After `clasp push`:

1. Open the Apps Script editor.
2. Run `setupTrigger()` once to install the `onFormSubmit` trigger.
3. Configure each managed Google Group's footer (Group Settings → Email options → Email footer) so every group email links to the form.

## CI/CD — Bidirectional sync and versioning

A GitHub Actions workflow (`.github/workflows/sync.yml`) keeps this repo and the live Apps Script project in sync automatically. Every change that reaches `main` — from either side — produces a new patch version tag.

### How changes flow

| Trigger | Direction | What happens |
| --- | --- | --- |
| Merge / push to `main` | GitHub → Apps Script | `clasp push`, auto-bump patch tag (e.g. `v1.0.1`), new Apps Script version |
| Daily schedule (9am UTC) or manual run | Apps Script → GitHub | `clasp pull`; if changed, commit to `main`, bump patch tag, new Apps Script version |
| Manually pushed `v*` tag (e.g. `v2.0.0`) | GitHub → Apps Script | `clasp push`, Apps Script version using your tag — use this for major/minor bumps |

### Versioning rules

- **Patch bumps are automatic** — every merge to `main` and every Apps Script editor change increments the patch number (`v1.0.x`).
- **Major/minor bumps are manual** — push a tag yourself (`git tag -a v2.0.0 -m "..." && git push origin v2.0.0`). The workflow will sync it to Apps Script and create the matching version.
- Git tags and Apps Script versions are always kept in sync — each git tag corresponds to an Apps Script version with the same name.

### Triggering a manual sync

To pull Apps Script changes into GitHub on demand without waiting for the daily schedule:

1. Go to the **Actions** tab in this repo.
2. Select **Sync with Google Apps Script**.
3. Click **Run workflow** → **Run workflow**.

### Secret setup

The workflow authenticates to clasp using a service account key stored in the `GOOGLE_SA_KEY` repository secret. To rotate it:

```bash
gh secret set GOOGLE_SA_KEY --repo EWB-Greater-Austin/gw-group-manager < ~/path/to/sa-key.json
```

## Config

All configuration lives at the top of `manage.gs`:

- `FORM_ID` — the Google Form bound to the `onFormSubmit` trigger
- `EMAIL_QUESTION_TITLE` — exact title of the form's email question
- `SUBSCRIPTIONS_QUESTION_TITLE` — exact title of the form's checkbox question
- `GROUPS` — map of checkbox option label → Google Group email, one entry per managed list
