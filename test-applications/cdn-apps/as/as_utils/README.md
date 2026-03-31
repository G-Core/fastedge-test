# @fastflags/cdn

FastEdge CDN application for feature flag evaluation and request manipulation.

## Features

- Server-side feature flag evaluation
- Request/response manipulation at the edge
- Rule-based flag assignment
- Zero-latency flag checks

## Build

```bash
npm install
npm run build
```

This will create `./build/basic-cdn.wasm` ready for deployment.

## Deploy

Use the FastEdge CLI or API to deploy the generated wasm binary file.
