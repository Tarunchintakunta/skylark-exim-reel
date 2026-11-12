## What / why

Closes #

## Screenshots / recording

## Perf (before → after)
| | before | after |
|---|---|---|
| Long tasks > 50 ms during scroll (desktop) | | |
| Avg / p95 frame time (desktop) | | |
| Avg fps, 4× CPU throttle | | |
| Transferred MB (initial / full scroll) | | |
| Lighthouse mobile (perf / a11y / LCP / CLS) | | |

## 3D / Blender (only for `3d:` and `render:` PRs)
- Renders (3 stills in `docs/renders/`): 
- Preview / clip link: 
- Numbers (tris, texture size, KB from `gltf-transform inspect`, or clip KB from `encode-clips.sh`): 
- [ ] Acceptance checks from docs/BLENDER_GLB_SPEC.md ticked (§3.7 for port renders)
- [ ] No text, logos or numbers on any model

## Checklist
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Playwright scroll test (`npm run test:scroll`)
- [ ] Lighthouse mobile (`npm run lh`)
- [ ] Reduced motion checked
- [ ] Mobile 375×812 checked
- [ ] Copy only from docs/CONTENT.md

Vercel preview:
