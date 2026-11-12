# 3_DAY_PLAN.md

Tarun and Claude work in parallel. Claude never waits for assets (placeholders, CLAUDE_PROMPT §6); each asset is swapped in through its own small PR.
**Who makes what:** Tarun = 5 Higgsfield clips (o-catch, p-ponds, p-intake, p-proc, p-freeze), keeps Blender open, approves and merges. Claude = everything else, including **all 3D in Blender**: fish/shrimp GLBs, the port & ship scene with the crane-lift and ship sail-out animation, its renders (`x-cranes`, `x-ship`) and the truck/reefer/crane/ship GLBs.

## Day 1
**Tarun**
1. Answer `confirm-list.md` (5 minutes; any unanswered item uses its fallback).
2. Top up Higgsfield credits (last ledger balance 160; 5 clips need 612–648 for one take each, budget about 900–950 with re-rolls; HIGGSFIELD.md "Credit plan").
3. Clone github.com/Tarunchintakunta/skylark (anchors are in `assets/anchors`, `assets/stills`). Extract `a3_first_1080.png`: `ffmpeg -i assets/video/1080/a3.mp4 -frames:v 1 a3_first_1080.png` (HIGGSFIELD.md §1).
4. Higgsfield 720p drafts for the must-have and the riskiest: **o-catch**, **p-proc**, **p-intake**. Approve or re-roll each against its "Accept if" list.
5. Open **Blender** on the Mac with the MCP add-on connected (N panel → BlenderMCP → Connect) and leave it open. Claude builds all the 3D through it.
6. Paste `CLAUDE_PROMPT.md` into Claude Code with this folder.
7. End of day: look at the port scene preview (960×540 MP4 + 3 stills in the `3d: port animation + preview` PR) and reply "ok" or list changes.

**Claude**: steps 1–8 of CLAUDE_PROMPT §1 (repo, docs, issues, scaffold, CI, Vercel preview, reused media, Blender check), then the Day1 issues: engine, loader, start screen + path switch, ScrubVideo, chapter config, Ocean + Pond chapters with reused clips/placeholders, HUD, rail/nav/CTA. In parallel in Blender: `3d: port scene build` (quay, 3 STS cranes, truck, reefer, ship, water, sky) and `3d: port animation + preview` (crane lift + ship sail-out keyframes, 960×540 preview). End of day: preview link where both paths scroll end-to-end, and the port preview for Tarun's approval.

## Day 2
**Tarun**
1. 1080p masters for the approved drafts (o-catch, p-proc, p-intake), then drafts → masters for **p-ponds** and **p-freeze**.
2. Drop each master as `assets-src/video/<id>.mp4` and tell Claude which ids landed.
3. Keep Blender open and the Mac awake and plugged in while Claude renders (roughly 0.5–2 h for the port shots).
4. Review the Day 1 preview and the Blender PRs (render stills attached): comment, and merge the ones you approve (only you merge).

**Claude**: Day2 issues: plant chapters, documentation, port, at sea, bright globe + routes, Products with GLBs, Trust, About, Quote/RFQ + API, footer, reduced-motion, mobile, SEO. **Blender (renders take time, start them first thing):** after Tarun's ok on the preview, full 1080p render of port.blend → `render: x-cranes` and `render: x-ship` PRs (encode, 3 stills, preview link, acceptance checklist each); while it renders, `3d: tuna`, `3d: swordfish`, `3d: shrimp`, then `3d: truck`, `3d: reefer`, `3d: crane`, `3d: ship` GLB exports (≤ 500 KB each). Swap in each Higgsfield clip as it arrives (`encode-clips.sh <id> && make-posters.sh <id>` → PR with sizes).

## Day 3
**Tarun**
1. Re-roll any Higgsfield clip that failed review (most likely o-catch or p-proc). If p-intake still fails after 2 re-rolls, tell Claude "use Blender for intake".
2. Review Claude's Blender fixes, if any (Claude fixes models and renders itself; Tarun only comments).
3. Review the release preview on a laptop and a phone. Say "ship it" or list fixes.
4. After production is live and approved: attach `skylarkexim.com` in Vercel → Domains and update DNS (CLAUDE_PROMPT §11). Keep the old WordPress host until the new site is verified.

**Claude**: last clip/GLB swaps, p-intake Blender fallback only if asked (BLENDER_GLB_SPEC.md §6), Blender fixes from review, perf pass to hit every number in §9, a11y (axe) pass, cross-browser check (Chrome, Safari macOS + iOS, Firefox, Android Chrome), Lighthouse + scroll-perf reports in the release PR, final report (CLAUDE_PROMPT §12). Production deploy only after Tarun's ok.
