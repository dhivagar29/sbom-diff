import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArtifact } from '../src/schema.js';
import { postStickyComment } from '../src/comment.js';
import { COMMENT_MARKER } from '../src/format.js';

describe('postStickyComment', () => {
  it('creates then updates sticky comment', async () => {
    const art = buildArtifact({
      diff: {
        added: [{ ecosystem: 'npm', name: 'x', version: '1.0.0', change: 'added', vulnerabilities: [] }],
        removed: [], upgraded: [], downgraded: [],
      },
      meta: { pullRequestNumber: 42, repository: 'acme/demo' },
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-diff-'));
    const artifactPath = path.join(dir, 'a.json');
    fs.writeFileSync(artifactPath, JSON.stringify(art));

    const calls = [];
    let existing = null;
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body });
      if (url.includes('/comments') && !opts.method) {
        return { ok: true, status: 200, json: async () => (existing ? [existing] : []) };
      }
      if (opts.method === 'POST') {
        existing = { id: 1001, body: JSON.parse(opts.body).body };
        return { ok: true, status: 201, json: async () => existing };
      }
      if (opts.method === 'PATCH') {
        existing = { id: 1001, body: JSON.parse(opts.body).body };
        return { ok: true, status: 200, json: async () => existing };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };

    const r1 = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      fetchImpl,
    });
    assert.equal(r1.action, 'created');
    assert.ok(existing.body.includes(COMMENT_MARKER));

    const r2 = await postStickyComment({
      token: 't',
      repository: 'acme/demo',
      artifactPath,
      fetchImpl,
    });
    assert.equal(r2.action, 'updated');
    assert.ok(calls.some((c) => c.method === 'PATCH'));
  });
});
