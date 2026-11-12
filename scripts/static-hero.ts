import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { COPY_RIGHT, chaptersFor } from '../src/config/chapters.ts'
import { exportsLine, start } from '../src/config/content.ts'
import { heroPoster } from '../src/config/hero.ts'
import { versioned } from './clip-manifest.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const css = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '')

/**
 * #207 LCP: the hero headline and body as static HTML, painted before any JS and above the loader (occluded text does
 * not count for LCP). Homepage only (/story opens on its first chapter, no hero). Markup mirrors src/home/HomeHero.tsx
 * and comes from the same content.ts, so the copy never drifts.
 * Where the copy would meet the loader mark, an inline script drops it under the loader (see below).
 * The loader removes #hero-static when it finishes; React's hero sits at the same fixed position, so nothing shifts.
 */
export function staticHero(): Plugin {
  const lead = start.title.replace(/ world\.$/, '')
  // the fork links over to /story (no aria-current: no path is chosen here)
  const html = () => `<div class="hero hero--static" id="hero-static" data-first-screen><div class="hero__copy">
<p class="hero__eyebrow mono">${esc(start.eyebrow)}</p>
<h1 class="hero__title">${esc(lead)} <em>world</em>.</h1>
<p class="hero__body">${esc(start.body)}</p>
<div class="hero__exports"><h2 class="hero__exports-title mono">${esc(exportsLine.title)}</h2><ul>${exportsLine.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
<a class="hero__contact" href="/quote">Contact us</a><div class="hero__fork" role="group" aria-label="${esc(start.choose)}"><span class="hero__fork-label mono">${esc(start.choose)}</span><a class="hero__fork-btn" href="/story#ocean" data-path="ocean">${esc(start.ocean.sub)}</a><a class="hero__fork-btn" href="/story#pond" data-path="pond">${esc(start.pond.sub)}</a></div>
</div></div>`
  // after the loader markup (end of body), once the web fonts have set the copy (fallback metrics differ): is there
  // room above the copy for the mark? Only z-index changes, so the check can never shift the layout
  // `font-display: block` paints no text until the faces are in, but the copy's box is laid out with the fallback's
  // metrics and re-flows when they arrive: 0.04 CLS on Fast 4G (#264). The copy is held invisible until
  // document.fonts.ready (it has nothing to show before that anyway) and the same callback does the mark-fit check.
  const fit = `<script>document.fonts.ready.then(function(){document.documentElement.classList.add('fonts-in');var b=document.querySelector('.loader__track'),h=document.querySelector('#hero-static h1');if(b&&h&&h.getBoundingClientRect().top<b.getBoundingClientRect().bottom+24)document.documentElement.classList.add('hero-under-loader')})</script>`
  // tokens (vars + @font-face), the base rules the hero inherits from global.css, and hero.css itself
  const base =
    'body{color:var(--ice);font-family:var(--f-body);font-size:var(--fs-body);line-height:1.6;-webkit-font-smoothing:antialiased}' +
    'h1,h2,p,ul{margin:0}ul{padding:0;list-style:none}a{color:inherit}' +
    'h1{font-family:var(--f-display);font-weight:400;letter-spacing:-0.01em;line-height:0.98;text-wrap:balance}h1 em{font-style:italic}' +
    '.mono{font-family:var(--f-body);font-size:var(--fs-small);letter-spacing:0.04em;line-height:1.45}' +
    // id selector: the bundled hero.css (.hero hidden until ready) loads after this style and must not win
    '#hero-static{visibility:visible;opacity:1;z-index:101}#hero-static .hero__copy{pointer-events:none;visibility:hidden}' +
    '.fonts-in #hero-static .hero__copy{visibility:visible}' +
    // no room above the copy even for the small mark (360×640, landscape phones): the inline script measures it once the
    // fonts are in and only drops the copy under the loader (z-index, no layout change), as before #207
    '.hero-under-loader #hero-static{z-index:var(--z-copy)}'
  // #lcp /story: the opening caption (o1, or p1 for #pond) as static HTML, the same markup as src/film/ChapterCopy.tsx.
  // It sits where the film's caption sits, under the intro, so the page looks as before; but it paints before any JS
  // and is /story's LCP. The app's own caption takes its place, same size, once the page has mounted (Loader.tsx).
  const caption = () =>
    (['ocean', 'pond'] as const)
      .map((p) => {
        const ch = chaptersFor(p)[0]
        const c = ch.captions[0]
        const m = c.eyebrow?.match(/^(.*?)\s*·\s*(\d{2})$/)
        const eyebrow = !c.eyebrow ? '' : `<p class="caption__eyebrow mono">${m ? `<span class="caption__num">${m[2]}</span>${esc(m[1])}` : esc(c.eyebrow)}</p>`
        const place = `${COPY_RIGHT.has(ch.id) ? ' caption--right' : ''}${ch.theme === 'light' ? ' caption--light' : ''}`
        return `<article class="caption caption--static${place}" data-path="${p}" data-first-screen aria-hidden="true">${eyebrow}<h2 class="caption__title display">${esc(c.title)}</h2>${c.body ? `<p class="caption__body">${esc(c.body)}</p>` : ''}</article>`
      })
      .join('') +
    // the store picks the path the same way (engine/store.ts): #pond, else the ocean
    `<script>document.querySelector('.caption--static[data-path="'+(location.hash==='#pond'?'ocean':'pond')+'"]').remove()</script>`
  // #309: /story's opening picture as static HTML, under the intro, so the first chapter's true first frame is on screen
  // at once (Terminal Industries' pattern) instead of a blank intro. It is the very file the stage draws first (desktop:
  // the frame sequence's frame 0, same versioned URL as segments.ts seqUrl; upright phones: the clip's portrait poster),
  // so it costs no second download. Loader.tsx removes it once the stage has taken over. Landscape phones, Save-Data
  // and 3G (the 960 tier) keep the plain intro.
  const firstFrame = () => {
    const manifest = readFileSync(new URL('../src/film/manifest.ts', import.meta.url), 'utf8')
    const seqV = (id: string) => manifest.match(new RegExp(`'${id}': \\{ frames: \\d+,[^}]*v: '([0-9a-f]+)'`))?.[1]
    const urls = Object.fromEntries(
      (['ocean', 'pond'] as const).map((p) => {
        const id = chaptersFor(p).flatMap((ch) => ch.media).find((m) => m.kind === 'video')!.id
        const v = seqV(id)
        const seq = (ext: string) => (v ? `/media/${id}-f_1920_000.${ext}?v=${v}` : '')
        return [p, { seq: [seq('avif'), seq('webp')], m: [versioned(`${id}_m.avif`), versioned(`${id}_m.webp`)] }]
      }),
    )
    return `<script>(function(){var U=${JSON.stringify(urls)}[location.hash==='#pond'?'pond':'ocean'],q=function(m){return matchMedia(m).matches},c=navigator.connection||{},mob=q('(max-width: 819px)')||q('(pointer: coarse)');if(c.saveData||/^(slow-2g|2g|3g)$/.test(c.effectiveType||''))return;var f=mob?(innerHeight>innerWidth?U.m:null):U.seq;if(!f||!f[0])return;document.currentScript.insertAdjacentHTML('afterend','<picture id="first-frame" aria-hidden="true"><source type="image/avif" srcset="'+f[0]+'"><img src="'+f[1]+'" alt="" fetchpriority="high" decoding="async"></picture>')})()</script>`
  }
  // held invisible until the fonts are in, like the hero copy (a fallback-font first paint would re-flow it: CLS)
  // (line-height: the 0.98 lines plus the 0.06em each SplitText line gets, so the title is as tall as the film's)
  // (bottom: chrome.css's phone rule arrives with the app's CSS and film.css's comes back with the lazy story chunk; the
  // film's caption ends on film.css's, so the static one keeps it throughout: no 29 px jump, CLS 0)
  const bottom = readFileSync(new URL('../src/film/film.css', import.meta.url), 'utf8').match(/bottom:\s*(clamp\([^;]+\));/)![1]
  const captionCss =
    css('film/film.css') +
    // the static first frame (#309) under the opening caption (z 10) and the intro, which thins to a light veil over it (story.html)
    `#first-frame img{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9;pointer-events:none}` +
    `.fonts-in .caption--static{visibility:visible;opacity:1}.caption--static .caption__title{line-height:1.04}.caption.caption--static{bottom:${bottom}}`
  // the hero poster (LCP image, #hd): AVIF preloads with the hero <picture>'s own sources, so the browser picks the same
  // file for both; browsers without AVIF skip them (type) and load the WebP from the <picture>
  const preload = () =>
    heroPoster(versioned)
      .filter((p) => p.type === 'image/avif')
      .map((p) => `<link rel="preload" as="image" type="${p.type}" imagesrcset="${p.srcSet}" imagesizes="100vw" media="${p.media}" fetchpriority="high" />`)
      .join('\n    ')
  return {
    name: 'static-hero',
    // the hero pages' own stylesheets are small: inline them so the first paint waits on no request (lazy CSS stays lazy);
    // /news and /quote too (#308): their static heading is their LCP
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        for (const name of ['index.html', 'story.html', 'news.html', 'quote.html']) {
          const html = bundle[name]
          if (html?.type !== 'asset') continue
          html.source = String(html.source).replace(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/g, (tag, file: string) => {
            const css = bundle[file]
            return css?.type === 'asset' ? `<style>${css.source}</style>` : tag
          })
        }
      },
    },
    // 'pre': before Vite's own HTML pass, which strips CSS comments (and with them the placeholder)
    transformIndexHtml: {
      order: 'pre',
      handler: (src) =>
        src
          .replace('/*static-hero-css*/', css('styles/tokens.css') + base + css('ui/hero.css'))
          .replace('/*static-caption-css*/', captionCss)
          .replace('<!--static-hero-->', html())
          .replace('<!--static-caption-->', firstFrame() + caption())
          .replace('<!--hero-preload-->', preload())
          .replace('</body>', `${fit}\n  </body>`),
    },
  }
}
