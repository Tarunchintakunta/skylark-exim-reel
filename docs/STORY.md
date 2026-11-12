# STORY.md: Skylark Exim v3, final scene list

Source legend: **REUSE `id`** = existing clip from github.com/Tarunchintakunta/skylark `assets/video/1080/<id>.mp4` · **NEW `id`** = new Higgsfield clip (Tarun) · **REGEN `id`** = Higgsfield clip that replaces one Tarun rejected · **BLENDER `id`** = clip Claude builds, animates and renders in Blender (`BLENDER_GLB_SPEC.md` §3), encoded like every other clip · **GLB** = React Three Fiber model · **DOM** = HTML/CSS/GSAP section.
All body copy is from `CONTENT.md` (skylarkexim.com). Headlines are editorial lines that make no factual claim. Nothing marked `[CONFIRM]` is needed for the site to work.

Scroll lengths are in viewport heights (vh) on desktop; mobile uses 0.8×. Every film chapter is **pinned** (one fixed stage), and scroll progress inside the chapter drives `video.currentTime` from 0 to duration.

HUD = the fixed cold-chain readout on the right edge. It shows the **workflow step** (the 9 real steps from the site's Work Flow page) plus a **state** label. A temperature appears only where the site states one (cold storage, −18 °C to −20 °C).

---

## 0. Intro loader (DOM)
- Small animated Skylark mark (logo SVG, stroke draws in, then a slow pulse) + wordmark "SKYLARK EXIM" + a thin brass progress bar with a percentage.
- **Progress is real.** It is the summed bytes of: fonts (`document.fonts.ready`), the `opening` poster, the first ~600 KB of `opening_1280.mp4` (or `canplaythrough`), and the first GLB the start screen needs (none on desktop by default; the globe texture is NOT in the critical set). Weighted by bytes, with a 300 ms minimum and no fake easing past the true value.
- Scroll is **locked** (Lenis `stop()`, `overflow:hidden`, keyboard scroll keys swallowed) until ready. Then the mark scales down into the header wordmark position and the loader fades out (600 ms, opacity + transform only) into the start screen.
- Reduced motion: no stroke animation, bar only, cross-fade 200 ms.
- HUD: hidden.

## 1. Start screen + fork. Source: REUSE `opening` (8 s, underwater → surface; ends on harbour lights left, pond bunds right)
- Eyebrow: `Visakhapatnam · Andhra Pradesh`
- Headline (SplitText, line mask reveal): **Two Origins. One Standard.** `[CONFIRM]` (tagline from the earlier drafts, not on skylarkexim.com; fallback: "From Visakhapatnam to the world.")
- Body: "Premium raw fresh, chilled and frozen seafood, with a fully integrated value chain from sourcing to delivery."
- Two large buttons: **THE OCEAN** (wild catch; selected by default, left, over the harbour side of the frame) and **THE POND** (farmed shrimp; right, over the pond side). Keyboard: ←/→ to switch, Enter to begin. `aria-pressed` on the selected one.
- Links: "Skip the story → Products" (top right, small mono) and the sticky **Request export quote** button (always visible from here on, bottom right on mobile).
- Scroll: 120 vh pinned. 0–100% scrubs `opening`; the headline reveals as the camera breaks the surface (≈60%). The buttons stay on screen the whole time.
- Choosing a path never reloads: it swaps the chapter list below the fork (see CLAUDE_PROMPT "Path switching") and keeps scroll position at the fork. A small pill "Ocean ⇄ Pond" in the header lets the user switch later; switching jumps to the first chapter of the other path.
- HUD: step `01 RAW MATERIAL PROCUREMENT`, state `ORIGIN`.

---

## THE OCEAN path (wild catch)

### O1. Setting out. Source: REUSE `a1` + REUSE `a2` (2 clips, chained, 8 s + 8 s)
- Headline: **Before the harbour wakes.**
- Body: "Based in Visakhapatnam, Andhra Pradesh. Raw material is sourced directly from farms or fishing vessels."
- Scroll: 200 vh; first 100 vh = `a1` (sunrise harbour, crew loading ice), second 100 vh = `a2` (steaming out to open sea). Boundary frames are shared, so the handoff is invisible.
- HUD: `01 PROCUREMENT` · `AT SEA`.

### O2. The catch (Tarun's must-have). Source: NEW `o-catch` (8 s; 12 s if credits allow)
- Headline: **Out of the water.**
- Body: "Initial quality checks (size, freshness, health) are done before acceptance."
- Visual: the net is winched up OUT of the sea, streaming water, crew swing it over the rail and empty the catch onto the deck, then lift fish toward the ice hold. Starts on `a2`'s last frame, ends on `a3`'s first frame (no cut on either side).
- Scroll: 140 vh (the haul deserves a slower scrub). Copy enters at 55% (when the catch hits the deck).
- Gear wording: copy never names the gear. `[CONFIRM]` net fishing is right for the boats.
- HUD: `01 PROCUREMENT` · `ON DECK`.

### O3. On ice. Source: REUSE `a3` (8 s, locked overhead on the ice hold, yellowfin on crushed ice)
- Headline: **On ice.**
- Body: "Premium raw fresh, chilled and frozen seafood."
- Overlay chips (DOM, staggered): Indian Mackerel · Tuna · Swordfish · Cuttlefish · Squid · Leatherjacket · Ribbon Fish · Seer Fish.
- Scroll: 100 vh.
- HUD: `01 PROCUREMENT` · `CHILLED`.

### O4. Back to Vizag. Source: REUSE `a4` (12 s: run home, crates into the refrigerated truck, coastal road, truck REVERSES rear-first to the lit intake door; cab stays away from the building)
- Headline: **Home under a chilled seal.**
- Body: "Transported under chilled conditions to the processing plant."
- Scroll: 160 vh. Ends on `anchor2` (truck backed to the bay), the shared convergence frame with the Pond path.
- HUD: `02 RECEIVING & WASHING` · `IN TRANSIT · CHILLED`.

---

## THE POND path (farmed shrimp)

### P1. The ponds. Source: REGEN `p-ponds` (8 s; replaces dim `b1`)
- Headline: **Partner farms on the Andhra coast.**
- Body: "Strategic partnerships with aquaculture farmers and a focus on responsible sourcing."
- Visual: bright morning aerial over the pond grid, paddlewheel aerators throwing white water, two or three small vehicles on the bunds **all travelling the same direction** along one route.
- Scroll: 120 vh.
- HUD: `01 PROCUREMENT` · `ORIGIN · FARM`.

### P2. Traceable from the pond. Source: REUSE `b2` (8 s: gloved hand takes a water sample, meter reading, logbook)
- Headline: **Every batch has a history.**
- Body: "We guarantee superior freshness, traceability, and product integrity across all markets."
- Scroll: 100 vh.
- HUD: `01 PROCUREMENT` · `QUALITY CHECK AT SOURCE`.

### P3. Harvest. Source: REUSE `b3` (8 s: shrimp into iced crates, batch tag, crates onto a small refrigerated truck, truck reverses to the plant bay; ends on `anchor2`)
- Headline: **Harvested into ice.**
- Body: "Shrimp are sourced directly from farms. Initial quality checks (size, freshness, health) are done before acceptance."
- Overlay chips: Vannamei · Black Tiger · Sea White · Pink / Brown · Sea Tiger.
- Scroll: 120 vh.
- HUD: `02 RECEIVING & WASHING` · `IN TRANSIT · CHILLED`.

---

## THE PLANT (both paths converge on `anchor2`)

### 5. Intake. Source: REGEN `p-intake` (8 s; replaces `t1`'s opening and the kohl intake Tarun rejected. Fallback if the regen fails: BLENDER render of the truck backed to the dock, no people, BLENDER_GLB_SPEC.md §6)
- Headline: **Both origins arrive at one door.**
- Body: "Our processing unit at Anandapuram, Visakhapatnam: a state-of-the-art shrimp processing facility equipped with internationally acclaimed modernized equipment."
- Visual: truck already **backed up** flush to the dock, rear doors swing open into the plant, the driver stays **outside** by the cab in the yard, masked workers unload iced crates from the rear onto steel trolleys; camera follows a crate through the door into the white intake hall.
- Scroll: 120 vh.
- HUD: `02 RECEIVING & WASHING` · `RECEIVED`.

### 6. Washing · Grading · Processing. Source: REGEN `p-proc` (12 s; replaces `t2`/`t2s`)
- Three captions on one clip (each holds ~⅓ of the scroll, SplitText swap):
  1. **Washed clean.** "Thorough washing with clean, treated water to remove impurities."
  2. **Graded to one standard.** "Sorted by size, weight, and type. Grading ensures uniformity for export standards."
  3. **Made to order.** "De-heading, peeling and deveining, manual or machine, based on product requirement: Head-On, Headless, Peeled, or Value-Added."
- Visual: the line is ALREADY mid-shift on frame 1 (product already on the conveyor and tables, no batch sliding in), every worker in **face mask, gloves and hair cap**; ends on the lab bench (`t2_end_1080`).
- Scroll: 200 vh.
- HUD: `02 WASHING` → `04 GRADING & SORTING` → `03 PROCESSING` (follows the captions).

### 7. Quality lab → Freezing → Packing → Cold storage. Source: REGEN `p-freeze` (12 s; replaces `t3` and the over-frosted kohl freezer)
- Four captions on one clip:
  1. **Tested before it moves.** "Checks for hygiene, freshness, texture and absence of defects. Samples tested for international food safety compliance." (lab bench, 0–20%)
  2. **Frozen at its best.** "IQF (Individually Quick Frozen) or block freezing. A thin ice glaze preserves freshness during shipment." (clean freezer, light frost only, 20–55%)
  3. **Packed and labelled.** "Export-grade cartons, vacuum packs, or customized packaging. Labels with product details, size, batch, and export compliance." (55–80%) + a DOM label card that types in `PRODUCT · SIZE · BATCH · EXPORT COMPLIANCE` (field names only, no fake values).
  4. **Held at −18 °C to −20 °C.** "Our warehouse has a total storage capacity of 700 pallets." (cold-store aisle, 80–100%)
- Scroll: 240 vh.
- HUD: `05 QUALITY CONTROL` → `06 FREEZING & GLAZING` → `07 PACKAGING` → `08 COLD STORAGE` with `−18 °C TO −20 °C` (the only temperature shown in the film).

---

## EXPORT

### 8. Documentation (DOM interlude over the last `p-freeze` frame, blurred + darkened)
- Headline: **Paperwork, done properly.**
- Body: "Our documentation staff professionally prepare all necessary documents and handle logistical tracking of shipments. Compliance with export certificates (HACCP, EU, FDA, etc.)."
- Visual: three paper cards slide up with stagger (transform only), labelled by function only: `Export documents` · `Compliance (HACCP · EU · FDA)` · `Shipment tracking`. No certificate numbers, no fake document contents.
- Scroll: 100 vh.
- HUD: `09 EXPORT DOCUMENTATION & LOGISTICS` · `DOCUMENTED`.

### 9. The port. Source: BLENDER `x-cranes` (8 s, rendered by Claude from `port.blend`, frames 1–192)
- Headline: **Loaded under the cranes.**
- Body: "Shipped in reefer containers to maintain the cold chain until the destination."
- Visual: daylight container terminal, 3 ship-to-shore gantry cranes working one container ship. A white refrigerated truck drives along the quay in one direction and parks under the middle crane; its trolley runs over the truck, the spreader lowers on its cables, locks onto the white reefer container, lifts it, travels out over the ship and lowers it onto the stacked deck, while the other two cranes keep working. The container hangs on cables the whole time. Camera starts low on the quay and rises with the container. No text or logos anywhere.
- Scroll: 140 vh.
- HUD: `09 EXPORT` · `REEFER CONTAINER`.

### 10. At sea. Source: BLENDER `x-ship` (8 s, frames 192–383 of the same render, so it starts on `x-cranes`' last frame)
- Headline: **From Visakhapatnam to the world's table.**
- Body: none (let the shot breathe); a small mono line: `Cold chain · outbound`.
- Visual: camera rises to a straight-down aerial as the loaded container ship (colourful stacks with rows of white reefers) sails out, cutting a white wake across deep blue water (Mont-Fort style), then keeps rising so the ship becomes small in a field of bright deep blue. The last frame matches the globe's starting blue.
- Scroll: 120 vh. Last 15% cross-fades (opacity only) into the globe, whose camera starts close over the sea off Visakhapatnam in the same blue.
- HUD: `09 EXPORT` · `AT SEA · COLD CHAIN`.

### 11. The world. Source: GLB / R3F globe (bright daytime, NOT dark)
- Headline: **Trusted in 16 markets.**
- Body: "China · Europe · Vietnam · UAE (Sharjah) · Turkey · Thailand · Taiwan · Sri Lanka · Malaysia · Kuwait · Japan · Egypt · Bangkok · Algeria · Russia · Hong Kong"
- Visual: bright Earth (daylight albedo, soft blue atmosphere, light page background `#eef5f6` → sky), camera pulls back from the sea off Visakhapatnam to the full globe; gold arcs draw from Visakhapatnam to each market one by one as you scroll (drawn in code), each market label fades in when its arc lands. Hover/focus a market name in the list highlights its arc.
- Scroll: 220 vh pinned. Ends with the globe slowly auto-rotating (only while in view).
- HUD: `09 EXPORT` · `16 MARKETS`. HUD fades out at the end of this chapter.

---

## BUSINESS SECTIONS (fast, scannable, normal scroll; no pinning)

### 12. Products (anchor `#products`, target of "Skip the story")
- Header: **Our Products**
- Two tabs (follow the chosen path by default): **Marine Fish** · **Shrimps**.
- Marine Fish: 3D **tuna** GLB and **swordfish** GLB on a light stage (scroll rotates them ±25°, drag to orbit on desktop). List: Indian Mackerel · Tuna · Swordfish · Cuttlefish · Squid · Leatherjacket · Ribbon Fish · Seer Fish.
- Shrimps: 3D **shrimp** GLB. List: Vannamei · Black Tiger Shrimp · Sea White Shrimp · Pink / Brown · Sea Tiger Shrimp. Species offered: Litopenaeus Vannamei (Vannamei) & Penaeus Monodon (Black Tiger).
- Shrimp forms grid (DOM cards, hover lifts): Head-on Shell-on (Vannamei / Black Tiger) · Headless Shell-on (Vannamei / Black Tiger) · PUD (Vannamei) · Peeled & Deveined (Tail on / Tail off) · Pin Deveined (Tail on / Tail off) · Easy Peel (Vannamei / Black Tiger).
- Strip: **Raw fresh · Chilled · Frozen**.
- No sizes, counts or prices (none on the site). CTA: "Request specifications" → RFQ.

### 13. Trust strip
- Header: **Why choose us**
- Six tiles: Quality control staff ("For our clients, our quality control staff will guarantee top-notch quality.") · Lab unit at Anandapuram · Traceability ("superior freshness, traceability, and product integrity") · Documentation staff · Farmer partnerships ("strategic partnerships with aquaculture farmers") · Prompt delivery ("accurate order handling and prompt delivery").
- Compliance line exactly as the site states it: "Compliance with export certificates (HACCP, EU, FDA, etc.)". No logos/badges unless Tarun supplies certificates `[CONFIRM]`.
- Facts row: `700-pallet warehouse` · `16 markets` · `Raw fresh, chilled and frozen`.

### 14. About
- Header: **High professionalism and excellence** (site heading "High Professional and excellence", grammar-cleaned per CONTENT.md `[CONFIRM]`)
- Company paragraph (CONTENT.md "Company").
- Vision and Mission (verbatim, grammar-cleaned).
- Managing partners: **V. Yashod Kumar** · **N.V. Prudhvi** (photos only if Tarun supplies them `[CONFIRM]`; otherwise initials monograms).

### 15. Contact / Request export quote (anchor `#quote`)
- Header: **Request an export quote**
- RFQ form (see CLAUDE_PROMPT): name, company, country, email, phone (optional), product category (Marine Fish / Shrimps), species (multi-select from the real lists), form (shrimp only), fresh/chilled/frozen, quantity (free text), destination market (free text), message.
- Contact block: +91-9000 604 070 · +91-9885 827 318 · info@skylarkexim.com · Office: Sheela Nagar, Visakhapatnam, Andhra Pradesh · Processing unit: Abad Overseas Private Limited, S.No. 297/Part, Lodagalavanipalem, Anandapuram-Pendurthi Road, Anandapuram, Visakhapatnam-530052, Andhra Pradesh.
- Button: **Download company profile (PDF)**.

### 16. Footer
- Wordmark, nav (Story · Products · Why us · About · Quote), contact repeat, `© 2026 Skylark Exim` `[CONFIRM year/legal name]`.

---

## Scene → source summary
| # | Scene | Path | Source | Clip len |
|---|---|---|---|---|
| 0 | Loader | both | DOM | – |
| 1 | Start + fork | both | REUSE opening | 8 s |
| O1 | Setting out | Ocean | REUSE a1 + a2 | 16 s |
| O2 | The catch | Ocean | NEW o-catch | 8–12 s |
| O3 | On ice | Ocean | REUSE a3 | 8 s |
| O4 | Back to Vizag | Ocean | REUSE a4 | 12 s |
| P1 | The ponds | Pond | REGEN p-ponds | 8 s |
| P2 | Traceable | Pond | REUSE b2 | 8 s |
| P3 | Harvest | Pond | REUSE b3 | 8 s |
| 5 | Intake | both | REGEN p-intake (Blender fallback) | 8 s |
| 6 | Wash · grade · process | both | REGEN p-proc | 12 s |
| 7 | Lab · freeze · pack · cold store | both | REGEN p-freeze | 12 s |
| 8 | Documentation | both | DOM | – |
| 9 | Port cranes | both | BLENDER x-cranes (Claude) | 8 s |
| 10 | At sea (top-down) | both | BLENDER x-ship (Claude) | 8 s |
| 11 | Bright globe | both | GLB/R3F | – |
| 12–16 | Products · Trust · About · Quote · Footer | both | GLB + DOM | – |

Who makes what: Higgsfield (Tarun) = o-catch, p-ponds, p-intake, p-proc, p-freeze · Blender (Claude) = x-cranes, x-ship, all GLBs · code = globe.

Dropped from the old chain and why: `b1` (too dark, no vehicles; replaced by p-ponds), `t1` (intake rebuilt per Tarun), `t2`/`t2s` (workers without masks; batch feel), `t3` (frost overdone), `t4` (dark space globe and the North America route).
