import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryOsv, attachVulns } from '../src/osv.js';

describe('queryOsv', () => {
  it('maps batch results with mock fetch', async () => {
    const fetchImpl = async (url, opts) => {
      assert.equal(url, 'https://api.osv.dev/v1/querybatch');
      const body = JSON.parse(opts.body);
      assert.equal(body.queries.length, 1);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{
            vulns: [{
              id: 'GHSA-35jh-r3h4-6jhm',
              summary: 'Prototype Pollution in lodash',
              severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L' }],
            }],
          }],
        }),
      };
    };
    const map = await queryOsv(
      [{ ecosystem: 'npm', name: 'lodash', version: '4.17.20' }],
      { fetchImpl, hydrate: false },
    );
    const vulns = map.get('npm|lodash|4.17.20');
    assert.equal(vulns.length, 1);
    assert.equal(vulns[0].id, 'GHSA-35jh-r3h4-6jhm');
  });

  it('skips docker and unsupported ecosystems', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, status: 200, json: async () => ({ results: [] }) }; };
    const map = await queryOsv(
      [{ ecosystem: 'GitHub Actions', name: 'docker://alpine', version: '3' }],
      { fetchImpl },
    );
    assert.equal(called, false);
    assert.equal(map.size, 0);
  });

  it('hydrates empty summaries via /v1/vulns/{id}', async () => {
    const fetchImpl = async (url, opts) => {
      if (String(url).includes('querybatch')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [{ vulns: [{ id: 'GHSA-35jh-r3h4-6jhm' }] }] }),
        };
      }
      assert.ok(String(url).includes('/v1/vulns/GHSA-35jh-r3h4-6jhm'));
      assert.equal(opts.method, 'GET');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'GHSA-35jh-r3h4-6jhm',
          summary: 'Prototype Pollution in lodash',
          database_specific: { severity: 'HIGH' },
        }),
      };
    };
    const map = await queryOsv(
      [{ ecosystem: 'npm', name: 'lodash', version: '4.17.20' }],
      { fetchImpl },
    );
    const v = map.get('npm|lodash|4.17.20')[0];
    assert.equal(v.summary, 'Prototype Pollution in lodash');
    assert.equal(v.severity, 'HIGH');
  });
});

describe('attachVulns', () => {
  it('attaches by eco|name|version', () => {
    const diff = {
      added: [{ ecosystem: 'npm', name: 'lodash', version: '4.17.20' }],
      removed: [],
      upgraded: [],
      downgraded: [],
    };
    const map = new Map([['npm|lodash|4.17.20', [{ id: 'X' }]]]);
    const out = attachVulns(diff, map);
    assert.equal(out.added[0].vulnerabilities[0].id, 'X');
  });
});
