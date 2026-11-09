import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArtifact } from '../src/schema.js';
import {
  postStickyComment,
  resolvePullRequestNumber,
  ArtifactTrustError,
} from '../src/comment.js';
import { COMMENT_MARKER } from '../src/format.js';

const TRUSTED_SHA = 'abc123def456abc123def456abc123def456abcd';

function writeArtifact(metaExtra = {}) {
  const art = buildArtifact({
    diff: {
      added: [{ ecosystem: 'npm', name: 'x', version: '1.0.0', change: 'added', vulnerabilities: [] }],
      removed: [], upgraded: [], downgraded: [],
    },
    meta: {
      pullRequestNumber: 999, // forged — must be ignored
      repository: 'acme/demo',
      headSha: TRUSTED_SHA,
      ...metaExtra,
    },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-diff-'));
  const artifactPath = path.join(dir, 'a.json');
  fs.writeFileSync(artifactPath, JSON.stringify(art));
  return { art, artifactPath };
}

function mockFetch({ pulls = [], existing = null } = {}) {
  const calls = [];
  let sticky = existing;
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method, body: opts.body });
    if (url.includes('/commits/') && url.includes('/pulls')) {
      return { ok: true, status: 200, json: async () => pulls };
    }
    if (url.includes('/comments') && method === 'GET') {
      return { ok: true, status: 200, json: async () => (sticky ? [sticky] : []) };
    }
    if (method === 'POST' && url.includes('/comments')) {
      sticky = { id: 1001, body: JSON.parse(opts.body).body };
      return { ok: true, status: 201, json: async () => sticky };
    }
    if (method === 'PATCH') {
      sticky = { id: sticky?.id || 1001, body: JSON.parse(opts.body).body };
      return { ok: true, status: 200, json: async () => sticky };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  return { fetchImpl, calls, getSticky: () => sticky };
}

describe('resolvePullRequestNumber', () => {
  it('returns matching open PR for head SHA', async () => {
    const { fetchImpl } = mockFetch({
      pulls: [
        {
          number: 42,
          state: 'open',
          head: { sha: TRUSTED_SHA, user: { login: 'forker' }, repo: { name: 'demo' } },
        },
      ],
    });
    const n = await resolvePullRequestNumber({
      token: 't',
      owner: 'acme',
      repo: 'demo',
      headSha: TRUSTED_SHA,
      headOwner: 'forker',
      fetchImpl,
    });
    assert.equal(n, 42);
  });
});

describe('postStickyComment', () => {
  it('creates then updates sticky comment using API-resolved PR', async () => {
    const { artifactPath } = writeArtifact();
    const { fetchImpl, calls, getSticky } = mockFetch({
      pulls: [{
        number: 42,
        state: 'open',
        head: { sha: TRUSTED_SHA, user: { login: 'alice' }, repo: { name: 'demo' } },
      }],
    });

    const r1 = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      trustedHeadSha: TRUSTED_SHA,
      fetchImpl,
    });
    assert.equal(r1.action, 'created');
    assert.equal(r1.pullRequestNumber, 42);
    assert.ok(getSticky().body.includes(COMMENT_MARKER));
    assert.ok(calls.some((c) => c.url.includes('/issues/42/comments')));

    const r2 = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      trustedHeadSha: TRUSTED_SHA,
      fetchImpl,
    });
    assert.equal(r2.action, 'updated');
    assert.ok(calls.some((c) => c.method === 'PATCH'));
  });

  it('ignores a forged PR number in the artifact', async () => {
    const { artifactPath } = writeArtifact({ pullRequestNumber: 999 });
    const { fetchImpl, calls } = mockFetch({
      pulls: [{
        number: 42,
        state: 'open',
        head: { sha: TRUSTED_SHA, user: { login: 'alice' }, repo: { name: 'demo' } },
      }],
    });

    const r = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      trustedHeadSha: TRUSTED_SHA,
      fetchImpl,
    });
    assert.equal(r.action, 'created');
    assert.equal(r.pullRequestNumber, 42);
    assert.equal(r.ignoredArtifactPr, 999);
    assert.ok(calls.every((c) => !c.url.includes('/issues/999/')));
    assert.ok(calls.some((c) => c.url.includes('/issues/42/')));
  });

  it('rejects when artifact head SHA does not match trusted workflow_run head_sha', async () => {
    const { artifactPath } = writeArtifact({ headSha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
    const { fetchImpl, calls } = mockFetch({
      pulls: [{ number: 42, state: 'open', head: { sha: TRUSTED_SHA } }],
    });

    await assert.rejects(
      () => postStickyComment({
        token: 't',
        repository: 'acme/demo',
        artifactPath,
        trustedHeadSha: TRUSTED_SHA,
        fetchImpl,
      }),
      (err) => {
        assert.ok(err instanceof ArtifactTrustError);
        assert.match(err.message, /head SHA mismatch/i);
        return true;
      },
    );
    // Must not resolve PR or post when SHA check fails
    assert.equal(calls.length, 0);
  });

  it('skips commenting when no PR matches the trusted head SHA', async () => {
    const { artifactPath } = writeArtifact();
    const { fetchImpl, calls } = mockFetch({ pulls: [] });

    const r = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      trustedHeadSha: TRUSTED_SHA,
      fetchImpl,
    });
    assert.equal(r.action, 'skipped');
    assert.equal(r.reason, 'no-matching-pr');
    assert.ok(!calls.some((c) => c.method === 'POST' || c.method === 'PATCH'));
  });

  it('requires trustedHeadSha', async () => {
    const { artifactPath } = writeArtifact();
    await assert.rejects(
      () => postStickyComment({
        token: 't',
        repository: 'acme/demo',
        artifactPath,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }),
      }),
      ArtifactTrustError,
    );
  });
});
