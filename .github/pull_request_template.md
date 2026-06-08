## Summary

<!-- What does this PR change, and why? -->

## Related issue

<!-- e.g. Closes #123 -->

## How was this tested?

<!-- Commands you ran, manual steps, new/updated tests. -->

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

## Checklist

- [ ] Business logic lives in `src/lib/` with a pure helper + test where it makes sense
- [ ] Config goes through `src/lib/config.ts` and `.env.example` (no stray `process.env`)
- [ ] No secrets, `data/`, cookies, or export files are committed
- [ ] Stays within project scope (your own exported data; no scraping/login automation)
