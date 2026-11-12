"""Phones only: hf-port-1 and hf-port-2's phone masters become a slow pull-back on hf-port-3's first frame, in the
phone crop every port clip uses (608x1080 at 848,360 of the 2560 master, scaled to 810x1440). On a phone the canopy
roof of hf-port-1 is a full-width band between the camera and the cranes, so no crop keeps it under a quarter of the
screen with a crane in shot; the phone port opens on the crane instead. The pull-back runs continuously across both
clips and lands exactly on hf-port-3's first frame, so the crossfade into hf-port-3 matches and every segment keeps
its slot and timing.
DESKTOP=1: the same pull-back on the whole 2560x1440 frame, for the desktop frame sequences (scripts/clip-frames.sh),
so the desktop port also opens on the crane and the container instead of the gate canopy and the empty quay.
  [DESKTOP=1] python3 scripts/phone-port-hold.py <hf-port-3 first frame png> <frames 1> <frames 2> <out1.mp4> <out2.mp4>
"""
import os
import subprocess
import sys

from PIL import Image

src, n1, n2, o1, o2 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
im = Image.open(src).convert('RGB')
desk = os.environ.get('DESKTOP') == '1'
X, Y, W, H = (0, 0, 2560, 1440) if desk else (848, 360, 608, 1080)  # the whole frame, or the port film's phone crop
OW, OH = (2560, 1440) if desk else (810, 1440)
Z0 = 1.12  # zoom at the first frame of hf-port-1; 1.0 at the last frame of hf-port-2
total = n1 + n2 - 1


def clip(out, first, n):
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OW}x{OH}', '-r', '24', '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for i in range(first, first + n):
        z = Z0 + (1 - Z0) * min(i, total) / total
        w, h = W / z, H / z
        x0, y0 = X + (W - w) / 2, Y + (H - h) / 2
        ff.stdin.write(im.transform((OW, OH), Image.Transform.EXTENT, (x0, y0, x0 + w, y0 + h), Image.Resampling.BICUBIC).tobytes())
    ff.stdin.close()
    if ff.wait():
        sys.exit(1)


# hf-port-2's first frame repeats hf-port-1's last, as the film's segments share their boundary frames
clip(o1, 0, n1)
clip(o2, n1 - 1, n2)
