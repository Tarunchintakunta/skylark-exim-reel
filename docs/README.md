# Skylark Exim v3: handoff pack

Everything Claude Code needs to build and deploy the new skylarkexim.com: a cinematic, 3D, smooth story-scroll site with two paths (THE OCEAN / THE POND) that meet at the Anandapuram plant and end on a bright globe, followed by fast Products / Why us / About / Quote sections.

**This zip contains no video, .blend or .glb files** (it's kept small on purpose):
- Reused clips come from github.com/Tarunchintakunta/skylark; Claude's `scripts/fetch-sources.sh` copies them.
- **5 Higgsfield clips** (o-catch, p-ponds, p-intake, p-proc, p-freeze): Tarun makes them with `HIGGSFIELD.md` and saves each 1080p master as `assets-src/video/<id>.mp4`.
- **All 3D: Claude builds it itself in Blender through its Blender connector** (`BLENDER_GLB_SPEC.md`): the tuna, swordfish and shrimp models; the port & ship scene (quay, 3 ship-to-shore gantry cranes, refrigerated truck, reefer container, loaded container ship) with the crane-lift and ship sail-out animation, which Claude renders into the `x-cranes` and `x-ship` clips; and truck, reefer, crane and ship models. Tarun only keeps Blender open with the MCP add-on connected, and approves the renders in each PR.
- Claude's scripts (`scripts/`) compress everything into `public/` within the size budgets.

## Who does what
| Job | Tarun | Claude |
|---|---|---|
| Answer `confirm-list.md` (optional) | ✔ | |
| Higgsfield clips: o-catch, p-ponds, p-intake, p-proc, p-freeze | ✔ (top up credits first) | encodes them |
| Port & ship scene in Blender (cranes, truck, reefer, ship, crane-lift + sail-out animation), renders `x-cranes` + `x-ship` | keeps Blender open, approves the preview and render PRs | ✔ builds, animates, renders, encodes |
| Tuna, swordfish, shrimp, truck, reefer, crane, ship GLBs | approves the renders | ✔ builds, bakes, exports, optimises |
| p-intake fallback render (only if the Higgsfield regen fails) | says "use Blender for intake" | ✔ |
| Bright globe | | ✔ (in code) |
| Repo, issues, branches, PRs, Vercel previews | reviews, **merges** (only Tarun merges) | ✔ (only the initial commit goes to `main`; after that never commits to, force-pushes or merges `main`) |
| Production deploy + domain | says "ship it", attaches the domain/DNS | ✔ explains the steps |

## Files
| File | What it is | Who uses it |
|---|---|---|
| `CLAUDE_PROMPT.md` | The master prompt. Paste it into Claude Code. | Claude |
| `PRD.md` | Product requirements: audience, journeys, features, metrics, out of scope | Claude, Tarun |
| `TRD.md` | Technical requirements: architecture, stack versions, engines, tests, CI, deploy | Claude |
| `STORY.md` | Final scene list, copy, visual source per scene, scroll and HUD behaviour | Claude, Tarun |
| `CONTENT.md` | Every verified fact/copy block from skylarkexim.com + the "never write" list | Claude |
| `GIT_WORKFLOW.md` | Issues → branches → micro commits → small PRs; only Tarun merges | Claude |
| `HIGGSFIELD.md` | 5 ready prompts (anchors, duration, camera, avoid list, accept checks, credits); port/ship prompts only in an appendix for the no-Blender case | Tarun |
| `BLENDER_GLB_SPEC.md` | Everything 3D Claude builds in Blender: connector rules, fish/shrimp models, port & ship scene (objects, rig, frame-by-frame animation, render + encode, acceptance checks), model table, p-intake fallback, export settings, globe-in-code | Claude |
| `ASSETS_SPEC.md` | Folder layout, budgets, measured encode results, how the scripts work | Claude |
| `scripts/` | `fetch-sources.sh`, `encode-clips.sh`, `make-posters.sh`, `optimize-glb.sh` (tested) | Claude |
| `templates/` | PR template and issue template for the new repo | Claude |
| `confirm-list.md` | 14 questions for Tarun, each with a safe fallback | Tarun |
| `3_DAY_PLAN.md` | Day-by-day for Tarun and Claude | both |
| `reference/` | Existing keyframes, kohl draft contact sheet, Tarun's feedback screenshots, reference-site screenshots + `REFERENCES.md` + `REFERENCE_AUDIT.md` | Claude |

## Order of operations
**Tarun**
1. Answer `confirm-list.md` (optional; fallbacks exist).
2. Open Claude Code in an empty folder, put this unzipped folder in it, and paste `CLAUDE_PROMPT.md` (everything below its line). Claude creates the repo `skylark-exim-v3`, issues, and the first Vercel preview.
3. Open Blender with the MCP add-on connected and leave it open (Claude builds and renders all the 3D through it).
4. Meanwhile, generate the 5 Higgsfield clips (`HIGGSFIELD.md`). Put them in `assets-src/video/` of Claude's working copy (or send them to Claude) and say which ones arrived.
5. Review each PR's Vercel preview link and the Blender renders; merge the ones you approve (only you merge).
6. When the release preview is right, say "ship it". Then attach `skylarkexim.com` in Vercel (DNS steps in CLAUDE_PROMPT §11).

**Claude**: follows CLAUDE_PROMPT §1 (read docs → new repo with docs → issues → scaffold → Vercel preview → reused media → Blender check + port scene → features by PR), meets the numbers in §9, and reports back per §12.
