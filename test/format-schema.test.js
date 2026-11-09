import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildArtifact, validateArtifact, MAX_ARTIFACT_BYTES } from '../src/schema.js';
import { formatComment, esc, COMMENT_MARKER } from '../src/format.js';

describe('esc', () => {
  it('escapes html and pipes', () => {
    assert.equal(esc('a|b<script>'), 'a\\|b&lt;script&gt;');
  });
});

describe('schema', () => {
  const diff = {
    added: [{ ecosystem: 'npm', name: 'express', version: '4.18.2', change: 'added', vulnerabilities: [] }],
    removed: [{ ecosystem: 'npm', name: 'left-pad', version: '1.3.0', change: 'removed', vulnerabilities: [] }],
    upgraded: [],
    downgraded: [{
      ecosystem: 'npm', name: 'lodash', from: '4.17.21', to: '4.17.20', version: '4.17.20',
      change: 'downgraded',
      vulnerabilities: [{ id: 'GHSA-test', summary: 'test', severity: 'HIGH' }],
    }],
  };

  it('builds and validates', () => {
    const art = buildArtifact({ diff, meta: { pullRequestNumber: 7, repository: 'o/r' } });
    const raw = JSON.stringify(art);
    const v = validateArtifact(raw);
    assert.equal(v.summary.added, 1);
    assert.equal(v.summary.vulnerable, 1);
  });

  it('rejects oversized artifacts', () => {
    assert.throws(() => validateArtifact('{}', MAX_ARTIFACT_BYTES + 1));
  });

  it('rejects bad schema', () => {
    assert.throws(() => validateArtifact(JSON.stringify({ schemaVersion: 99, meta: {}, changes: {} })));
  });
});

describe('formatComment', () => {
  it('includes marker and escapes names', () => {
    const art = buildArtifact({
      diff: {
        added: [{
          ecosystem: 'npm',
          name: 'evil|pkg<script>',
          version: '1.0.0',
          change: 'added',
          vulnerabilities: [{ id: 'CVE-1', summary: 'x', severity: 'HIGH' }],
        }],
        removed: [],
        upgraded: [],
        downgraded: [],
      },
      meta: { pullRequestNumber: 1 },
    });
    const md = formatComment(art);
    assert.ok(md.startsWith(COMMENT_MARKER));
    assert.ok(md.includes('evil\\|pkg&lt;script&gt;'));
    assert.ok(md.includes('CVE-1'));
  });
});
