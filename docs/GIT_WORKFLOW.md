# GIT_WORKFLOW.md: rules Claude follows in `Tarunchintakunta/skylark-exim-v3`

## 1. Issues first
Before writing feature code, create one GitHub issue per scene, section, feature and asset task (list in CLAUDE_PROMPT.md §5). Issue body template:
```
## Goal
<one sentence>
## Acceptance criteria
- [ ] <testable item>
- [ ] <perf/a11y item where relevant>
## Notes / sources
docs/STORY.md §<n> · docs/TRD.md §<n> · asset ids
```
Labels (create them first): `scene`, `section`, `perf`, `content`, `3d`, `video`, `a11y`, `seo`, `infra`, `asset`, `blocked-on-tarun`.
Milestones: `Day1`, `Day2`, `Day3` (see docs/3_DAY_PLAN.md). Asset tasks that need Tarun's files get `blocked-on-tarun` until the file is in `assets-src/`.

## 2. One branch per issue
`feat/<issue#>-<slug>` · `fix/<issue#>-<slug>` · `perf/<issue#>-<slug>` · `chore/<issue#>-<slug>` · `docs/<issue#>-<slug>`
Branch from up-to-date `main`. Rebase your own unmerged feature branch on main if needed (force-push to **your feature branch** only, with `--force-with-lease`).

## 3. Micro commits
- Small and single-purpose. Conventional Commits: `feat:`, `fix:`, `perf:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`.
- Every commit references its issue: `feat(scrub): seek on rVFC, drop stale targets (#12)`.
- `npm run typecheck && npm run build` must pass on **every** commit (add a `pre-commit`/`pre-push` hook with `simple-git-hooks` or `husky` + `lint-staged`).
- No commented-out code, no `console.log` left behind, no secrets.

## 4. Small PRs
- Aim for < ~400 changed lines excluding assets and lockfiles. Split bigger work.
- PR template (`.github/pull_request_template.md`, provided in `docs/templates/`):
  - **What / why**
  - `Closes #<n>`
  - Screenshots or a short screen recording (Playwright video is fine) for anything visual
  - Perf numbers **before / after** (long tasks, fps, transferred MB, Lighthouse mobile) for anything touching scroll, video, 3D or bundles
  - Checklist: ☐ typecheck ☐ build ☐ Playwright scroll test ☐ Lighthouse (mobile) ☐ reduced-motion checked ☐ mobile (375×812) checked ☐ content only from CONTENT.md
  - Vercel preview URL (from the Vercel bot comment)
- CI (GitHub Actions) runs typecheck, build, Playwright smoke + scroll test, and Lighthouse CI on every PR.

## 5. main is protected
- Never commit directly to `main` (the only exception is the initial docs commit in CLAUDE_PROMPT §1 step 2, made before branch protection is switched on). Never force-push `main`. Never merge your own PR.
- **Only Tarun merges**, after reviewing the preview. Turn on branch protection: require PR, require CI green, disallow force-push, disallow deletion.
- Production deploys happen from `main` only, and only after Tarun says so.

## 6. Binaries
- `assets-src/` (masters: 1080p clips, raw GLBs, anchors, `.blend` files, Blender PNG frames) is git-ignored and never committed.
- Blender review renders (3 PNG stills per model/shot, the ≤ 4 MB `port-preview.mp4`) go in `docs/renders/` on the PR's own branch.
- Only optimised outputs in `public/media`, `public/models`, `public/textures` are committed (projected total < 40 MB, each file < 3 MB). If the total passes ~50 MB, move `public/media/**` to Git LFS (`git lfs track "public/media/**"`), and confirm Vercel LFS support is enabled in project settings.
