<!-- sbom-diff-sticky -->
## sbom-diff

Dependency changes on this PR: **5** added, **3** removed, **2** upgraded, **3** downgraded.

⚠️ **6** changed package(s) have known vulnerabilities in OSV.

### Added

| Ecosystem | Package | Version | Vulns |
| --- | --- | --- | --- |
| Go | github.com/sirupsen/logrus | v1.9.3 | 0 |
| PyPI | pyyaml | 5.3.1 | GHSA-8q59-q68h-6hv4, PYSEC-2021-142 |
| PyPI | werkzeug | 3.0.1 | GHSA-29vq-49wr-vm6x, GHSA-2g68-c3qc-8985, GHSA-87hc-h4r5-73f7 +11 |
| github-actions | aquasecurity/trivy-action | 0.20.0 | 0 |
| npm | express | 4.18.2 | GHSA-qw6h-vgh9-j6wx, GHSA-rv95-896h-c2vc |

<details>
<summary>Vulnerability details (3)</summary>

**pyyaml@5.3.1** (PyPI)
- GHSA-8q59-q68h-6hv4 — CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H — Improper Input Validation in PyYAML
- PYSEC-2021-142 — UNKNOWN — A vulnerability was discovered in the PyYAML library in versions before 5.4, where it is susceptible to arbitrary code execution when it processes untrusted YAML files through the full_load method or…

**werkzeug@3.0.1** (PyPI)
- GHSA-29vq-49wr-vm6x — CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N — Werkzeug safe_join() allows Windows special device names
- GHSA-2g68-c3qc-8985 — CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H — Werkzeug debugger vulnerable to remote execution when interacting with attacker controlled domain
- GHSA-87hc-h4r5-73f7 — CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L — Werkzeug safe_join() allows Windows special device names with compound extensions
- GHSA-f9vj-2wh5-fj8j — CVSS:4.0/AV:N/AC:H/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N — Werkzeug safe_join not safe on Windows
- GHSA-g6x2-hccm-hh4m — CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N — Werkzeug safe_join() allows Windows special device names
- GHSA-hgf8-39gv-g3f2 — CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N — Werkzeug safe_join() allows Windows special device names
- GHSA-q34m-jh98-gwm2 — CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H — Werkzeug possible resource exhaustion when parsing file data in forms
- PYSEC-2026-2043 — CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H — Werkzeug debugger vulnerable to remote execution when interacting with attacker controlled domain
- PYSEC-2026-2044 — CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L — Werkzeug safe_join() allows Windows special device names with compound extensions
- PYSEC-2026-2045 — CVSS:4.0/AV:N/AC:H/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N — Werkzeug safe_join not safe on Windows

**express@4.18.2** (npm)
- GHSA-qw6h-vgh9-j6wx — CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:L — express vulnerable to XSS via response.redirect()
- GHSA-rv95-896h-c2vc — CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N — Express.js Open Redirect in malformed URLs

</details>

### Removed

| Ecosystem | Package | Version | Vulns |
| --- | --- | --- | --- |
| PyPI | jinja2 | 3.1.2 | — |
| PyPI | urllib3 | 2.0.7 | — |
| npm | left-pad | 1.3.0 | — |

### Upgraded

| Ecosystem | Package | From | To | Vulns |
| --- | --- | --- | --- | --- |
| Go | github.com/google/uuid | v1.3.0 | v1.6.0 | 0 |
| PyPI | flask | 2.3.2 | 3.0.0 | GHSA-68rp-wp8r-4726, PYSEC-2026-2151 |

<details>
<summary>Vulnerability details (1)</summary>

**flask@3.0.0** (PyPI)
- GHSA-68rp-wp8r-4726 — CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:P/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N — Flask session does not add `Vary: Cookie` header when accessed in some ways
- PYSEC-2026-2151 — CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N — Flask is a web server gateway interface (WSGI) web application framework. In versions 3.1.2 and below, when the session object is accessed, Flask should set the Vary: Cookie header., resulting in a U…

</details>

### Downgraded

| Ecosystem | Package | From | To | Vulns |
| --- | --- | --- | --- | --- |
| PyPI | requests | 2.31.0 | 2.28.0 | GHSA-9hjg-9r4m-mvj7, GHSA-9wx4-h78v-vm56, GHSA-gc5v-m9x4-r6x2 +5 |
| github-actions | actions/checkout | v4 | b4ffde65f46336ab88eb53be808477a3936bae11 | 0 |
| npm | lodash | 4.17.21 | 4.17.20 | GHSA-29mw-wpgm-hmr9, GHSA-35jh-r3h4-6jhm, GHSA-r5fr-rjxr-66jc +1 |

<details>
<summary>Vulnerability details (2)</summary>

**requests@2.28.0** (PyPI)
- GHSA-9hjg-9r4m-mvj7 — CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N — Requests vulnerable to .netrc credentials leak via malicious URLs
- GHSA-9wx4-h78v-vm56 — CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:H/I:H/A:N — Requests `Session` object does not verify requests after making first request with verify=False
- GHSA-gc5v-m9x4-r6x2 — CVSS:3.1/AV:L/AC:H/PR:L/UI:R/S:U/C:N/I:H/A:N — Requests has Insecure Temp File Reuse in its extract_zipped_paths() utility function
- GHSA-j8r2-6x86-q33q — CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:N/A:N — Unintended leak of Proxy-Authorization header in requests
- PYSEC-2023-74 — UNKNOWN — Requests is a HTTP library. Since Requests 2.3.0, Requests has been leaking Proxy-Authorization headers to destination servers when redirected to an HTTPS endpoint. This is a product of how we use `r…
- PYSEC-2026-1872 — CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N — Requests vulnerable to .netrc credentials leak via malicious URLs
- PYSEC-2026-1873 — CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:H/I:H/A:N — Requests `Session` object does not verify requests after making first request with verify=False
- PYSEC-2026-2275 — CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N — Requests is a HTTP library. Prior to version 2.33.0, the `requests.utils.extract_zipped_paths()` utility function uses a predictable filename when extracting files from zip archives into the system t…

**lodash@4.17.20** (npm)
- GHSA-29mw-wpgm-hmr9 — CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L — Regular Expression Denial of Service (ReDoS) in lodash
- GHSA-35jh-r3h4-6jhm — CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H — Command Injection in lodash
- GHSA-r5fr-rjxr-66jc — UNKNOWN — 
- GHSA-xxjr-mmjv-4gpg — UNKNOWN — 

</details>

---
<sub>Generated by sbom-diff. Vulnerability data from [OSV](https://osv.dev). Treat findings as leads, not a complete audit.</sub>
