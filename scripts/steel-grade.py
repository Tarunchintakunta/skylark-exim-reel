"""Grade the boxes on the racks of the photoreal cold-store start frame (Skylark-17-Oct/images/earlier-session/257-start-4k.png) from white to brushed, galvanised steel: cool grey,
streaked along the box faces, a soft sheen per shelf, darker edges. Workers, the floor, lights and the wall are left as
they are; framing is untouched. Regions are hand-placed for that frame (1280x720 coordinates, scaled to the still).
  python3 scripts/steel-grade.py <257-start-4k.png> <out.png>
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert('RGB'); W, H = img.size
a = np.asarray(img).astype(np.float32)
L = a.mean(2); sat = a.max(2) - a.min(2)
# regions in 1280x720 coordinates, scaled up: the two racks and the stack on the pallet jack
sx = W / 1280
def poly(pts): 
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([(x * sx, y * sx) for x, y in pts], fill=255); return np.asarray(m) > 0
racks = poly([(0, 0), (478, 0), (478, 482), (175, 645), (0, 705)]) | poly([(882, 0), (1280, 0), (1280, 612), (882, 470)]) | poly([(545, 355), (607, 355), (607, 508), (545, 508)])
people = (poly([(0, 95), (150, 95), (152, 200), (164, 233), (184, 300), (207, 400), (234, 500), (257, 566), (267, 600), (288, 720), (0, 720)]) | poly([(418, 248), (578, 248), (578, 350), (567, 350), (567, 690), (418, 690)])
          | poly([(600, 282), (728, 282), (728, 565), (600, 565)]) | poly([(812, 288), (908, 288), (908, 525), (812, 525)]) | poly([(0, 0), (1280, 0), (1280, 14), (0, 14)]))
# the stack on the pallet jack, between the woman and the man pulling the jack (no people mask: the jack is yellow and
# the man's glove blue, both kept out by saturation)
stack = poly([(569.5, 370), (600, 370), (600, 416.5), (640.5, 416.5), (640.5, 508), (556, 508), (556, 470), (569.5, 470)])
box = racks & ~people & (L > 135) & (sat < 35)
# whole box faces: close the holes (shaded faces, frost), then open away thin frost on the beams, then feather
m = Image.fromarray((box * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MinFilter(25)).filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.GaussianBlur(1.5 * sx))
m = np.asarray(m).astype(np.float32)
# the stack is narrow (the opening above would erase it): its own mask, closed only
st = Image.fromarray((stack & (L > 150) & (sat < 35)).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(1.5 * sx))
m = np.maximum(m, np.asarray(st).astype(np.float32))[..., None] / 255
# steel: cool grey, brushed (streaks along the box face), sheen, darker edges
rng = np.random.default_rng(7)
n = rng.normal(0, 1, (H, W)).astype(np.float32)
brush = np.asarray(Image.fromarray(((n * 40) + 128).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)).resize((W // 24, H), Image.BILINEAR).resize((W, H), Image.BICUBIC)).astype(np.float32) - 128
grey = 0.55 * L + 6 + brush * 0.4
yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
sheen = 22 * np.exp(-((yy * 6) % 1 - 0.35) ** 2 / 0.02)  # a soft highlight band per shelf
grey = grey + sheen
edges = np.asarray(Image.fromarray(L.clip(0, 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)
grey = grey - edges * 1.2
steel = np.stack([grey - 5, grey + 1, grey + 9], 2)
res = a * (1 - m) + steel * m
Image.fromarray(res.clip(0, 255).astype(np.uint8)).save(out)
