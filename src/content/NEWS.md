# Adding a news post

`src/content/news.json` is the only source for `/news`. Add an object to that array. Do not edit the page components.

Copy the shape from `news.example.json`:

| Field | Required | What it is |
|---|---|---|
| `slug` | yes | URL segment, `/news/<slug>`. Lowercase, hyphenated. |
| `date` | yes | `YYYY-MM-DD` from the source. |
| `title` | yes | The source headline. |
| `summary` | yes | One or two sentences. The card clamps this to two lines. |
| `image` | yes | A file under `public/`, for example `/media/news/name.webp`. |
| `widths` | no | Widths the image is also exported at, for sharp images on high-density screens: `[640, 960, 1280, 1920]` means `name_640.webp` … `name_1920.webp` sit next to `name.webp`. Export from the original, never upscale past it. |
| `body` | no | Longer text for the detail page. Omit it to show the summary. |
| `source` | yes | The `https://skylarkexim.com/...` page this item comes from. |

Only add a real item from skylarkexim.com: a news post, a certification, an event, or a new market. Do not invent dates, titles, or summaries. Do not add theme-demo posts or anything you cannot point at on that site.

Checked 2026-10-11: the contact page has no response-time line. `/blog-news/` is theme and casino spam. `/history/` is an unused logistics template. There is no dated certification, event, or new-market announcement, so `news.json` is empty on purpose.
