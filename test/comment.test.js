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
  isGithubActionsBotComment,
  BOT_LOGIN,
  BOT_TYPE,
} from '../src/comment.js';
import { COMMENT_MARKER } from '../src/format.js';

const TRUSTED_SHA = 'abc123def456abc123def456abc123def456abcd';
const OTHER_SHA = 'ffffffffffffffffffffffffffffffffffffffff';

const botUser = { login: BOT_LOGIN, type: BOT_TYPE };
const humanUser = { login: 'alice', type: 'User' };

function writeArtifact(metaExtra = {}) {
  const art = buildArtifact({
    diff: {
      added: [{ ecosystem: 'npm', name: 'x', version: '1.0.0', change: 'added', vulnerabilities: [] }],
      removed: [], upgraded: [], downgraded: [],
    },
    meta: {
      pullRequestNumber: 999,
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

function mockFetch({
  pulls = [],
  headList = null,
  comments = null,
  existing = null,
} = {}) {
  const calls = [];
  let stickyList = comments;
  if (stickyList == null) {
    stickyList = existing ? [existing] : [];
  }
  let lastCreated = null;

  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method, body: opts.body });

    if (url.includes('/commits/') && url.includes('/pulls')) {
      return { ok: true, status: 200, json: async () => pulls };
    }
    // Fork fallback: GET /pulls?state=open&head=owner:branch
    if (url.includes('/pulls?') && url.includes('head=')) {
      return { ok: true, status: 200, json: async () => (headList == null ? [] : headList) };
    }
    if (url.includes('/comments') && method === 'GET') {
      return { ok: true, status: 200, json: async () => stickyList };
    }
    if (method === 'POST' && url.includes('/comments')) {
      lastCreated = {
        id: 2002,
        body: JSON.parse(opts.body).body,
        user: botUser,
      };
      stickyList = [...stickyList, lastCreated];
      return { ok: true, status: 201, json: async () => lastCreated };
    }
    if (method === 'PATCH') {
      const id = Number(url.split('/').pop());
      const updated = {
        id,
        body: JSON.parse(opts.body).body,
        user: botUser,
      };
      stickyList = stickyList.map((c) => (c.id === id ? updated : c));
      lastCreated = updated;
      return { ok: true, status: 200, json: async () => updated };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };

  return {
    fetchImpl,
    calls,
    getStickyList: () => stickyList,
    getLastCreated: () => lastCreated,
  };
}

describe('isGithubActionsBotComment', () => {
  it('requires marker and github-actions[bot]', () => {
    assert.equal(
      isGithubActionsBotComment({ body: `${COMMENT_MARKER}\nhi`, user: botUser }),
      true,
    );
    assert.equal(
      isGithubActionsBotComment({ body: `${COMMENT_MARKER}\nhi`, user: humanUser }),
      false,
    );
    assert.equal(
      isGithubActionsBotComment({ body: 'no marker', user: botUser }),
      false,
    );
  });
});

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

  it('falls back to open PRs by head owner:branch when commits/{sha}/pulls is empty', async () => {
    const { fetchImpl, calls } = mockFetch({
      pulls: [],
      headList: [
        {
          number: 77,
          state: 'open',
          head: {
            sha: TRUSTED_SHA,
            ref: 'feat-x',
            user: { login: 'forker' },
            repo: { name: 'demo' },
          },
        },
      ],
    });
    const n = await resolvePullRequestNumber({
      token: 't',
      owner: 'acme',
      repo: 'demo',
      headSha: TRUSTED_SHA,
      headOwner: 'forker',
      headBranch: 'feat-x',
      fetchImpl,
    });
    assert.equal(n, 77);
    assert.ok(calls.some((c) => c.url.includes('/pulls?') && c.url.includes(encodeURIComponent('forker:feat-x'))));
  });

  it('fork fallback rejects when listed PR head.sha does not match trusted SHA', async () => {
    const { fetchImpl } = mockFetch({
      pulls: [],
      headList: [
        {
          number: 77,
          state: 'open',
          head: {
            sha: OTHER_SHA,
            ref: 'feat-x',
            user: { login: 'forker' },
            repo: { name: 'demo' },
          },
        },
      ],
    });
    const n = await resolvePullRequestNumber({
      token: 't',
      owner: 'acme',
      repo: 'demo',
      headSha: TRUSTED_SHA,
      headOwner: 'forker',
      headBranch: 'feat-x',
      fetchImpl,
    });
    assert.equal(n, null);
  });
});

describe('postStickyComment', () => {
  it('creates then updates sticky comment using API-resolved PR', async () => {
    const { artifactPath } = writeArtifact();
    const { fetchImpl, calls, getLastCreated } = mockFetch({
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
    assert.ok(getLastCreated().body.includes(COMMENT_MARKER));
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

  it('ignores a human comment that contains the sticky marker and creates a bot comment', async () => {
    const { artifactPath } = writeArtifact();
    const humanMarker = {
      id: 55,
      body: `${COMMENT_MARKER}\n## spoofed by human`,
      user: humanUser,
    };
    const { fetchImpl, calls, getLastCreated, getStickyList } = mockFetch({
      pulls: [{
        number: 42,
        state: 'open',
        head: { sha: TRUSTED_SHA, user: { login: 'alice' }, repo: { name: 'demo' } },
      }],
      comments: [humanMarker],
    });

    const r = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      trustedHeadSha: TRUSTED_SHA,
      fetchImpl,
    });
    assert.equal(r.action, 'created');
    assert.equal(r.id, 2002);
    assert.ok(!calls.some((c) => c.method === 'PATCH'));
    assert.ok(calls.some((c) => c.method === 'POST'));
    assert.ok(getLastCreated().body.includes(COMMENT_MARKER));
    // Human spoof remains; new bot comment added
    assert.equal(getStickyList().length, 2);
    assert.equal(getStickyList()[0].user.login, 'alice');
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
    assert.equal(calls.length, 0);
  });

  it('skips commenting when no PR matches the trusted head SHA', async () => {
    const { artifactPath } = writeArtifact();
    const { fetchImpl, calls } = mockFetch({ pulls: [], headList: [] });

    const r = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      trustedHeadSha: TRUSTED_SHA,
      headOwner: 'forker',
      headBranch: 'feat-x',
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
