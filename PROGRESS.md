# Progress: Skylark Exim "Reel" edition

**Live URL:** not deployed yet
**Repo:** https://github.com/Tarunchintakunta/skylark-exim-reel
**Source:** code copied from `Miyo-global/skylark-exim-v3` branch `feat/cg-story` at `bc4defb6` (copy only; v3 untouched)
**Credits:** 0 / 400 (stop and ask at 350)

## Plan: one continuous camera journey per path

Every clip starts on the exact last frame of the clip before it. No crossfades or cuts at joins.
Bridge clips are Kling 4.0 image-to-video with a start frame and an end frame.

| # | Clip | Source | Start frame | End frame |
|---|------|--------|-------------|-----------|
| Wild catch: "It starts *at sea.*" | | | | |
| o1 | trawler leaves harbour | v3 `cg-depart-1` (reused) | - | - |
| o2 | follow in behind the stern, net comes up | new, Kling | o1 last | still E1 |
| o3 | same camera, catch iced in crates on the aft deck | new, Kling | E1 | still E2 |
| o4 | camera rises straight up, trawler heads for the coast | new, Kling | E2 | still E3 |
| o5 | descend into the plant yard | new, Kling | E3 | `cg-arrive` first |
| Farmed shrimp: "It starts *at the pond.*" | | | | |
| p1 | aerial over the ponds | v3 `cg-ponds` | - | - |
| p2 | descend to the pond bank | new, Kling | p1 last | `cg-sample` first |
| p3 | water-testing case on the bank | v3 `cg-sample` | | |
| p4 | glide along the bank to the harvest | new, Kling | p3 last | `cg-harvest` first |
| p5 | crates of fresh shrimp on ice | v3 `cg-harvest` | | |
| p6 | on to the plant yard | new, Kling | p5 last | `cg-arrive` first |
| Shared: "Then it's *processed.*" | | | | |
| s1 | truck to the loading bays | v3 `cg-arrive` | | |
| s2 | through the dock door into the packing hall | new, Kling | s1 last | still P1 |
| s3 | down the hall into the cold store | new, Kling | P1 | still P2 |
| s4 | pallets loaded into a reefer container | new, Kling | P2 | still P3 |
| Shared: "Your container, *ready.*" | | | | |
| s5 | out to the quay | new, Kling | P3 | `cg-port` first |
| s6 | container under the cranes | v3 `cg-port` | | |
| s7 | out over the water | new, Kling | s6 last | `cg-ship` first |
| s8 | ship steams away | v3 `cg-ship` | | |
| s9 | rise above the ship | new, Kling | s8 last | `cg-sail` first |
| s10 | ship alone at sea | v3 `cg-sail` | | |

Not reused from v3: `cg-depart-2`, `cg-depart-3`, `cg-catch`, `cg-ice`, `cg-return` (sun disc in frame), and the
live-action plant clips (different light and setting, cannot be chained).

## Credit estimate (prices checked with get_cost on 12 Nov)

| Item | Count | Each | Total |
|------|-------|------|-------|
| GPT Image 2.6 high 4K still (E1-E3, P1-P3) | 6 | 4.25 | 25.50 |
| Kling 4.0 720p 5 s test of the first join (o2; Kling has no 480p) | 1 | 11.25 | 11.25 |
| Kling 4.0 1080p 5 s clip | 13 | 16.25 | 211.25 |
| Reserve: one retake on up to 5 clips | 5 | 16.25 | 81.25 |
| **Planned** | | | **329.25** |

## Credit log (actual charges, running total)

| # | Item | Model | Charged | Running |
|---|------|-------|---------|---------|

## Done

- Copied v3 `feat/cg-story` (bc4defb6) with `git archive`; pruned story media (1.2 GB to 27 MB).

## Next

- Grade v3 masters to one look, extract chain frames, generate stills, 720p test of o2.

## Blockers

- none
