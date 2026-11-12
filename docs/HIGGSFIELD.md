# HIGGSFIELD.md — Skylark Exim v3 media pass (runs ONLY after all Blender work is merged-ready)

## 0. Purpose
Blender owns geometry-heavy wide shots (port, cranes, containers, ship, truck exterior, ponds wide, globe).
Higgsfield owns what Blender does badly: real people at work, wet close-ups, ice, water physics, hands, fish texture.
Every clip must look like real documentary footage from a working Indian seafood export chain. No CGI look, no fantasy.

## 1. Global rules (apply to EVERY prompt — paste this block at the end of each one)
- Photoreal documentary, shot on ARRI Alexa Mini, 35mm, natural light, shallow depth of field, subtle handheld, 24 fps.
- Location: coastal Andhra Pradesh, India (Visakhapatnam region). Indian workers, realistic clothing.
- Plant interiors: workers in white coats, hair caps, face masks, gloves, white gumboots; stainless steel tables; epoxy floors; bright clean light.
- Physically correct water and ice: water stays inside containers, ice sits in crates, no overflowing, no floating liquid, no glowing pillars of light.
- Correct anatomy: 5 fingers, no extra limbs, no melting faces, no warping hands, no morphing objects.
- Correct species: tuna looks like real yellowfin tuna; shrimp are real vannamei/tiger shrimp at true size (8–20 cm), not specks; NO salmon, NO salmon fillets.
- NO text, logos, watermarks, subtitles, signage letters, or brand names anywhere in frame.
- NO cartoon, toy, plastic, CGI, mannequin, or video-game look.
- Steady motion, one continuous action, no cuts inside the clip. Camera moves slowly (dolly/push-in/pan) so it scrubs smoothly on scroll.
- Do not name the sea (no regional sea name) or name the seine-net gear in prompts or copy. Nothing from BANNED_CLAIMS.md.

## 2. Settings
- Use the highest-quality video model available in the Higgsfield connector; 1080p or higher; 16:9 (also make a 9:16 crop/variant only if a shot is mobile-hero).
- Duration 5 s per clip (8 s max). Image-to-video: start from the matching Blender boundary frame (exported PNG) whenever the clip sits next to a Blender clip, so the cut matches.
- Generate 2 takes per shot max, pick the best, log credits used in HIGGSFIELD_LOG.md (shot id, prompt, seed/take, credits, verdict).
- Credit guard: before starting, read the remaining credit balance, estimate total cost, and if it would exceed 85% of balance, do priority A shots first and stop to report.

## 3. Review gate (every take)
1. Extract a 6-frame contact sheet (ffmpeg) and look at it.
2. Reject if ANY: warped hands/faces, wrong species, salmon, text/logos, overflowing water/ice, floating objects, plastic look, flicker, sudden morph, camera jump.
3. Accept only if it would pass for real footage in a corporate film. Write the verdict to HIGGSFIELD_LOG.md.
4. If both takes fail: rewrite the prompt (more specific, simpler action), 1 more take, else keep the Blender version and log it.

## 4. Shot list (priority A = must, B = nice)
Each prompt = the shot text below + the Global rules block.

A1 opening — "Pre-dawn, a wooden Indian fishing boat on calm dark sea, first blue light on the horizon, crew of three silhouetted at the gunwale preparing nets, slow push-in from water level." (replace old AI opening)
A2 catch — "Close-up on deck: crew in faded work shirts and rubber gloves hauling a dripping net over the side, real yellowfin tuna sliding onto the wet deck, sea spray, morning sun, slow lateral dolly."
A3 icing on board — "Crew packing whole fish into blue plastic crates layered with crushed ice; ice stays inside the crates; hands gloved; close medium shot, slow push-in."
A4 return/landing — "Fishing boat arriving at a busy Indian harbour jetty at morning, crew passing iced crates to workers on the jetty, gulls, no text on hulls, slow pan."
B2 pond harvest — "Aquaculture pond at sunrise in Andhra Pradesh, two farm workers in knee-deep water pulling a drag net, live vannamei shrimp jumping in the net at true size, mist over water, slow tracking shot."
B3 pond sorting — "Farm workers on the pond bund sorting live vannamei shrimp from a net into crates of ice water, close-up of hands and real shrimp, morning light."
C1 intake — "Refrigerated truck backed rear-first to a processing plant loading dock, rear doors open into the building, driver standing outside by the cab, masked workers unloading iced crates onto trolleys, wet concrete, early morning."
C2 washing/grading — "Inside a clean seafood processing hall, workers in white coats, hair caps, masks and gloves washing and grading shrimp on stainless steel tables under bright light, water running into floor drains, slow dolly along the table."
C3 peeling — "Close-up of gloved hands peeling and deveining raw shrimp at a steel table, neat rows of peeled shrimp in trays, shallow depth of field."
C4 lab — "Quality lab: technician in white coat and mask examining a shrimp sample, test tubes and a microscope on a clean bench, calm slow push-in." (no salmon, no microscope close-up artefacts)
C5 freezing — "Plate freezer / blast freezer area, frost on steel, worker in insulated jacket loading trays of glazed frozen shrimp, cold vapour that drifts realistically, slow pan." (caption must say freezer, not lab)
C6 packing — "Workers packing frozen shrimp blocks into plain white master cartons on a steel line, strapping machine, no printed text visible."
B6 cold store — "Cold storage room with pallets of plain cartons, frost, a forklift moving a pallet, cold mist, slow push-in."
D1 stuffing — "Workers loading pallets of cartons into a white reefer container at a plant dock, temperature unit on the container front (no readable text), slow dolly back."
(Port cranes, container placement, ship departure, ponds wide, globe = keep Blender. Use Higgsfield for these only if the approved Blender version still fails review.)

## 5. Stills (Higgsfield image model, highest quality)
Hero posters for each chapter = first frame of the accepted clip (not separate generations), exported as WebP <=150 KB.
Product shots (only if photoreal scans fail): "Studio product photo of one whole raw yellowfin tuna / one raw vannamei shrimp / one black tiger shrimp on crushed ice, dark slate background, soft key light, photoreal, no text." Must be species-correct; else keep the 3D scan.

## 6. Pipeline after acceptance
- Download original → `media/src/higgsfield/<shot>.mp4` (gitignored if >20 MB; keep only encoded outputs in repo).
- Encode with scripts/encode-clips.sh to 1920/1280/960 tiers, short GOP (6), -bf 0, faststart, <=2,250 KB each; make 720 mobile tier for every clip (no empty mobile frames — a3_720 and b2_720 were missing before).
- Match boundary frames with neighbouring Blender clips (boundary-check.sh); add a 6–10 frame crossfade only if they can't match.
- Update the media manifest, delete the replaced old AI clips and stills from the repo in the same PR.
- Credit every clip in HIGGSFIELD_LOG.md.
