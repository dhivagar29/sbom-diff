#!/usr/bin/env node
/**
 * Post or update a sticky PR comment from a validated sbom-diff artifact.
 * Never checks out PR code. Treats artifact as untrusted.
 *
 * Env:
 *   GITHUB_TOKEN   required
 *   GITHUB_API_URL optional (default https://api.github.com)
 *   GITHUB_REPOSITORY owner/repo
 *   SBOM_DIFF_ARTIFACT path to JSON
 *   SBOM_DIFF_PR       PR number (optional if in artifact.meta)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArtifact, MAX_ARTIFACT_BYTES } from './schema.js';
import { formatComment, COMMENT_MARKER } from './format.js';

export async function postStickyComment(opts) {
  const {
    token,
    apiUrl = 'https://api.github.com',
    repository,
    artifactPath,
    fetchImpl = globalThis.fetch,
  } = opts;

  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!repository || !repository.includes('/')) {
    throw new Error('repository must be owner/repo');
  }
  const [owner, repo] = repository.split('/');

  const buf = fs.readFileSync(artifactPath);
  if (buf.length > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artifact exceeds size cap (${buf.length} > ${MAX_ARTIFACT_BYTES})`);
  }
  const artifact = validateArtifact(buf.toString('utf8'), buf.length);
  const pr = Number(opts.pullRequestNumber || artifact.meta.pullRequestNumber);
  if (!pr) throw new Error('pull request number missing');

  const body = formatComment(artifact);
  // Cap comment body hard
  const capped = body.length > 60000 ? body.slice(0, 60000) + '\n\n_…truncated._\n' : body;

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sbom-diff',
  };

  const listUrl = `${apiUrl}/repos/${owner}/${repo}/issues/${pr}/comments?per_page=100`;
  const listRes = await fetchImpl(listUrl, { headers });
  if (!listRes.ok) {
    throw new Error(`List comments failed: HTTP ${listRes.status}`);
  }
  const comments = await listRes.json();
  const existing = (comments || []).find(
    (c) => typeof c.body === 'string' && c.body.includes(COMMENT_MARKER),
  );

  if (existing) {
    const url = `${apiUrl}/repos/${owner}/${repo}/issues/comments/${existing.id}`;
    const res = await fetchImpl(url, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: capped }),
    });
    if (!res.ok) throw new Error(`Update comment failed: HTTP ${res.status}`);
    return { action: 'updated', id: existing.id };
  }

  const createUrl = `${apiUrl}/repos/${owner}/${repo}/issues/${pr}/comments`;
  const res = await fetchImpl(createUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: capped }),
  });
  if (!res.ok) throw new Error(`Create comment failed: HTTP ${res.status}`);
  const created = await res.json();
  return { action: 'created', id: created.id };
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  postStickyComment({
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    repository: process.env.GITHUB_REPOSITORY,
    artifactPath: process.env.SBOM_DIFF_ARTIFACT || 'sbom-diff.json',
    pullRequestNumber: process.env.SBOM_DIFF_PR,
  })
    .then((r) => console.log(`Comment ${r.action}: ${r.id}`))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
