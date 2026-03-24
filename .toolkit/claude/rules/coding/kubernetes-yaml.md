---
doc_type: policy
audience: bot
lang: en
tags: ['yaml', 'kubernetes', 'helm', 'k8s']
last_modified: 2026-03-10T15:52:23Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.{yml,yaml}'
---

KUBERNETES AND HELM YAML RULES
==============================

## TL;DR

Quote values that must remain strings in K8s manifests (labels, ConfigMap, env.value).
Validate with `kubeconform`, not just `yamllint`. Helm templates are not valid YAML — lint
rendered output. No duplicate keys.

QUOTING RULES
-------------

Always quote values that are semantically strings but look like booleans or numbers:

- `metadata.labels` and `metadata.annotations`
- `ConfigMap.data` and `Secret.stringData`
- `env.value` (environment variable values are strings)
- Resource quantities (`resources.requests/limits.*`) — strings in the K8s API

WRONG (will fail with "cannot unmarshal ... into ... string"):
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  labels:
    rollout: 20260212
data:
  FEATURE_ENABLED: true
  BUILD_ID: 0123
  TIMEOUT_SECONDS: 30
```

CORRECT:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  labels:
    rollout: "20260212"
data:
  FEATURE_ENABLED: "true"
  BUILD_ID: "0123"
  TIMEOUT_SECONDS: "30"
```

Resource quantities — always use the canonical string form:
```yaml
resources:
  requests:
    cpu: "250m"
    memory: "512Mi"
  limits:
    cpu: "1"
    memory: "1Gi"
```

Null vs empty string
--------------------

- `key:` means null, `key: ""` means empty string.
- In K8s string-only maps (labels, annotations, ConfigMap.data, Secret.stringData),
  use `""` or omit the key. Do not set null.

MANIFEST STRUCTURE
------------------

Canonical top-level ordering
----------------------------

Keep the conventional order for readable diffs:

- `apiVersion`
- `kind`
- `metadata`
- `spec` (or the resource-specific top-level field)

Multi-document files
--------------------

- Separate documents with `---` on its own line.
- Do not rely on blank lines as separators.
- Keep each document self-contained (no shared anchors across documents).

CORRECT:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: my-namespace
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: my-namespace
data:
  LOG_LEVEL: "info"
```

Duplicate keys
--------------

YAML allows duplicate keys; most parsers keep the last value silently.
This hides mistakes in reviews.

WRONG:
```yaml
metadata:
  labels:
    app: api
    app: worker
```

VALIDATION
----------

`yamllint` checks syntax and style, not whether Kubernetes will accept the manifest.

Local validation:
```bash
kubectl apply --dry-run=client -f path/to/manifest.yaml
```

Schema validation (fast, CI-friendly, replaces deprecated kubeval):
```bash
kubeconform -summary -strict path/to/manifest.yaml
```

HELM CHARTS
-----------

Helm templates under `templates/` contain `{{ ... }}` and are not valid YAML until rendered.
Do not run `yamllint` on templates directly.

Chart checks:
```bash
helm lint chart/
```

Render and lint as YAML:
```bash
helm template my-release chart/ | yamllint -c .yamllint.yml -
```

Quoting in templates
--------------------

If a K8s field expects a string, ensure Helm renders a string:

```yaml
env:
  - name: FEATURE_ENABLED
    value: {{ .Values.featureEnabled | quote }}
```

CHECKLIST
---------

- String values in labels, ConfigMap, env.value, resource quantities are quoted
- Canonical top-level ordering (apiVersion, kind, metadata, spec)
- Multi-document files separated with `---`
- No duplicate keys
- Helm templates validated with `helm lint`, rendered output with `yamllint`
- K8s manifests validated with `kubeconform`
