---
doc_type: policy
audience: bot
lang: en
tags: ['yaml', 'kubernetes', 'helm', 'k8s']
last_modified: 2026-03-15T18:00:35Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.{yml,yaml}'
---

KUBERNETES AND HELM YAML RULES
==============================

## TL;DR

Quote values only in string fields (labels, annotations, ConfigMap.data, env.value).
Do not quote fields that Kubernetes expects as numbers or booleans.
Validate with `kubeconform -strict`, not just `yamllint`. Lint Helm rendered output,
not raw templates. No duplicate keys.

QUOTING RULES
-------------

Quote values that must stay strings:

- `metadata.labels` and `metadata.annotations`
- `ConfigMap.data`
- `Secret.stringData` (plaintext values)
- `Secret.data` (base64-encoded bytes — every value must be valid base64;
  use `stringData` for authoring plaintext, `data` when you need base64
  control or server-side apply compatibility)
- `env.value` (environment variable values are strings)
- Resource quantities (`resources.requests/limits.*`) — quote all for
  consistency; this is required when the value would otherwise be parsed as a
  number such as `1` or `0.5`

Treat these as ambiguous in string-only fields and quote them:

- booleans: `true`, `false`, and YAML 1.1 tokens that the Kubernetes Go
  parser still accepts: `yes`, `no`, `on`, `off`, `y`, `n` (and their
  uppercase forms `YES`, `NO`, `ON`, `OFF`, `TRUE`, `FALSE`, `Y`, `N`)
- null-like values: `null`, `~`
- numeric-looking values: `0`, `1`, `0123`, `1e3`
- date/timestamp-looking values: `2026-03-10`, `2026-03-10T12:00:00Z`

WRONG (string-only fields rendered as non-strings):
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  labels:
    rollout: 20260212
    feature-toggle: yes
  annotations:
    deploy.gcore.com/enabled: true
data:
  FEATURE_ENABLED: true
  BUILD_ID: 0123
  RELEASE_DATE: 2026-03-10
  TIMEOUT_SECONDS: 30
  NORWAY: no
```

CORRECT:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  labels:
    rollout: "20260212"
    feature-toggle: "yes"
  annotations:
    deploy.gcore.com/enabled: "true"
data:
  FEATURE_ENABLED: "true"
  BUILD_ID: "0123"
  RELEASE_DATE: "2026-03-10"
  TIMEOUT_SECONDS: "30"
  NORWAY: "no"
```

Do not quote fields that Kubernetes expects as non-strings:

- integers such as `spec.replicas`, `containerPort`, `service.port`,
  `terminationGracePeriodSeconds`
- booleans such as `readOnly`, `hostNetwork`, `automountServiceAccountToken`
- objects/lists such as `env.valueFrom`, `affinity`, `tolerations`

WRONG (valid YAML, wrong Kubernetes types):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: "3"
  template:
    spec:
      containers:
        - name: api
          image: registry.example.com/api:1.2.3
          ports:
            - containerPort: "8080"
          securityContext:
            readOnlyRootFilesystem: "true"
```

CORRECT:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: registry.example.com/api:1.2.3
          ports:
            - containerPort: 8080
          securityContext:
            readOnlyRootFilesystem: true
```

Resource quantities — use a consistent quoted form:
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

- `key:`, `key: null`, and `key: ~` mean null.
- `key: ""` means empty string.
- In K8s string-only maps (`labels`, `annotations`, `ConfigMap.data`,
  `Secret.stringData`), use `""` or omit the key. Do not set null.

WRONG:
```yaml
data:
  OPTIONAL_BANNER:
```

CORRECT:
```yaml
data:
  OPTIONAL_BANNER: ""
```

MANIFEST STRUCTURE
------------------

Conventional top-level ordering
-------------------------------

Use the conventional order for readable diffs. This is a style rule, not a
YAML or Kubernetes schema requirement.

- `apiVersion`
- `kind`
- `metadata`
- `spec` (or the resource-specific top-level field such as `data`, `rules`,
  `subjects`)

Multi-document files
--------------------

- Separate documents with `---` on its own line.
- Do not rely on blank lines as separators.
- Keep each document self-contained (no shared anchors across documents).
- In Helm, template files may emit multiple documents, but `values.yaml` must
  contain exactly one document. If `values.yaml` contains multiple documents,
  Helm uses only the first one.

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

YAML anchors and aliases
------------------------

Avoid YAML anchors (`&name`), aliases (`*name`), and merge keys (`<<`) in
Kubernetes and Helm manifests unless there is a strong reason.

- They hide the final manifest from reviewers.
- Helm and Kubernetes parse and rewrite YAML, so anchors get expanded and
  the alias structure is lost.
- Prefer explicit YAML or Helm helpers/includes.

WRONG:
```yaml
commonLabels: &commonLabels
  app.kubernetes.io/name: api
  app.kubernetes.io/part-of: billing

metadata:
  labels:
    <<: *commonLabels
    app.kubernetes.io/component: worker
```

CORRECT:
```yaml
metadata:
  labels:
    app.kubernetes.io/name: api
    app.kubernetes.io/part-of: billing
    app.kubernetes.io/component: worker
```

Duplicate keys
--------------

YAML mappings must not contain duplicate keys.
Some parsers keep the last value without warning, which hides mistakes
in reviews.

Treat duplicate keys as errors. Enable `yamllint`'s `key-duplicates` rule and
use `kubeconform -strict`.

WRONG:
```yaml
metadata:
  labels:
    app: api
    app: worker
```

CORRECT:
```yaml
metadata:
  labels:
    app: worker
    component: api
```

VALIDATION
----------

`yamllint` checks syntax and style. It also catches issues such as
duplicate keys, but it does not check whether Kubernetes will accept the
manifest.

Schema validation (fast, CI-friendly):
```bash
kubeconform -summary -strict path/to/manifest.yaml
```

Note: by default `kubeconform` fetches schemas from a remote registry.
For air-gapped or offline CI, store schemas locally with `-schema-location`.

For Custom Resources, add schema locations explicitly. Do not assume success when
schemas are missing.

Example with local CRD schemas:
```bash
kubeconform -summary -strict -schema-location default -schema-location 'schemas/{{ .ResourceKind }}{{ .KindSuffix }}.json' path/to/manifest.yaml
```

If you intentionally skip missing schemas, make that choice explicit:
```bash
kubeconform -summary -strict -ignore-missing-schemas path/to/manifest.yaml
```

Cluster-backed validation (preferred when cluster access exists):
```bash
kubectl apply --dry-run=server --validate=strict -f path/to/manifest.yaml
```

Client-side preview only:
```bash
kubectl apply --dry-run=client -f path/to/manifest.yaml
```

Notes:

- `--dry-run=client` is not enough for installed CRDs, admission-time behavior,
  and other API-server checks.
- `kubeconform` is the preferred replacement for `kubeval`, which is no longer
  maintained.

KUSTOMIZE
---------

Pipe `kustomize build` output into validators the same way as Helm rendered output.

Schema validation:
```bash
kustomize build <dir> | kubeconform -summary -strict
```

Cluster-backed validation (preferred when cluster access exists):
```bash
kubectl apply --dry-run=server --validate=strict -k <dir>
```

HELM CHARTS
-----------

Helm templates under `templates/` contain `{{ ... }}` and are template source,
not plain YAML until rendered.
Do not run `yamllint` on raw templates directly.

Files such as `Chart.yaml`, `values.yaml`, and YAML files under `crds/` are
plain YAML and may be linted directly.

Chart checks:
```bash
helm lint chart/
```

Render and lint output:
```bash
helm template --include-crds my-release chart/ | yamllint -c .yamllint.yml -
```

Render and validate output against K8s schemas:
```bash
helm template --include-crds my-release chart/ | kubeconform -summary -strict
```

If the chart renders Custom Resources, pass the relevant `-schema-location`
flags to `kubeconform`.

If the chart uses `lookup`, local rendering is not enough. Use a cluster-backed
Helm dry-run:
```bash
helm install --dry-run=server --debug my-release chart/
```

CRDs in charts
--------------

- Place CRD declarations in `crds/`.
- Files in `crds/` must be plain YAML; they cannot be templated.
- If you want CRDs included in rendered output for validation, use
  `helm template --include-crds`.

Quoting in templates
--------------------

If a K8s field expects a string, ensure Helm renders a string:

WRONG:
```yaml
env:
  - name: FEATURE_ENABLED
    value: {{ .Values.featureEnabled }}
metadata:
  labels:
    build: {{ .Values.buildId }}
```

CORRECT:
```yaml
env:
  - name: FEATURE_ENABLED
    value: {{ .Values.featureEnabled | quote }}
metadata:
  labels:
    build: {{ .Values.buildId | quote }}
```

Do not quote template output for typed numeric fields:

WRONG:
```yaml
spec:
  replicas: {{ .Values.replicas | quote }}
```

CORRECT:
```yaml
spec:
  replicas: {{ .Values.replicas }}
```

CHECKLIST
---------

- Ambiguous values in string-only fields are quoted (including YAML 1.1
  tokens: `yes`, `no`, `on`, `off`)
- Typed numeric/boolean fields are not quoted
- String-only maps do not use null; they use `""` or omit the key
- `Secret.data` values are valid base64; `Secret.stringData` for plaintext
- Conventional top-level ordering is preserved
- Multi-document files are separated with `---`
- `values.yaml` contains exactly one YAML document
- YAML anchors/aliases are avoided
- No duplicate keys
- Helm templates are checked with `helm lint`
- Rendered Helm output is validated with `yamllint` and `kubeconform`
- `kubeconform` is configured for CRDs, or missing schemas are skipped
  intentionally and explicitly
- `kubectl apply --dry-run=server --validate=strict` is used when cluster
  access exists
