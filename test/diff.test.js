import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectInventory } from '../src/collect.js';
import { diffInventories, compareVersions, packagesForOsv } from '../src/diff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fx = (...p) => path.join(__dirname, 'fixtures', ...p);

describe('compareVersions', () => {
  it('orders semver', () => {
    assert.ok(compareVersions('4.17.20', '4.17.21') < 0);
    assert.ok(compareVersions('3.0.0', '2.3.2') > 0);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  });
});

describe('diffInventories npm fixture', () => {
  it('reports added, removed, downgraded', () => {
    const base = collectInventory(fx('base', 'npm'));
    const head = collectInventory(fx('head', 'npm'));
    const d = diffInventories(base, head);
    assert.ok(d.added.find((p) => p.name === 'express' && p.version === '4.18.2'));
    assert.ok(d.removed.find((p) => p.name === 'left-pad'));
    assert.ok(d.downgraded.find((p) => p.name === 'lodash' && p.from === '4.17.21' && p.to === '4.17.20'));
  });
});

describe('diffInventories python-req', () => {
  it('reports changes', () => {
    const d = diffInventories(
      collectInventory(fx('base', 'python-req')),
      collectInventory(fx('head', 'python-req')),
    );
    assert.ok(d.added.find((p) => p.name === 'pyyaml'));
    assert.ok(d.removed.find((p) => p.name === 'urllib3'));
    assert.ok(d.downgraded.find((p) => p.name === 'requests'));
  });
});

describe('diffInventories poetry', () => {
  it('upgrades flask, swaps jinja2 for werkzeug', () => {
    const d = diffInventories(
      collectInventory(fx('base', 'python-poetry')),
      collectInventory(fx('head', 'python-poetry')),
    );
    assert.ok(d.upgraded.find((p) => p.name === 'flask' && p.to === '3.0.0'));
    assert.ok(d.removed.find((p) => p.name === 'jinja2'));
    assert.ok(d.added.find((p) => p.name === 'werkzeug'));
  });
});

describe('diffInventories go', () => {
  it('upgrades uuid and adds logrus', () => {
    const d = diffInventories(
      collectInventory(fx('base', 'go')),
      collectInventory(fx('head', 'go')),
    );
    // go.sum keeps versions as distinct entries when both present;
    // our fixture replaces uuid version entirely
    const uuidRemoved = d.removed.find((p) => p.name === 'github.com/google/uuid');
    const uuidAdded = d.added.find((p) => p.name === 'github.com/google/uuid');
    // With single-version-per-name upgrade path:
    const uuidUp = d.upgraded.find((p) => p.name === 'github.com/google/uuid');
    assert.ok(uuidUp || (uuidRemoved && uuidAdded), 'uuid should change');
    assert.ok(d.added.find((p) => p.name === 'github.com/sirupsen/logrus'));
  });
});

describe('diffInventories gha', () => {
  it('detects new action and checkout pin change', () => {
    const d = diffInventories(
      collectInventory(fx('base', 'gha')),
      collectInventory(fx('head', 'gha')),
    );
    assert.ok(d.added.find((p) => p.name === 'aquasecurity/trivy-action'));
    // checkout version string changed v4 -> sha
    const checkoutChange =
      d.upgraded.find((p) => p.name === 'actions/checkout') ||
      d.downgraded.find((p) => p.name === 'actions/checkout') ||
      (d.removed.find((p) => p.name === 'actions/checkout') &&
        d.added.find((p) => p.name === 'actions/checkout'));
    assert.ok(checkoutChange);
  });
});

describe('packagesForOsv', () => {
  it('includes added and upgraded only at head versions', () => {
    const d = diffInventories(
      collectInventory(fx('base', 'npm')),
      collectInventory(fx('head', 'npm')),
    );
    const pkgs = packagesForOsv(d);
    assert.ok(pkgs.find((p) => p.name === 'lodash' && p.version === '4.17.20'));
    assert.ok(pkgs.find((p) => p.name === 'express'));
    assert.ok(!pkgs.find((p) => p.name === 'left-pad'));
  });
});
