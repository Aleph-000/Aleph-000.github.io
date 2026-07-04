# CI/CD Notes

## Current Deploy Flow

1. Edit content or code.
2. Run local CI:

```powershell
powershell -ExecutionPolicy Bypass -File tools\ci.ps1
```

3. Commit and push.
4. GitHub Actions runs `.github/workflows/ci.yml`.
5. For Aliyun deployment, manually run the `Deploy Aliyun` workflow after the CI job passes.

The current practical CI/CD path is:

- CI: `.github/workflows/ci.yml` runs API tests, Hexo build, Docker Compose validation, and API image build.
- Local gate: `tools/ci.ps1` runs the same practical checks before push and syncs generated static files.
- CD: `.github/workflows/deploy-aliyun.yml` is a manual deployment workflow for the current Aliyun ECS server.
- Static fallback: GitHub Pages can still serve the generated root static files.

## Aliyun Deployment Secrets

The manual deployment workflow requires these GitHub repository secrets:

- `ALIYUN_HOST`: the ECS public IP or domain, currently `aleph-null.cc`
- `ALIYUN_SSH_PRIVATE_KEY`: the private key that can SSH as `root`

The workflow does not upload `.env`; production secrets stay on the server at:

```text
/opt/aleph-blog/.env
```

## Workflow Scope

Pushing workflow files requires the local GitHub token to have `workflow` scope.
If `git push` is rejected because `.github/workflows/*` changed, refresh GitHub
CLI auth:

## Refresh GitHub Workflow Scope

```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' auth refresh -h github.com -s workflow
```
