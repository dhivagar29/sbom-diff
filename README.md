# sbom-diff

GitHub Action that comments on each pull request with the dependencies the PR **adds**, **removes**, or **upgrades**, plus any known vulnerabilities from the free [OSV](https://osv.dev) API.

Built as a personal DevSecOps portfolio project. Zero npm runtime dependencies. Node 20. MIT licensed.

## What it covers

| Ecosystem | Manifests |
| --- | --- |
| npm | `package-lock.json` (lockfileVersion 1–3) |
| Python | `requirements.txt` (`name==version`), `poetry.lock` |
| Go | `go.sum` |
| GitHub Actions | `uses:` refs under `.github/workflows/` |

## Sample comment

Rendered from the real fixture run in [`docs/sample-comment.md`](docs/sample-comment.md) (lodash **4.17.20** is intentional):

````markdown
<!-- sbom-diff-sticky -->
## sbom-diff

Dependency changes on this PR: **5** added, **3** removed, **2** upgraded, **3** downgraded.

⚠️ **6** changed package(s) have known vulnerabilities in OSV.

### Downgraded

| Ecosystem | Package | From | To | Vulns |
| --- | --- | --- | --- | --- |
| npm | lodash | 4.17.21 | 4.17.20 | GHSA-29mw-wpgm-hmr9, GHSA-35jh-r3h4-6jhm, GHSA-r5fr-rjxr-66jc +1 |

<details>
<summary>Vulnerability details (2)</summary>

**lodash@4.17.20** (npm)
- GHSA-29mw-wpgm-hmr9 — CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L — Regular Expression Denial of Service (ReDoS) in lodash
- GHSA-35jh-r3h4-6jhm — CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H — Command Injection in lodash
</details>
````

Full tables for all ecosystems are in the sample file.

## Security design: two workflows

`pull_request_target` is intentionally **not** used. A compromised PR branch must never get a write token or have its code executed with elevated trust.

| | Workflow A (`sbom-diff`) | Workflow B (`sbom-diff-comment`) |
| --- | --- | --- |
| Trigger | `pull_request` | `workflow_run` (A completed) |
| Permissions | `contents: read` | `actions: read`, `pull-requests: write` |
| Checks out PR code? | Yes, read-only, no credentials | **Never** |
| Does | Checkout **default branch** (trusted action) at workspace root; checkout PR base/head as data only; diff manifests, query OSV, upload JSON artifact | Download artifact, reject if `meta.headSha` ≠ `workflow_run.head_sha`, resolve PR via API by that SHA (**never** the number in the artifact), escape markdown, post/update one sticky comment |

The comment job treats the artifact as untrusted input: size cap (512 KiB), schema version check, field length limits, and HTML/markdown escaping before the body is posted. It also **rejects** the artifact when `meta.headSha` does not equal `github.event.workflow_run.head_sha`, then finds the PR with `GET /repos/{owner}/{repo}/commits/{sha}/pulls` (optionally filtered by head owner/repo). A forged `pullRequestNumber` inside the artifact is ignored.

Workflow A checks out the repository **default branch** at the workspace root so `uses: ./` runs the trusted action code, not whatever the PR branch contains. The PR base and head SHAs are checked out only under `base/` and `head/` as read-only data (`persist-credentials: false`).

## Usage

Copy the two workflows from [`.github/workflows/`](.github/workflows/), then point the `uses:` lines at a **full commit SHA** of this action (not a floating tag).

```yaml
# .github/workflows/sbom-diff.yml  (Workflow A)
# 1) checkout default branch at workspace root (trusted action)
# 2) checkout PR base → base/ and PR head → head/ (data only)
- uses: ./   # or dhivagar29/sbom-diff@<full-commit-sha> when consuming elsewhere
  with:
    base-path: base
    head-path: head
    output-path: sbom-diff.json
    head-sha: ${{ github.event.pull_request.head.sha }}
```

```yaml
# .github/workflows/sbom-diff-comment.yml  (Workflow B)
- uses: ./sbom-diff/actions/comment   # after trusted default-branch checkout
  # or: dhivagar29/sbom-diff/actions/comment@<full-commit-sha>
  with:
    artifact-path: ./artifact/sbom-diff.json
    trusted-head-sha: ${{ github.event.workflow_run.head_sha }}
    head-owner: ${{ github.event.workflow_run.head_repository.owner.login }}
    head-repo: ${{ github.event.workflow_run.head_repository.name }}
```

Pin every third-party action the same way (examples in the workflow files already use full SHAs with version tags in comments).

### Local CLI

```bash
node src/cli.js \
  --base path/to/base-tree \
  --head path/to/head-tree \
  --out sbom-diff.json \
  --markdown comment.md
```

Flags: `--skip-osv`, `--repository owner/repo`, `--pr N`, and base/head ref/sha metadata.

### Tests

```bash
npm test
```

No install step — dependencies are empty and `package-lock.json` is committed.

## Limits

- Only the listed manifests. No transitive resolution beyond what the lockfile already contains. No Maven/Gradle, Cargo, or RubyGems yet.
- `requirements.txt` only matches exact `name==version` pins.
- `poetry.lock` parsing is a small TOML subset for `[[package]]` name/version.
- Go multi-version lines in `go.sum` are keyed per `module@version`; replacing a version shows as remove+add when both differ as sets, or upgrade when a single version flips.
- GitHub Actions `uses:` are line-scanned (no full YAML parser). Local actions (`./…`) are ignored. OSV coverage for Actions is sparse.
- OSV is queried only for **added / upgraded / downgraded** packages (not removed). `querybatch` returns IDs; up to 30 IDs are hydrated via `/v1/vulns/{id}` for summaries. Network failure fails the compute job.
- Artifact and comment bodies are size-capped; very large diffs truncate in the comment.
- Not a full SBOM generator (CycloneDX/SPDX). Name is aspirational: it is a **dependency diff + OSV** check.

## Licence

[MIT](LICENSE)
