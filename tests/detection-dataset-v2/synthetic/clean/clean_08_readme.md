# Reports service

Small service that renders monthly usage reports as PDF.

## Development

```
pnpm install
pnpm dev
```

## Layout

- `src/render/` -- template rendering
- `src/jobs/` -- scheduled report generation
- `src/http/` -- HTTP handlers
