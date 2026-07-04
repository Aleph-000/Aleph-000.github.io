# CI/CD Notes

## Current Deploy Flow

1. Edit content or code.
2. Run local CI:

```powershell
powershell -ExecutionPolicy Bypass -File tools\ci.ps1
```

3. Commit and push.
4. DigitalOcean Static Site pulls `/do-static` from GitHub and redeploys.

## Why The Workflow Is A Template

The current GitHub token used by the local environment may not have `workflow` scope. Pushing a file under `.github/workflows/` can be rejected by GitHub.

For now, the runnable workflow is stored as:

```text
docs/github-actions-static.yml.example
```

After refreshing GitHub CLI auth with workflow scope, copy it to:

```text
.github/workflows/static.yml
```

Then commit and push.

## Refresh GitHub Workflow Scope

```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' auth refresh -h github.com -s workflow
```
