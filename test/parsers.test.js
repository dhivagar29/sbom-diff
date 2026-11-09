import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryFromNpm } from '../src/parsers/npm.js';
import {
  inventoryFromRequirements,
  inventoryFromPoetry,
} from '../src/parsers/python.js';
import { inventoryFromGoSum } from '../src/parsers/go.js';
import { inventoryFromWorkflows, parseWorkflowUses } from '../src/parsers/gha.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fx = (...p) => path.join(__dirname, 'fixtures', ...p);
const read = (...p) => fs.readFileSync(fx(...p), 'utf8');

describe('npm parser', () => {
  it('parses lockfile v3 packages', () => {
    const inv = inventoryFromNpm(read('base', 'npm', 'package-lock.json'));
    const names = inv.map((i) => i.name).sort();
    assert.deepEqual(names, ['left-pad', 'lodash']);
    assert.equal(inv.find((i) => i.name === 'lodash').version, '4.17.21');
  });

  it('detects vulnerable lodash in head', () => {
    const inv = inventoryFromNpm(read('head', 'npm', 'package-lock.json'));
    assert.equal(inv.find((i) => i.name === 'lodash').version, '4.17.20');
    assert.ok(inv.find((i) => i.name === 'express'));
  });
});

describe('python requirements parser', () => {
  it('parses pinned requirements', () => {
    const inv = inventoryFromRequirements(read('base', 'python-req', 'requirements.txt'));
    assert.equal(inv.find((i) => i.name === 'requests').version, '2.31.0');
    assert.equal(inv.find((i) => i.name === 'urllib3').version, '2.0.7');
  });

  it('normalizes PyYAML name', () => {
    const inv = inventoryFromRequirements(read('head', 'python-req', 'requirements.txt'));
    assert.ok(inv.find((i) => i.name === 'pyyaml'));
  });
});

describe('poetry parser', () => {
  it('parses [[package]] blocks', () => {
    const inv = inventoryFromPoetry(read('base', 'python-poetry', 'poetry.lock'));
    assert.equal(inv.find((i) => i.name === 'flask').version, '2.3.2');
    assert.equal(inv.find((i) => i.name === 'jinja2').version, '3.1.2');
  });
});

describe('go.sum parser', () => {
  it('dedupes /go.mod lines', () => {
    const inv = inventoryFromGoSum(read('base', 'go', 'go.sum'));
    assert.equal(inv.length, 2);
    assert.ok(inv.find((i) => i.name === 'github.com/google/uuid' && i.version === 'v1.3.0'));
  });
});

describe('gha parser', () => {
  it('extracts uses refs and skips local', () => {
    const text = `
jobs:
  x:
    steps:
      - uses: actions/checkout@v4
      - uses: ./local-action
      - uses: "aquasecurity/trivy-action@0.20.0"
`;
    const items = parseWorkflowUses(text);
    assert.equal(items.length, 2);
    assert.ok(items.find((i) => i.name === 'actions/checkout' && i.version === 'v4'));
  });

  it('reads workflow files map', () => {
    const files = {
      '.github/workflows/ci.yml': read('head', 'gha', '.github/workflows/ci.yml'),
    };
    const inv = inventoryFromWorkflows(files);
    assert.ok(inv.find((i) => i.name === 'aquasecurity/trivy-action'));
  });
});
