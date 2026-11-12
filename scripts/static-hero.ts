import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { stagesFor } from '../src/reel/chain.ts'
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
  // #lcp /story: the reel's opening caption panel and its first frame as static HTML (same markup and CSS as
  // src/reel/Reel.tsx), so the first screen paints before any JS; App.tsx removes both once the canvas has taken over.
  const reelV = (id: string) => readFileSync(new URL('../src/reel/manifest.ts', import.meta.url), 'utf8').match(new RegExp(`'${id}': \\{[^}]*v: '([0-9a-f]+)'`))?.[1] ?? ''
  const caption = () =>
    (['ocean', 'pond'] as const)
      .map((p) => {
        const st = stagesFor(p)[0]
        return `<div class="reel-ui reel-static" data-path="${p}" aria-hidden="true"><div class="reel-cap" data-first-screen><p class="reel-cap__eyebrow"><b>01</b><span>${esc(st.label)}</span></p><h2 class="reel-cap__title">${esc(st.title[0])} <em>${esc(st.title[1])}</em></h2><div class="reel-cap__lines"><p class="reel-cap__line is-on">${esc(st.lines[0])}</p></div></div></div>`
      })
      .join('') +
    `<script>document.querySelector('.reel-static[data-path="'+(location.hash==='#pond'?'ocean':'pond')+'"]').remove()</script>`
  const firstFrame = () => {
    const urls = Object.fromEntries(
      (['ocean', 'pond'] as const).map((p) => {
        const id = stagesFor(p)[0].clips[0]
        return [p, { d: `/media/reel/${id}/d/000.avif?v=${reelV(id)}`, m: `/media/reel/${id}/m/000.avif?v=${reelV(id)}` }]
      }),
    )
    return `<script>(function(){var U=${JSON.stringify(urls)}[location.hash==='#pond'?'pond':'ocean'],q=function(m){return matchMedia(m).matches},mob=(q('(max-width: 819px)')||q('(pointer: coarse)'))&&innerHeight>innerWidth;document.currentScript.insertAdjacentHTML('afterend','<img id="first-frame" src="'+(mob?U.m:U.d)+'" alt="" fetchpriority="high" decoding="async">')})()</script>`
  }
  const captionCss =
    css('reel/reel.css') +
    `#first-frame{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9;pointer-events:none}.reel-static{z-index:11}`
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
