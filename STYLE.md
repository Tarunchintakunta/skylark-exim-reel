# CG story look

One fixed style for every /story shot. Paste the style block into every image and video prompt, after the shot text.

## Style block (image prompts)

> Photoreal-scale cinematic CG, like a high-end 3D film still. Real-world scale and proportions, physically based
> materials: weathered painted steel, rust streaks, wet surfaces. Realistic water with wake, ripples and reflections.
> Atmospheric haze, film-like dawn or dusk light, deep navy shadows and sky, one warm amber accent (low sun or a work
> lamp). Wide lens (24-35 mm), shallow depth of field, subtle film grain. The subject is the clear hero of the frame.
> One vessel only. No logos, no letters, no numbers, no readable text anywhere. Not a toy, diorama, clay or plastic
> model, no tilt-shift or miniature look, no cartoon shapes, no empty flat studio background.

## Motion block (video prompts)

> Slow, steady cinematic camera: one continuous glide forward, push in or gentle orbit, like a camera on a boat or a
> drone. No handheld shake, no cuts, no zoom jumps. Everything moves forward in time only: nothing reverses, loops or
> returns to where it came from. Real-world scale and physics; the look of the first frame holds to the last.
> No text, no logos.

**Rejected (10 Nov):** the first pass (matte "clean 3D CG", studio light, simple navy background) read as a toy model.

## Approval flow

For each shot: 4 start-frame options (~2 credits each) go to Tarun first. After his pick: one 480p test (15). After the
test passes: HD (80). Never straight to HD.

Credit guard (Tarun, 11 Nov, 1,677 left for about 10 shots): at most one retake per shot. A shot that fails twice is
simplified (no people, no sun, camera on one line) or joined with a crossfade, never retaken again. Avoid people and
sun where possible. Before each shot, state credits left vs needed. Stop and ask if the projected total passes 2,900.

## Chaining

- The sun sits in the same spot in a shot's start and end frames, or is out of frame in both (Tarun, 10 Nov): a sun
  that moves between the two keyframes renders as two suns mid-shot (cg-depart-3, o2).
- Every remaining shot (Tarun, 11 Nov): start and end frames with the sun out of view or fully hidden, never a disc,
  glow or flare in frame; flat hazy horizon. p2 test E drew a horizon sun, then a second glow at the top edge.
- Keep the camera on one line between start and end frames: a big orbit plus descent cuts or dissolves (o2 to B).

- A shot's start frame is the last frame of the previous shot's HD final (`ffmpeg -sseof -0.05 … -update 1`).
- Planned end frames (keyframes) are made first, so each shot gets a start image and an end image.
- One grade on every clip: `scripts/cg-grade.sh` (same curves and saturation for all clips).
- One exception to chaining (Tarun, 10 Nov): chapter 02 to 03 joins with a crossfade into a separate deck shot. Every
  move over the trawler's stern (tests D, D retake, G, I) morphed the stern notch, so 03 starts on deck instead.
- A 480p test that fails gets at most one retake; if the retake fails too, new frame options instead (Tarun, 10 Nov).
  An object that appears out of nothing or a shape that morphs (a stern ramp filling in) is a fail.

## Grade (locked 10 Nov, Tarun: "less teal/blue, warmer midtones, neutral shadows")

Every CG clip, finished and new, goes through `scripts/cg-grade.sh`, never its own grade, so the joins stay seamless.

- Pull the renders' teal/navy cast back: warm midtones and highlights so the dawn light carries across water and hull.
- Shadows deep but neutral, not navy (cg-depart-1 frame 0 shadows: R14 G22 B28 before, R23 G25 B26 after).
- Lift exposure on the boat: gamma 1.10, contrast 1.05.
- Light sharpening at 2560 (Seedance HD is soft); desktop frame sets at AVIF crf 32-36 (`CRF=30 SET_KB=2150`, about 2 MB a clip), not 39.
- Caption shading sits only behind the caption text, neutral black (`stage.css` `.is-cg`), never a full-frame tint.
  Caption copy stays WCAG AA over the footage: `tests/story-caption-contrast.spec.ts`.

## Content rules (frame-check every clip)

- Real facts only (Visakhapatnam, Andhra Pradesh; raw material from farms or fishing vessels). Never "Bay of Bengal", never "purse seine".
- No logos or readable text. One vessel per shot.
- Forward-only actions. No AI errors (extra limbs, merging objects, nets closing on people).
- Indian right-hand-drive trucks; full-size 40 ft reefer container at the port.
- Scale check, every shot with people (Tarun, 11 Nov): before any 480p test, measure each person against the nearest
  vehicle and the palms in the start and end frames. Standing adult ≈ 1.7 m: about 1/2 to 2/3 the height of a
  full-size Indian reefer truck's box (about 3.5 m), a fraction of a coconut palm (10-20 m). Crouching adult ≈ 1/3 the
  truck's height. Out of scale = reject the frame. (p2 test B: the technician was almost the truck's height.)
- A person must be in frame from the first frame of the shot, or walk in from outside the frame. Never fade in.
