"""Grade the blue plastic crates (and the other saturated blue plastic: buckets, the deck's crate rows) in a clip to
galvanised steel, frame by frame: saturated blue only (sea, sky and water are teal or pale, and stay), turned into a cool
mid grey from the colour's brightness, with a little sheen. Framing and timing are untouched.
  [RED=1] [DARK=1] python3 scripts/crate-steel.py <in.mp4> <out.mp4>
"""
import subprocess
import sys

import os

import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
red = os.environ.get('RED') == '1'
dark = os.environ.get('DARK') == '1'
w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).decode().split(','))
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', '24', '-i', '-',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
yy, xx = np.mgrid[0:h, 0:w]
row = (xx > 0.56 * w) & (xx < 0.72 * w) & (yy > 0.38 * h) & (yy < 0.9 * h)
while True:
    buf = dec.stdout.read(w * h * 3)
    if len(buf) < w * h * 3:
        break
    a = np.frombuffer(buf, np.uint8).reshape(h, w, 3).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    # blue dominant and saturated: crates are (20, 90, 200)-ish, in shade or against the sun (60, 80, 120); the sea
    # (40, 110, 110) is not. RED=1 also takes hf-ice's two faded red crates in the row along the rail (red to pink, so only
    # inside that row's box: the crew's pink headscarves are outside it, and the orange waders and gloves are not red)
    blue = (b == mx) & (b - g > 15) & (b - r > 40) & (sat > 0.3) & (mx > 40)
    if dark:  # the crates' shaded sides against the sun (15, 17, 42): only where there is no sea in shot
        blue |= (b == mx) & (b - g > 10) & (b - r > 18) & (sat > 0.3) & (mx > 25)
    if red:
        blue |= row & (r == mx) & (r - g > 35) & (r - b > 35) & (np.abs(g - b) < 22) & (sat > 0.28) & (mx > 90)
    m = Image.fromarray(blue.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    m = np.asarray(m).astype(np.float32)[..., None] / 255
    grey = 0.72 * mx + 12
    steel = np.stack([grey - 4, grey, grey + 6], 2)
    enc.stdin.write((a * (1 - m) + steel * m).clip(0, 255).astype(np.uint8).tobytes())
enc.stdin.close()
sys.exit(dec.wait() or enc.wait())
