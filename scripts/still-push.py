"""A 72-frame 2560x1440 clip master from one 3840x2160 still: a slow push-in, sampled with sub-pixel crops (bicubic), so
the move never steps a whole pixel at a time (ffmpeg zoompan rounds its crop to whole pixels and judders).
  python3 scripts/still-push.py <still> <out.mp4> <cx> <cy> <zoom at the last frame>
cx, cy: the point the push closes on, as shares of the still's width and height. Near-lossless H.264 (crf 10), 24 fps.
"""
import subprocess
import sys

from PIL import Image

src, out, cx, cy, z1 = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
im = Image.open(src).convert('RGB')
W, H = im.size
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '2560x1440', '-r', '24', '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
for i in range(72):
    t = i / 71
    e = t * t * (3 - 2 * t) * 0.5 + t * 0.5  # mostly linear, eased at both ends
    z = 1 + (z1 - 1) * e
    w, h = W / z, H / z
    x0 = min(max(cx * W - w / 2, 0), W - w)
    y0 = min(max(cy * H - h / 2, 0), H - h)
    ff.stdin.write(im.transform((2560, 1440), Image.Transform.EXTENT, (x0, y0, x0 + w, y0 + h), Image.Resampling.BICUBIC).tobytes())
ff.stdin.close()
sys.exit(ff.wait())
