#!/usr/bin/env node
/**
 * Post or update a sticky PR comment from a validated sbom-diff artifact.
 * Never checks out PR code. Treats artifact as untrusted.
 *
 * The pull request number MUST come from a trusted resolution against
 * workflow_run.head_sha (never from artifact.meta.pullRequestNumber).
 *
 * Env:
 *   GITHUB_TOKEN                required
 *   GITHUB_API_URL              optional (default https://api.github.com)
 *   GITHUB_REPOSITORY           owner/repo (base repo that received the PR)
 *   SBOM_DIFF_ARTIFACT          path to JSON
 *   SBOM_DIFF_TRUSTED_HEAD_SHA  required — github.event.workflow_run.head_sha
 *   SBOM_DIFF_HEAD_OWNER        optional — workflow_run.head_repository.owner.login
 *   SBOM_DIFF_HEAD_REPO         optional — workflow_run.head_repository.name
 *   SBOM_DIFF_HEAD_BRANCH       optional — workflow_run.head_branch (fork fallback)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArtifact, MAX_ARTIFACT_BYTES } from './schema.js';
import { formatComment, COMMENT_MARKER } from './format.js';

export const BOT_LOGIN = 'github-actions[bot]';
export const BOT_TYPE = 'Bot';

export class ArtifactTrustError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArtifactTrustError';
  }
}

export function isGithubActionsBotComment(comment) {
  if (!comment || typeof comment.body !== 'string') return false;
  if (!comment.body.includes(COMMENT_MARKER)) return false;
  const user = comment.user;
  if (!user || typeof user !== 'object') return false;
  return user.login === BOT_LOGIN && user.type === BOT_TYPE;
}

function authHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sbom-diff',
  };
}

function filterPullsByHead(pulls, { headSha, headOwner, headRepo }) {
  return (pulls || []).filter((pr) => {
    const sha = pr.head && pr.head.sha;
    if (sha !== headSha) return false;
    if (headOwner && pr.head && pr.head.user && pr.head.user.login) {
      if (pr.head.user.login !== headOwner) return false;
    }
    if (headRepo && pr.head && pr.head.repo && pr.head.repo.name) {
      if (pr.head.repo.name !== headRepo) return false;
    }
    return true;
  });
}

function pickPrNumber(matches) {
  if (!matches.length) return null;
  const open = matches.find((p) => p.state === 'open');
  return Number((open || matches[0]).number) || null;
}

/**
 * Resolve the PR number for a head commit via the GitHub API.
 * Never trusts artifact.meta.pullRequestNumber.
 *
 * 1) GET /repos/{owner}/{repo}/commits/{sha}/pulls
 * 2) If empty and headOwner+headBranch are set: GET …/pulls?state=open&head=owner:branch
 *    and accept only a PR whose head.sha equals the trusted SHA.
 */
export async function resolvePullRequestNumber({
  apiUrl = 'https://api.github.com',
  owner,
  repo,
  headSha,
  headOwner,
  headRepo,
  headBranch,
  fetchImpl = globalThis.fetch,
  token,
}) {
  if (!headSha) throw new ArtifactTrustError('trusted head SHA is required');

  const headers = authHeaders(token);

  const byCommitUrl = `${apiUrl}/repos/${owner}/${repo}/commits/${encodeURIComponent(headSha)}/pulls`;
  const byCommitRes = await fetchImpl(byCommitUrl, { headers });
  if (!byCommitRes.ok) {
    throw new Error(`Resolve PR by SHA failed: HTTP ${byCommitRes.status}`);
  }
  const byCommit = await byCommitRes.json();
  if (Array.isArray(byCommit) && byCommit.length > 0) {
    const matches = filterPullsByHead(byCommit, { headSha, headOwner, headRepo });
    const n = pickPrNumber(matches);
    if (n) return n;
  }

  // Fork fallback: list open PRs by head owner:branch, then require exact head.sha.
  if (headOwner && headBranch) {
    const headParam = `${headOwner}:${headBranch}`;
    const listUrl = `${apiUrl}/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(headParam)}&per_page=20`;
    const listRes = await fetchImpl(listUrl, { headers });
    if (!listRes.ok) {
      throw new Error(`Resolve PR by head ref failed: HTTP ${listRes.status}`);
    }
    const listed = await listRes.json();
    const matches = filterPullsByHead(listed, { headSha, headOwner, headRepo });
    const n = pickPrNumber(matches);
    if (n) return n;
  }

  return null;
}

export async function postStickyComment(opts) {
  const {
    token,
    apiUrl = 'https://api.github.com',
    repository,
    artifactPath,
    trustedHeadSha,
    headOwner,
    headRepo,
    headBranch,
    fetchImpl = globalThis.fetch,
  } = opts;

  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!repository || !repository.includes('/')) {
    throw new Error('repository must be owner/repo');
  }
  if (!trustedHeadSha) {
    throw new ArtifactTrustError('SBOM_DIFF_TRUSTED_HEAD_SHA (workflow_run.head_sha) is required');
  }

  const [owner, repo] = repository.split('/');

  const buf = fs.readFileSync(artifactPath);
  if (buf.length > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artifact exceeds size cap (${buf.length} > ${MAX_ARTIFACT_BYTES})`);
  }
  const artifact = validateArtifact(buf.toString('utf8'), buf.length);

  const recorded = String(artifact.meta.headSha || '');
  if (!recorded || recorded !== String(trustedHeadSha)) {
    throw new ArtifactTrustError(
      `Artifact head SHA mismatch: recorded=${recorded || '(empty)'} trusted=${trustedHeadSha}`,
    );
  }

  // Intentionally ignore artifact.meta.pullRequestNumber — a fork can forge it.
  const forgedHint = artifact.meta.pullRequestNumber;
  const pr = await resolvePullRequestNumber({
    apiUrl,
    owner,
    repo,
    headSha: trustedHeadSha,
    headOwner,
    headRepo,
    headBranch,
    fetchImpl,
    token,
  });

  if (!pr) {
    return {
      action: 'skipped',
      reason: 'no-matching-pr',
      ignoredArtifactPr: forgedHint || null,
    };
  }

  const body = formatComment(artifact);
  const capped = body.length > 60000 ? `${body.slice(0, 60000)}\n\n_…truncated._\n` : body;

  const headers = authHeaders(token);

  const listUrl = `${apiUrl}/repos/${owner}/${repo}/issues/${pr}/comments?per_page=100`;
  const listRes = await fetchImpl(listUrl, { headers });
  if (!listRes.ok) {
    throw new Error(`List comments failed: HTTP ${listRes.status}`);
  }
  const comments = await listRes.json();
  const existing = (comments || []).find(isGithubActionsBotComment);

  if (existing) {
    const patchUrl = `${apiUrl}/repos/${owner}/${repo}/issues/comments/${existing.id}`;
    const res = await fetchImpl(patchUrl, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: capped }),
    });
    if (!res.ok) throw new Error(`Update comment failed: HTTP ${res.status}`);
    return {
      action: 'updated',
      id: existing.id,
      pullRequestNumber: pr,
      ignoredArtifactPr: forgedHint && Number(forgedHint) !== pr ? forgedHint : null,
    };
  }

  const createUrl = `${apiUrl}/repos/${owner}/${repo}/issues/${pr}/comments`;
  const res = await fetchImpl(createUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: capped }),
  });
  if (!res.ok) throw new Error(`Create comment failed: HTTP ${res.status}`);
  const created = await res.json();
  return {
    action: 'created',
    id: created.id,
    pullRequestNumber: pr,
    ignoredArtifactPr: forgedHint && Number(forgedHint) !== pr ? forgedHint : null,
  };
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  postStickyComment({
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    repository: process.env.GITHUB_REPOSITORY,
    artifactPath: process.env.SBOM_DIFF_ARTIFACT || 'sbom-diff.json',
    trustedHeadSha: process.env.SBOM_DIFF_TRUSTED_HEAD_SHA,
    headOwner: process.env.SBOM_DIFF_HEAD_OWNER || undefined,
    headRepo: process.env.SBOM_DIFF_HEAD_REPO || undefined,
    headBranch: process.env.SBOM_DIFF_HEAD_BRANCH || undefined,
  })
    .then((r) => {
      if (r.action === 'skipped') {
        console.log(`Comment skipped: ${r.reason}`);
        return;
      }
      console.log(`Comment ${r.action}: ${r.id} on PR #${r.pullRequestNumber}`);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
