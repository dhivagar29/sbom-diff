/**
 * Validate sbom-diff JSON artifact. Comment workflow must treat content as untrusted.
 */

export const SCHEMA_VERSION = 1;
export const MAX_ARTIFACT_BYTES = 512 * 1024; // 512 KiB
export const MAX_PACKAGES = 2000;
export const MAX_VULNS_PER_PACKAGE = 50;
export const MAX_STRING = 500;

export function buildArtifact({ diff, meta }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    meta: {
      baseRef: String(meta.baseRef || ''),
      headRef: String(meta.headRef || ''),
      baseSha: String(meta.baseSha || ''),
      headSha: String(meta.headSha || ''),
      repository: String(meta.repository || ''),
      pullRequestNumber: Number(meta.pullRequestNumber) || 0,
    },
    summary: {
      added: diff.added.length,
      removed: diff.removed.length,
      upgraded: diff.upgraded.length,
      downgraded: diff.downgraded.length,
      vulnerable: countVulnerable(diff),
    },
    changes: {
      added: diff.added.map(sanitizePkg),
      removed: diff.removed.map(sanitizePkg),
      upgraded: diff.upgraded.map(sanitizePkg),
      downgraded: diff.downgraded.map(sanitizePkg),
    },
  };
}

function countVulnerable(diff) {
  let n = 0;
  for (const list of [diff.added, diff.upgraded, diff.downgraded]) {
    for (const p of list) {
      if (p.vulnerabilities && p.vulnerabilities.length) n += 1;
    }
  }
  return n;
}

function sanitizePkg(p) {
  const out = {
    ecosystem: clip(String(p.ecosystem || ''), 64),
    name: clip(String(p.name || ''), 256),
    change: String(p.change || ''),
    version: clip(String(p.version || ''), 128),
  };
  if (p.from) out.from = clip(String(p.from), 128);
  if (p.to) out.to = clip(String(p.to), 128);
  if (p.source) out.source = clip(String(p.source), 256);
  if (Array.isArray(p.vulnerabilities)) {
    out.vulnerabilities = p.vulnerabilities.slice(0, MAX_VULNS_PER_PACKAGE).map((v) => ({
      id: clip(String(v.id || ''), 128),
      summary: clip(String(v.summary || ''), MAX_STRING),
      severity: clip(String(v.severity || 'UNKNOWN'), 64),
    }));
  } else {
    out.vulnerabilities = [];
  }
  return out;
}

function clip(s, n) {
  return s.length <= n ? s : s.slice(0, n);
}

/**
 * Parse and validate artifact JSON text. Throws on invalid.
 */
export function validateArtifact(raw, byteLength = Buffer.byteLength(raw)) {
  if (byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artifact too large: ${byteLength} bytes (max ${MAX_ARTIFACT_BYTES})`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Artifact is not valid JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('Artifact root must be object');
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${data.schemaVersion}`);
  }
  if (!data.meta || typeof data.meta !== 'object') throw new Error('Missing meta');
  if (!data.changes || typeof data.changes !== 'object') throw new Error('Missing changes');
  for (const key of ['added', 'removed', 'upgraded', 'downgraded']) {
    if (!Array.isArray(data.changes[key])) throw new Error(`changes.${key} must be array`);
    if (data.changes[key].length > MAX_PACKAGES) {
      throw new Error(`changes.${key} exceeds ${MAX_PACKAGES}`);
    }
    for (const p of data.changes[key]) {
      assertPkg(p, key);
    }
  }
  return data;
}

function assertPkg(p, listName) {
  if (!p || typeof p !== 'object') throw new Error(`Invalid package in ${listName}`);
  for (const f of ['ecosystem', 'name', 'change']) {
    if (typeof p[f] !== 'string' || !p[f]) throw new Error(`Package missing ${f}`);
    if (p[f].length > 256) throw new Error(`Package ${f} too long`);
  }
  if (p.vulnerabilities !== undefined) {
    if (!Array.isArray(p.vulnerabilities)) throw new Error('vulnerabilities must be array');
    if (p.vulnerabilities.length > MAX_VULNS_PER_PACKAGE) {
      throw new Error('too many vulnerabilities on one package');
    }
  }
}
