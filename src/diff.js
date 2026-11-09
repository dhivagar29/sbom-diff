/**
 * Compare two inventories into added / removed / upgraded / downgraded.
 */

export function diffInventories(baseItems, headItems) {
  const baseByEcoName = index(baseItems);
  const headByEcoName = index(headItems);

  const added = [];
  const removed = [];
  const upgraded = [];
  const downgraded = [];
  const unchanged = [];

  const keys = new Set([...baseByEcoName.keys(), ...headByEcoName.keys()]);
  for (const key of [...keys].sort()) {
    const [ecosystem, name] = key.split('\0');
    const b = baseByEcoName.get(key);
    const h = headByEcoName.get(key);
    if (!b && h) {
      for (const ver of h.versions) {
        added.push({
          ecosystem,
          name,
          version: ver,
          change: 'added',
          purl: h.byVersion.get(ver)?.purl,
          source: h.byVersion.get(ver)?.source,
        });
      }
      continue;
    }
    if (b && !h) {
      for (const ver of b.versions) {
        removed.push({
          ecosystem,
          name,
          version: ver,
          change: 'removed',
          purl: b.byVersion.get(ver)?.purl,
          source: b.byVersion.get(ver)?.source,
        });
      }
      continue;
    }
    // Both present — compare version sets. For simple case one version each.
    const bVers = [...b.versions].sort();
    const hVers = [...h.versions].sort();
    if (bVers.length === 1 && hVers.length === 1) {
      if (bVers[0] === hVers[0]) {
        unchanged.push({
          ecosystem,
          name,
          version: bVers[0],
          change: 'unchanged',
        });
      } else {
        const cmp = compareVersions(bVers[0], hVers[0]);
        const entry = {
          ecosystem,
          name,
          from: bVers[0],
          to: hVers[0],
          version: hVers[0],
          purl: h.byVersion.get(hVers[0])?.purl,
          source: h.byVersion.get(hVers[0])?.source,
        };
        if (cmp < 0) {
          upgraded.push({ ...entry, change: 'upgraded' });
        } else if (cmp > 0) {
          downgraded.push({ ...entry, change: 'downgraded' });
        } else {
          // Non-semver equal-ish but string-different — treat as upgraded
          upgraded.push({ ...entry, change: 'upgraded' });
        }
      }
      continue;
    }
    // Multi-version (e.g. go.sum retaining old+new): report set diff
    for (const ver of hVers) {
      if (!b.versions.has(ver)) {
        added.push({
          ecosystem,
          name,
          version: ver,
          change: 'added',
          purl: h.byVersion.get(ver)?.purl,
          source: h.byVersion.get(ver)?.source,
        });
      }
    }
    for (const ver of bVers) {
      if (!h.versions.has(ver)) {
        removed.push({
          ecosystem,
          name,
          version: ver,
          change: 'removed',
          purl: b.byVersion.get(ver)?.purl,
          source: b.byVersion.get(ver)?.source,
        });
      }
    }
  }

  return { added, removed, upgraded, downgraded, unchanged };
}

function index(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.ecosystem}\0${item.name}`;
    if (!map.has(key)) {
      map.set(key, { versions: new Set(), byVersion: new Map() });
    }
    const slot = map.get(key);
    slot.versions.add(item.version);
    slot.byVersion.set(item.version, item);
  }
  return map;
}

/**
 * Rough semver/numeric compare. Returns <0 if a<b, >0 if a>b, 0 if equal or incomparable.
 */
export function compareVersions(a, b) {
  if (a === b) return 0;
  const pa = splitVer(a);
  const pb = splitVer(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? { num: 0, rest: '' };
    const y = pb[i] ?? { num: 0, rest: '' };
    if (x.num !== y.num) return x.num < y.num ? -1 : 1;
    if (x.rest !== y.rest) return x.rest < y.rest ? -1 : 1;
  }
  return 0;
}

function splitVer(v) {
  // Strip common prefixes (v1.2.3, go1.2.3)
  const s = String(v).replace(/^v/i, '').replace(/^go/i, '');
  return s.split(/[+.-]/).map((part) => {
    const m = part.match(/^(\d+)(.*)$/);
    if (m) return { num: Number(m[1]), rest: m[2] };
    return { num: 0, rest: part };
  });
}

/** Packages that need OSV lookup: added + upgraded (+ downgraded) at head version */
export function packagesForOsv(diff) {
  const list = [];
  for (const p of [...diff.added, ...diff.upgraded, ...diff.downgraded]) {
    list.push({
      ecosystem: osvEcosystem(p.ecosystem),
      name: p.name,
      version: p.to || p.version,
    });
  }
  // Unique
  const seen = new Set();
  return list.filter((p) => {
    const k = `${p.ecosystem}|${p.name}|${p.version}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function osvEcosystem(eco) {
  if (eco === 'npm') return 'npm';
  if (eco === 'PyPI') return 'PyPI';
  if (eco === 'Go') return 'Go';
  // github-actions: OSV has limited coverage; still query as npm-incompatible
  // Use "GitHub Actions" ecosystem when available; fall back to skipping in osv.js
  if (eco === 'github-actions') return 'GitHub Actions';
  return eco;
}
