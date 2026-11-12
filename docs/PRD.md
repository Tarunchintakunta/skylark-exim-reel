# PRD.md: Skylark Exim website v3

## 1. Problem
skylarkexim.com (WordPress/Elementor) lists the right facts but doesn't make an overseas buyer feel the quality of the operation. Two cinematic drafts exist (`skylark` "Two Origins" and `skylark-exim-cinematic` "kohl"); both look good but are heavy (frame-sequence scrubbing, 74–100 MB of frames), contain claims that are not on the real site, and have scene errors Tarun flagged (no real catch, workers without masks, overdone freezer, truck nose-first into the plant, vehicles driving opposite ways, dark globe).

## 2. Goal
A new, award-level (Awwwards SOTD standard) cinematic scroll site that tells the real cold-chain story in about a minute of scrolling, stays buttery smooth on ordinary laptops and phones, and turns visits into export quote requests.

## 3. Audience
Primary: **overseas seafood importers, distributors and buyers** (procurement managers, owners) in Skylark's 16 listed markets: China, Europe, Vietnam, UAE (Sharjah), Turkey, Thailand, Taiwan, Sri Lanka, Malaysia, Kuwait, Japan, Egypt, Bangkok, Algeria, Russia, Hong Kong. English-reading, often on desktop at work, sometimes on mobile on the move, sometimes on slow connections.
Secondary: farmer partners, logistics partners, prospective staff.

Buyer questions, in order: *What do you sell? Can I trust your quality and paperwork? How do I order?*

## 4. User journeys
1. **First-time buyer (desktop):** loader → start screen → keeps THE OCEAN (default) → scrolls the film (~10 scenes) → Products → Why choose us → Request export quote form → submits.
2. **Shrimp buyer:** start screen → THE POND → ponds, traceability, harvest → shared plant → globe → Products opens on the *Shrimps* tab → sees the six forms (Head-on Shell-on, Headless Shell-on, PUD, Peeled & Deveined, Pin Deveined, Easy Peel) → RFQ with species + form pre-selected from what they viewed.
3. **Repeat buyer / in a hurry:** loader → "Skip the story" → Products → RFQ. Or the sticky "Request export quote" from anywhere.
4. **Mobile buyer on 4G:** same story at 720w with native touch scroll; never more than ~12 MB for the whole path.
5. **Reduced-motion / keyboard / screen-reader user:** stills instead of scrubbed video, every chapter reachable by Tab/arrow keys, all copy readable as normal HTML.
6. **Switcher:** midway through Ocean, taps the "Ocean ⇄ Pond" pill → lands at the first Pond chapter, HUD updates.

## 5. Scenes and sections
Defined in `STORY.md` (authoritative). Summary: Loader → Start/fork → Ocean (Setting out, The catch, On ice, Back to Vizag) **or** Pond (Ponds, Traceable, Harvest) → Plant (Intake; Wash·Grade·Process; Lab·Freeze·Pack·Cold store) → Export (Documentation, Port cranes, At sea, Bright globe) → Products → Why choose us → About → Request quote → Footer.

## 6. Functional requirements
| ID | Requirement |
|---|---|
| F1 | Loader with animated logo and a progress bar driven by real bytes loaded (fonts, first poster, first clip head, first critical asset). Scroll locked until ready. |
| F2 | Start screen with THE OCEAN (default) and THE POND buttons; keyboard operable; path switchable at any time via header pill. |
| F3 | Film chapters pinned; scroll position scrubs video frames 1:1 (forward and backward), no autoplay. |
| F4 | Both paths converge on the plant and share the Export chapters and globe. |
| F5 | Fixed right-edge cold-chain HUD: workflow step (01–09, site names) + state label; temperature only at cold storage (−18 °C to −20 °C). Hidden on screens < 768 px (replaced by a slim top progress bar with the step name). |
| F6 | Chapter navigation: a left rail of chapter ticks (click/keyboard to jump), plus top nav: Story · Products · Why us · About · Quote. |
| F7 | "Skip the story" link → #products. Sticky "Request export quote" CTA always visible after the loader. |
| F8 | Bright daytime 3D globe with gold arcs Visakhapatnam → 16 markets drawn on scroll; market list in DOM; hover/focus highlights an arc. |
| F9 | Products: tabs Marine Fish / Shrimps, 3D tuna + swordfish + shrimp, full species lists, shrimp forms grid, Raw fresh / Chilled / Frozen. |
| F10 | Trust strip, About (company, vision, mission, managing partners). |
| F11 | RFQ form (validated), submits to a serverless function that emails info@skylarkexim.com when an email key is configured; otherwise opens a pre-filled mailto. Success and error states. Company profile PDF download. |
| F12 | Clickable phones (`tel:`), email (`mailto:`), office and processing-unit addresses. |
| F13 | Optional ambient sound toggle, **off by default**, remembered in localStorage. |
| F14 | Reduced motion: no scrubbing, chapters show posters as stills with the same copy; no parallax, no SplitText animations. |

## 7. Content requirements
- Every factual statement comes from `CONTENT.md`. Banned items are listed at the end of CONTENT.md.
- Headlines may be editorial but make no factual claim.
- Items in `confirm-list.md` must render fine if Tarun never answers (fallbacks provided).
- No stock "sample" values (no fake batch numbers, temperatures, dates, certificate IDs).
- Alt text for every poster/still describing what is on screen.

## 8. Success metrics
| Metric | Target |
|---|---|
| Lighthouse mobile performance | ≥ 85 (desktop ≥ 95) |
| LCP | < 2.5 s (mobile, 4G profile) |
| CLS | < 0.05 |
| Scroll smoothness | 60 fps desktop; ≥ 50 fps with 4× CPU throttle (mobile emulation); no long task > 50 ms during a normal scroll on desktop |
| Weight | initial ≤ 3 MB (target 1.5); full scroll ≤ 25 MB desktop / ≤ 12 MB mobile |
| Accessibility | Lighthouse a11y ≥ 95; axe: 0 serious/critical |
| Business | RFQ submissions per week (baseline from today's contact form); % of visitors reaching Products (≥ 50%); median time to RFQ open |

## 9. Out of scope (v3)
E-commerce/cart (the old WooCommerce shop), multi-language, CMS, blog, gallery page, prices/MOQ/size grades, live shipment tracking, login/portal, cookie banner (no tracking cookies by default), any claim not on the real site.
