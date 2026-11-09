/**
 * Query the free OSV API (api.osv.dev) querybatch endpoint, then hydrate a
 * capped set of vulnerability IDs for summaries. Only network calls besides
 * GitHub. No telemetry.
 */

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_URL = 'https://api.osv.dev/v1/vulns';
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const MAX_HYDRATE = 30;

/** Ecosystems OSV supports well for our parsers */
const SUPPORTED = new Set(['npm', 'PyPI', 'Go', 'GitHub Actions']);

/**
 * @param {Array<{ecosystem:string,name:string,version:string}>} packages
 * @param {{fetchImpl?: typeof fetch, signal?: AbortSignal, hydrate?: boolean}} [opts]
 * @returns {Promise<Map<string, Array<object>>>} key eco|name|version -> vulns
 */
export async function queryOsv(packages, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const hydrate = opts.hydrate !== false;
  const results = new Map();
  const queryable = packages.filter(
    (p) => SUPPORTED.has(p.ecosystem) && p.name && p.version && !p.name.startsWith('docker://'),
  );

  for (let i = 0; i < queryable.length; i += BATCH_SIZE) {
    const batch = queryable.slice(i, i + BATCH_SIZE);
    const body = {
      queries: batch.map((p) => ({
        package: { ecosystem: p.ecosystem, name: p.name },
        version: p.version,
      })),
    };

    const data = await postWithRetry(fetchImpl, OSV_BATCH_URL, body, opts.signal);
    const list = data.results || [];
    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      const key = pkgKey(p);
      const vulns = (list[j] && list[j].vulns) || [];
      results.set(key, vulns.map(summarizeVuln));
    }
  }

  if (hydrate && results.size) {
    await hydrateSummaries(results, fetchImpl, opts.signal);
  }

  return results;
}

async function hydrateSummaries(results, fetchImpl, signal) {
  const ids = [];
  const seen = new Set();
  for (const vulns of results.values()) {
    for (const v of vulns) {
      if (!v.id || v.id === 'UNKNOWN' || seen.has(v.id)) continue;
      if (v.summary) continue;
      seen.add(v.id);
      ids.push(v.id);
      if (ids.length >= MAX_HYDRATE) break;
    }
    if (ids.length >= MAX_HYDRATE) break;
  }
  if (!ids.length) return;

  const details = new Map();
  // Sequential with small concurrency to be polite to the free API
  const concurrency = 5;
  for (let i = 0; i < ids.length; i += concurrency) {
    const slice = ids.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (id) => {
        try {
          const res = await getWithRetry(fetchImpl, `${OSV_VULN_URL}/${encodeURIComponent(id)}`, signal);
          details.set(id, summarizeVuln(res));
        } catch {
          // Keep the ID-only stub on hydrate failure
        }
      }),
    );
  }

  for (const [key, vulns] of results.entries()) {
    results.set(
      key,
      vulns.map((v) => (details.has(v.id) ? { ...v, ...details.get(v.id) } : v)),
    );
  }
}

function pkgKey(p) {
  return `${p.ecosystem}|${p.name}|${p.version}`;
}

function summarizeVuln(v) {
  return {
    id: v.id || 'UNKNOWN',
    summary: truncate(v.summary || v.details || '', 200),
    severity: extractSeverity(v),
  };
}

function extractSeverity(v) {
  if (Array.isArray(v.severity) && v.severity.length) {
    const s = v.severity[0];
    if (s && s.score) return String(s.score);
    if (s && s.type) return String(s.type);
  }
  if (v.database_specific && v.database_specific.severity) {
    return String(v.database_specific.severity);
  }
  return 'UNKNOWN';
}

function truncate(s, n) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

async function postWithRetry(fetchImpl, url, body, signal) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`OSV HTTP ${res.status}`);
        await sleep(250 * attempt * attempt);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OSV HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(250 * attempt * attempt);
    }
  }
  throw lastErr;
}

async function getWithRetry(fetchImpl, url, signal) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`OSV HTTP ${res.status}`);
        await sleep(250 * attempt * attempt);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OSV HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(250 * attempt * attempt);
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function attachVulns(diff, vulnMap) {
  const attach = (p) => {
    const eco = p.ecosystem === 'npm' ? 'npm'
      : p.ecosystem === 'PyPI' ? 'PyPI'
      : p.ecosystem === 'Go' ? 'Go'
      : p.ecosystem === 'github-actions' ? 'GitHub Actions'
      : p.ecosystem;
    const version = p.to || p.version;
    const key = `${eco}|${p.name}|${version}`;
    const vulns = vulnMap.get(key) || [];
    return { ...p, vulnerabilities: vulns };
  };
  return {
    added: diff.added.map(attach),
    removed: diff.removed.map(attach),
    upgraded: diff.upgraded.map(attach),
    downgraded: diff.downgraded.map(attach),
  };
}

export { OSV_BATCH_URL as OSV_URL, SUPPORTED, MAX_HYDRATE };
