/**
 * Walk a tree root and collect dependency inventories from known manifests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { inventoryFromNpm } from './parsers/npm.js';
import {
  inventoryFromRequirements,
  inventoryFromPoetry,
} from './parsers/python.js';
import { inventoryFromGoSum } from './parsers/go.js';
import { inventoryFromWorkflows } from './parsers/gha.js';

const MANIFEST_NAMES = new Set([
  'package-lock.json',
  'requirements.txt',
  'poetry.lock',
  'go.sum',
]);

export function collectInventory(rootDir) {
  const items = [];
  const workflowFiles = {};

  walk(rootDir, rootDir, (abs, rel) => {
    const base = path.basename(abs);
    if (MANIFEST_NAMES.has(base)) {
      const text = fs.readFileSync(abs, 'utf8');
      if (base === 'package-lock.json') {
        items.push(...annotate(inventoryFromNpm(text), rel));
      } else if (base === 'requirements.txt') {
        items.push(...annotate(inventoryFromRequirements(text), rel));
      } else if (base === 'poetry.lock') {
        items.push(...annotate(inventoryFromPoetry(text), rel));
      } else if (base === 'go.sum') {
        items.push(...annotate(inventoryFromGoSum(text), rel));
      }
    }
    if (
      (rel.includes('.github/workflows/') || rel.includes('.github\\workflows\\')) &&
      /\.(yml|yaml)$/i.test(base)
    ) {
      workflowFiles[rel.replace(/\\/g, '/')] = fs.readFileSync(abs, 'utf8');
    }
  });

  items.push(...inventoryFromWorkflows(workflowFiles));
  return dedupe(items);
}

function annotate(list, source) {
  return list.map((i) => ({ ...i, source }));
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.ecosystem}|${item.name}|${item.version}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((a, b) =>
    a.ecosystem.localeCompare(b.ecosystem) ||
    a.name.localeCompare(b.name) ||
    a.version.localeCompare(b.version),
  );
}

function walk(dir, root, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const abs = path.join(dir, ent.name);
    const rel = path.relative(root, abs);
    if (ent.isDirectory()) {
      walk(abs, root, onFile);
    } else if (ent.isFile()) {
      onFile(abs, rel);
    }
  }
}
