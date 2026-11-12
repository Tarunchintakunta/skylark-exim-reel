# HIGGSFIELD_STORYBOARD.md: the story, shot by shot

Extends `docs/HIGGSFIELD.md` (global rules, review gate, log format). Issue #175. Every shot is **image-to-video** from a fresh Blender still of the matching scene (directly for shots without people; through a Higgsfield image pass for people shots, see below), so composition, set and vehicles stay Blender's; Higgsfield adds real people, skin, fabric, water, ice and motion. Port, cranes, ship and globe stay Blender-led.

## Corrections to HIGGSFIELD.md (facts rules win)
- Shot C5 said "blast freezer". "blast freezing" is on the `docs/CONTENT.md` "Never write" list: prompts say **plate freezer / freezer room / IQF tunnel** only.
- `BANNED_CLAIMS.md` does not exist. The banned list is the `docs/CONTENT.md` "Never write" section plus the name of the sea off the coast (see #173) and the seine-net gear name. None of those words go into a prompt.
- The global block's "subtle handheld" is dropped: clips are scrubbed by scroll, so the camera must be locked to one slow, eased move (handheld shake reads as jitter when scrubbed).
- No celebrities, no identifiable real people, no real brand logos, no readable names, numbers or signs (the p-sample meter shows "7.8": that frame is not used).

## Common settings
- Model: `minimax_h3` 2K (default) vs `seedance_2_5` 1080p `bitrate_mode: high`: one comparison take on the first A shot, decision by contact sheet, logged.
- 16:9, 5 s default (8 s max), no audio, one continuous slow move in the scroll direction, no cuts, no morphing. Output resampled to 24 fps in the encode if the model returns another rate (logged).
- Start still: `hf-stills/<shot>.png`, rendered fresh at 1920×1080 from the named .blend/frame (EEVEE, saved scene settings). End still only where two Higgsfield shots chain inside one chapter.
- Prompt = subject + action + environment + light + camera move + lens + "photorealistic documentary, natural skin texture, real fabric, wet surfaces, shallow depth of field" + the global block (with the corrections above).
- People, everywhere: South Indian, mixed ages (20s to 50s), mixed builds, natural dark-brown skin with real pores and sweat sheen, natural relaxed postures, eyes on the task, nobody looks into the lens, no posing. Faces stay mid-distance or turned; hands are the close-up subject.
- Plant PPE (every plant shot): light coloured coveralls or white coats, hairnet under a cap, surgical face mask, waterproof apron, nitrile gloves, white wellington boots. Fishers and pond farmers: no PPE beyond rubber gloves and boots.

## People shots: two-step workflow (Tarun, #121/#175)
For every shot with people in frame or close to camera (HS02–HS05, HS07–HS18):
1. The Blender still is a **composition reference only** (layout, camera, set, props).
2. The start frame is generated with a Higgsfield **image** model from that reference at max resolution (candidates preflighted: `nano_banana_pro` 4k 4 cr, `gpt_image_2_5` max 4k 15 cr, `nano_banana_2_1` 4k 3 cr, `seedream_v4_5` high 1 cr; the pick is made on the first people shot by contact sheet and logged). Content: real South Indian coastal workers, varied ages, builds and skin tones, real fabric, thin semi-matte nitrile gloves, non-woven bouffant caps (plant), natural working poses, nobody looking at camera, plus the global rules (no text, logos or real brands).
3. The generated frame is contact-sheeted and graded against real reference photos of Indian harbours / seafood plants (viewed in the browser only, nothing downloaded, uploaded or committed; comparison described in words on the sheet notes). PASS before animating.
4. Image-to-video from that start frame with the shot prompt.
Shots without people (HS01 sea, HS06 ponds aerial, HS19 port, HS20 ship) keep the Blender still as the start frame. Credits are logged per shot, image and video separately.

## Priorities
HIGGSFIELD.md marks A = must, B = nice but labels shots A/B/C/D. Applied here: the human-heavy shots (A1–A4, C1–C6) are **A**; pond, cold store, stuffing and the Blender-led port/ship are **B**.

## Story → site chapters (`src/config/chapters.ts`)
| # | Beat | Shot | Site chapter (media id it replaces / adds) | Scene · branch · start frame | End frame | Pri |
|---|---|---|---|---|---|---|
| 1 | Opening sea | HS01 | `start` (`opening`) | opening.blend · feat/165 · f192 | – | A (A1) |
| 1b | Setting out | HS02 | `o1` (`a1`, `a2`) | o-depart.blend · feat/164 · f090 | – | B |
| 2 | Catch on boat | HS03 | `o2` (still `a3` → video) | o-catch.blend · feat/101 · f040 | – | A (A2) |
| 2b | Icing on board | HS04 | `o3` (`a3`) | o-catch.blend · feat/101 · f230 | – | A (A3) |
| 3 | Return to port | HS05 | `o4` (`a4`) | o-return.blend · feat/108 · f110 | – | A (A4) |
| 4 | Ponds | HS06 | `p1` (still `b2` → video) | p-ponds.blend · feat/109 · f001 | – | B |
| 5 | Harvest | HS07 | `p3` (`b3`) | p-harvest.blend · feat/110 · f040 | HS08 start | B (B2) |
| 5b | Sorting on the bund | HS08 | `p3` (`b3`) second segment | p-harvest.blend · feat/110 · f120 | – | B (B3) |
| 6 | Sampling | HS09 | `p2` (`b2`) | p-sample.blend · feat/155 · f001 | – | B |
| 7 | Truck to plant | HS10 | `intake` first segment | truck-reverse.blend · feat/104 · f210 | – | A (C1) |
| 8 | Intake | HS11 | `intake` (still `ph-p-intake` → video) | p-intake.blend · feat/105 · f060 | – | A (C1) |
| 9 | Processing: wash/grade | HS12 | `process` (still `ph-p-proc` → video), captions 1–2 | p-proc.blend · feat/105 · f001 | – | A (C2) |
| 9b | Processing: peel/devein | HS13 | `process`, caption 3 | p-proc.blend · feat/105 · f240 | – | A (C3) |
| 10 | IQF | HS14 | `coldchain` caption 2 (still `ph-p-freeze` → video) | p-iqf.blend · feat/105 · f001 | – | A (C5) |
| 11 | Lab | HS15 | `coldchain` caption 1 (still `ph-p-lab` → video) | p-lab.blend · feat/105 · f060 | – | A (C4) |
| 12 | Packing | HS16 | `coldchain` caption 3 | p-pack.blend · feat/105 · f001 | – | A (C6) |
| 13 | Cold store | HS17 | `coldchain` caption 4 / `docs` backdrop | p-store.blend · feat/105 · f001 | – | B (B6) |
| 14 | Reefer truck | HS18 | `port` first segment | truck-reverse.blend · feat/104 · f150 | – | B (D1) |
| 15 | Port / cranes | HS19 | `port` (`x-cranes`) | port.blend · fix/103 · f150 | – | B (Blender-led) |
| 16 | Ship departs | HS20 | `sea` (`x-ship`) | port.blend · fix/103 · f300 | – | B (Blender-led) |
| – | Globe | – | `world` | code-built, no Higgsfield | – | – |

Site order differs from the beat numbers in two places and the wiring follows the site: `p2` (sampling) plays before `p3` (harvest), and the `coldchain` captions run lab → freezing → packing → cold storage. Joins between Higgsfield shots and remaining Blender/old clips are cross-fades unless `boundary-check.sh` passes.

## Shots

### HS01 · Opening sea (start · `opening`) · A
- **Start:** opening.blend f192: water-level view across a gently rolling sea, low hazy coast with palms on the horizon, pale dawn sky.
- **Camera:** slow push-in at water level toward the coast, 35 mm look, horizon level.
- **Motion:** real swell and small wavelets passing under the lens, soft specular dawn light on the water, a few gulls gliding, a small wooden fishing boat far off near the coast, mist low on the water.
- **People:** none close; at most 2–3 tiny silhouettes on the distant boat.
- **Prompt:** "Dawn over a calm tropical sea off the Andhra coast, camera at water level gliding slowly forward toward a low hazy coastline with palms, gentle swell and real wavelets, soft pink-blue first light, thin mist on the water, a few gulls, a small wooden fishing boat far away. Slow steady push-in, 35mm lens."
- 5 s.

### HS02 · Setting out (`o1`: `a1`/`a2`) · B
- **Start:** o-depart.blend f090: quay with the white-and-blue boat alongside, crew on deck, two men on the quay casting off.
- **Camera:** slow lateral dolly along the quay, 35 mm, as the boat starts to move away.
- **Motion:** mooring line thrown from the quay to the deck, boat eases off, water churns at the stern, flags stir.
- **People:** quay hands in checked shirts and lungis, barefoot or in rubber sandals, one in his 50s with grey stubble, one in his 20s; on deck two crew in faded work shirts and yellow oilskin bibs, rubber gloves; one coils a rope, one lifts a fender inboard.
- **Prompt:** "Early morning at an Indian fishing harbour, a white and blue steel fishing boat casting off from a stone quay, a quay hand in a checked shirt and lungi throws the mooring rope to a crewman on deck who coils it, another crewman lifts a fender inboard, calm green harbour water churning at the stern, soft warm morning light. Slow lateral dolly along the quay, 35mm lens."

### HS03 · Catch on boat (`o2`) · A
- **Start:** o-catch.blend f040: deck 3/4 from ~5 m, ring of yellow floats on the sea, net line from the boom, crew lined up at the rail.
- **Camera:** slow push toward the rail, 35 mm.
- **Motion:** crew haul the net line hand over hand, floats close in, water boils with silver fish just under the surface, spray; boom and winch take the weight.
- **People:** 5–6 fishers in orange and yellow oilskin bibs over faded shirts, caps, orange rubber gloves, rubber boots; ages 20s–50s; two lean over the rail pulling the line, one works the winch lever, one steadies the boom rope; wet sleeves, sunlit sweat.
- **Prompt:** "Bright morning on the wet steel deck of a white and blue Indian fishing vessel at sea, five fishermen in orange and yellow oilskins, caps and rubber gloves hauling a net line hand over hand at the rail, the ring of yellow floats tightening on the deep blue water, silver fish and a few yellowfin tuna flashing and splashing inside the net, water dripping from the rope. Slow push-in toward the rail, 35mm lens."

### HS04 · Icing on board (`o3`) · A
- **Start:** o-catch.blend f230: crew kneeling at the fish pile sorting into blue, red and white crates, ice box open.
- **Camera:** slow push-in, 50 mm, soft depth of field on hands.
- **Motion:** gloved hands lift silver fish and a yellowfin tuna into crates, a crewman shovels crushed ice over a filled crate; ice stays in the crate.
- **People:** 3–4 crew kneeling or crouching, oilskins and orange gloves, one older man with a towel round his neck; faces turned to the work.
- **Prompt:** "On a wet fishing boat deck in daylight, crew in oilskins and orange rubber gloves kneel and sort fresh silver fish and yellowfin tuna by hand into blue and red plastic crates, one man shovels crushed ice over a full crate, ice stays inside the crate, water runs across the deck. Slow push-in, 50mm lens, shallow depth of field on the hands."

### HS05 · Return to port (`o4`: `a4`) · A
- **Start:** o-return.blend f110: boat alongside the wharf, crates passed from deck to wharf onto steel trolleys.
- **Camera:** slow pan following the crates, 35 mm.
- **Motion:** iced crates passed hand to hand from the boat to the wharf and stacked on trolleys; one trolley is pushed away; gulls.
- **People:** 6–8 harbour workers: crew in oilskin bibs on deck, wharf porters in vests and lungis rolled to the knee, rubber gloves, one woman in a cotton sari with the end tucked in, carrying a basket; mixed ages.
- **Prompt:** "Morning at a busy Indian fishing harbour, a white and blue fishing boat moored at a concrete wharf, crew pass blue crates of fish on crushed ice up to workers on the wharf who stack them on steel trolleys, a porter in a vest and rolled lungi pushes a loaded trolley away, gulls overhead, wet concrete, moored boats behind, no text on any hull. Slow pan, 35mm lens."

### HS06 · Ponds (`p1`) · B
- **Start:** p-ponds.blend f001: bright morning aerial over the pond grid, aerators throwing white water, palms.
- **Camera:** slow forward drone glide, slight yaw.
- **Motion:** paddlewheel aerators spinning with real white water and ripples, light breeze on the pond surface, the white reefer truck on the bund road moving forward, birds.
- **People:** 3–5 tiny farm workers on the bunds (shirts, caps), never close.
- **Prompt:** "Aerial drone view over a grid of rectangular shrimp aquaculture ponds in coastal Andhra Pradesh on a bright morning, paddlewheel aerators spinning and throwing white water, ripples spreading across green-brown water, earth bund roads with palms, a white refrigerated truck driving slowly along a bund road, a few farm workers small in the distance. Slow forward glide, wide lens."

### HS07 · Harvest (`p3`: `b3`, segment 1) · B
- **Start:** p-harvest.blend f040: pond edge, two workers waist-deep drawing the drag net, floats along the net, the crate station and truck behind.
- **End:** HS08 start (f120) only if the move reads as one continuous action; otherwise free.
- **Camera:** low over the water, slow tracking shot along the net, 35 mm.
- **Motion:** net drawn in, lifts out of the water dripping, vannamei shrimp at true size flicking inside, mist over the water.
- **People:** two pond workers knee-to-waist deep, sleeveless vests or faded T-shirts, lungis hitched up, towels on heads; one in his 40s, one in his 20s; a third on the bund pulling the rope end.
- **Prompt:** "Sunrise at a shrimp aquaculture pond in Andhra Pradesh, two farm workers waist-deep in the water draw a drag net toward the bank, a third man on the bund pulls the rope, the net lifts dripping out of the water full of live grey vannamei shrimp at true size flicking, light mist on the water, palms and a blue shade canopy behind. Slow tracking shot low over the water, 35mm lens."

### HS08 · Sorting on the bund (`p3`, segment 2) · B
- **Start:** p-harvest.blend f120: crates of crushed ice on the bund, workers tipping shrimp in.
- **Camera:** slow push-in, 50 mm, shallow depth of field on the crates.
- **Motion:** shrimp tipped from the net into crates of ice water, a worker scoops ice over, hands sort out debris.
- **People:** 3 farm workers, T-shirts and shorts or lungis, rubber gloves, one woman sorting at the crate edge; hands are the subject.
- **Prompt:** "On the earth bank of a shrimp pond in morning light, farm workers in T-shirts and rubber gloves tip live vannamei shrimp from a net into blue crates of crushed ice and water, one scoops more ice over them, close view of hands and real shrimp at true size, the ice stays inside the crates. Slow push-in, 50mm lens, shallow depth of field."

### HS09 · Sampling (`p2`: `b2`) · B
- **Start:** p-sample.blend f001: worker kneeling on a wooden boardwalk at the pond edge with a sampling pole (no meter text in frame).
- **Camera:** slow push-in, 50 mm.
- **Motion:** the pole dips into the pond, a water sample is drawn into a clear bottle, ripples spread.
- **People:** one pond technician in his 30s, collared work shirt, blue nitrile gloves, kneeling on one knee; a co-worker wading in soft focus behind.
- **Prompt:** "At the edge of a shrimp pond in morning light, a farm technician in a work shirt and blue nitrile gloves kneels on a wooden plank walkway and dips a sampling pole into the green water, filling a clear sample bottle, ripples spreading, a co-worker wading in soft focus behind. Slow push-in, 50mm lens, shallow depth of field. No numbers or text on any instrument."

### HS10 · Truck to plant (`intake`, segment 1) · A
- **Start:** truck-reverse.blend f210: the white reefer truck backed rear-first into the dock bay of the white plant, cab outside facing the yard, driver stepping down.
- **Camera:** slow lateral move along the truck side toward the building, 35 mm.
- **Motion:** driver steps down and places a wheel chock, dock shelter around the truck rear, a worker walks past with an empty crate stack.
- **People:** driver in his 40s, moustache, hi-vis vest over a shirt, trousers, sandals or shoes; plant worker in coverall, hairnet, mask, gloves, white wellies.
- **Prompt:** "Early morning at a seafood processing plant loading yard, a white refrigerated truck reversed rear-first into a loading bay with its cab outside facing the yard, the driver in a hi-vis vest steps down from the cab and places a wheel chock, a masked plant worker in a white coverall, hairnet and white boots walks past, wet concrete, white insulated panel building. Slow lateral move along the truck, 35mm lens."

### HS11 · Intake (`intake`) · A
- **Start:** p-intake.blend f060: inside the dock, workers sliding iced crates from the truck onto steel trolleys, strip curtain to the white hall.
- **Camera:** slow follow at hip height through the strip curtain, 35 mm.
- **Motion:** crates of shrimp on ice slid onto a trolley, trolley pushed through the strip curtain into the bright hall.
- **People:** 3–4 plant workers, white coveralls, hairnets, masks, waterproof aprons, gloves, white wellies; one woman in her 30s, one man in his 50s; both hands on the crate or trolley handle.
- **Prompt:** "Inside a clean seafood plant receiving dock, masked workers in white coveralls, hairnets, waterproof aprons, gloves and white wellington boots slide blue crates of shrimp on crushed ice from a refrigerated truck onto a stainless steel trolley and push it through a clear PVC strip curtain into a bright white processing hall, wet epoxy floor. Slow follow at hip height, 35mm lens."

### HS12 · Wash and grade (`process`, captions 1–2) · A
- **Start:** p-proc.blend f001: the hall mid-shift, wash tanks under spray, conveyor of shrimp, rows of workers.
- **Camera:** slow dolly along the line, ~2 m high, 35 mm.
- **Motion:** spray bars wash shrimp in tanks, water drains into floor gullies, conveyor carries shrimp past graders who sort into trays.
- **People:** 15–25 workers at tables, white or light-blue coveralls, hairnets, masks, aprons, gloves, white wellies; mixed men and women; heads down to the work.
- **Prompt:** "Inside a bright, clean shrimp processing hall in India, mid-shift, raw shrimp washed under spray bars in stainless tanks, water running into floor drains, a conveyor carries shrimp past rows of workers in white coveralls, hairnets, face masks, aprons, gloves and white boots who grade them by size into trays. Slow dolly along the line, 35mm lens."

### HS13 · Peel and devein (`process`, caption 3) · A
- **Start:** p-proc.blend f240: long stainless tables of workers de-heading and peeling, trays filling, the lab glass wall ahead.
- **Camera:** slow dolly past the table, 50 mm, shallow depth of field on hands.
- **Motion:** gloved hands de-head, peel and devein raw shrimp; rows of peeled shrimp in trays.
- **People:** 6–10 women and men seated or standing at the table, hairnets, masks, aprons, blue gloves; every hand holds a shrimp or a small knife; five fingers each.
- **Prompt:** "Close view along a stainless steel table in a shrimp processing plant, workers in hairnets, face masks, aprons and blue nitrile gloves peel and devein raw vannamei shrimp by hand, neat rows of peeled shrimp in white trays on crushed ice, bright clean light. Slow dolly along the table, 50mm lens, shallow depth of field on the hands."

### HS14 · IQF (`coldchain`, caption 2) · A
- **Start:** p-iqf.blend f001: shrimp spaced on the IQF belt entering the freezer hood, worker at the side.
- **Camera:** slow lateral track along the belt, 50 mm.
- **Motion:** belt carries individually spaced shrimp into the IQF tunnel, light cold vapour drifts realistically at the tunnel mouth, glaze spray mist, light frost on steel edges only.
- **People:** one worker in an insulated jacket over white coverall, hairnet, mask, gloves, spreading shrimp on the belt.
- **Prompt:** "In a seafood plant freezer room, a stainless mesh conveyor carries individually spaced raw shrimp into an IQF freezing tunnel, light cold vapour drifting naturally at the tunnel entrance, a fine glazing mist, light frost on steel edges, a worker in an insulated jacket over a white coverall, hairnet, mask and gloves spreads shrimp evenly on the belt, soft cool light. Slow lateral track, 50mm lens."

### HS15 · Lab (`coldchain`, caption 1) · A
- **Start:** p-lab.blend f060: QC technician at the bench, sample trays of shrimp, window wall.
- **Camera:** calm slow push-in, 50 mm.
- **Motion:** technician lifts a shrimp from the tray with tweezers, inspects it, places it on a scale tray, notes on a blank clipboard.
- **People:** one female QC technician in her 30s, white lab coat, hairnet, mask, blue gloves; a second technician in soft focus.
- **Prompt:** "In a clean seafood quality-control lab, a technician in a white lab coat, hairnet, face mask and blue gloves examines raw shrimp from a sample tray with tweezers at a white bench, a scale and test tubes beside her, a blank clipboard, soft daylight. Calm slow push-in, 50mm lens. No readable text or numbers."

### HS16 · Packing (`coldchain`, caption 3) · A
- **Start:** p-pack.blend f001: packing table, frozen blocks going into plain cartons.
- **Camera:** slow dolly past the packing line, 50 mm.
- **Motion:** frozen shrimp blocks in clear bags placed into plain master cartons, a carton closed and taped, a strapping machine in the background.
- **People:** 2–3 packers, coveralls, hairnets, masks, gloves; one older man taping.
- **Prompt:** "Packing room in a seafood plant, workers in white coveralls, hairnets, masks and gloves place glazed frozen shrimp blocks in clear bags into plain brown master cartons on a stainless table, one tapes a carton shut, a strapping machine behind, no printed text on any carton. Slow dolly along the table, 50mm lens."

### HS17 · Cold store (`coldchain`, caption 4) · B
- **Start:** p-store.blend f001: cold-store aisle, racks of plain cartons on pallets, strip curtain.
- **Camera:** slow push-in down the aisle.
- **Motion:** a worker pulls a pallet truck along the aisle away from camera, light frost, faint cold mist at floor level.
- **People:** one worker in a padded blue cold-store jacket over coverall, hood, mask, gloves, boots.
- **Prompt:** "A seafood cold storage room, tall racks of plain white and brown cartons on pallets, light frost on the rack edges, faint cold mist near the floor, a worker in a padded blue freezer jacket, mask and gloves pulls a pallet truck slowly down the aisle away from camera, soft cool light. Slow push-in, 35mm lens."

### HS18 · Reefer truck (`port`, segment 1) · B
- **Start:** truck-reverse.blend f150: white reefer truck at the plant bays seen from the yard.
- **Camera:** slow dolly back from the dock.
- **Motion:** workers wheel a pallet of cartons into the reefer, refrigeration unit humming (no readable text), doors swung closed.
- **People:** 2 dock workers in coveralls, masks, gloves, boots; driver in hi-vis.
- **Prompt:** "Plant loading dock in daylight, two workers in coveralls, masks and gloves wheel a pallet of plain cartons into a white refrigerated truck backed to the dock, the refrigeration unit on the front of the box with no readable text, the driver in a hi-vis vest waits by the cab. Slow dolly back, 35mm lens."

### HS19 · Port and cranes (`port`: `x-cranes`) · B, Blender-led
- **Start:** port.blend f150: truck stopped under crane 2, ship and stacks behind.
- **Camera:** keep Blender's move: slow tilt up as the spreader descends.
- **Motion:** real harbour water and sky, cables and spreader descending, small hi-vis lashing crew at quay; composition kept.
- **People:** 3–5 tiny port workers in hard hats and hi-vis vests, never close.
- **Prompt:** "A busy container terminal quay in bright daylight, a white reefer container on a truck trailer under a ship-to-shore crane, the spreader descending on four cables, a large container ship stacked with containers behind, small dock workers in hard hats and hi-vis vests, real harbour water and clouds. Slow tilt up, keep the composition exactly. No text, numbers or logos on containers, ship or cranes."

### HS20 · Ship departs (`sea`: `x-ship`) · B, Blender-led
- **Start:** port.blend f300: top-down, the ship leaving the berth with two tugs.
- **Camera:** keep Blender's top-down track.
- **Motion:** real white wake, bow wave and foam, tugs peeling away, deep blue water with sun glints.
- **People:** none visible.
- **Prompt:** "Top-down aerial of a loaded container ship sailing out of a harbour into deep blue water, two tugs peeling away to the sides, white wake and bow foam, sun glints on the sea. Slow top-down tracking shot, keep the composition. No text or logos."

## Request for start stills (lanes / main)
`{scene, frame, 1920×1080}` → `hf-stills/<shot>.png`:
HS01 opening f192 · HS02 o-depart f090 · HS03 o-catch f040 · HS04 o-catch f230 · HS05 o-return f110 · HS06 p-ponds f001 · HS07 p-harvest f040 · HS08 p-harvest f120 · HS09 p-sample f001 · HS10 truck-reverse f210 · HS11 p-intake f060 · HS12 p-proc f001 · HS13 p-proc f240 · HS14 p-iqf f001 · HS15 p-lab f060 · HS16 p-pack f001 · HS17 p-store f001 · HS18 truck-reverse f150 · HS19 port f150 · HS20 port f300.
Every still is inspected before upload; if CG people are close to camera, a neighbouring frame with people mid/wide is used instead and noted in the log.
