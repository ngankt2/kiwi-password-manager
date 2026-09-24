"""Recreate branding and platform icons from the supplied images. Requires Pillow."""
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / 'assets' / 'branding'
IMAGES = ROOT / 'assets' / 'images'
source = Image.open(BRAND / 'appkiro-original.png').convert('RGBA')
width, height = source.size
alpha = source.getchannel('A')
remaining = bytearray(1 if value > 24 else 0 for value in alpha.tobytes())
kept = bytearray(width * height)

# Remove disconnected background specks without redrawing the supplied artwork.
for start in range(width * height):
    if not remaining[start]:
        continue
    remaining[start] = 0
    queue = deque([start])
    component = []
    while queue:
        index = queue.popleft()
        component.append(index)
        x, y = index % width, index // width
        for neighbor in (index - 1 if x else -1, index + 1 if x < width - 1 else -1,
                         index - width if y else -1, index + width if y < height - 1 else -1):
            if neighbor >= 0 and remaining[neighbor]:
                remaining[neighbor] = 0
                queue.append(neighbor)
    if len(component) >= 100:
        for index in component:
            kept[index] = 255
mask = Image.frombytes('L', source.size, bytes(kept)).filter(ImageFilter.MaxFilter(3))
source.putalpha(ImageChops.multiply(alpha, mask))
lockup = source.crop(source.getchannel('A').getbbox())
lockup.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
lockup.save(BRAND / 'appkiro-logo.png', optimize=True)
symbol = source.crop((0, 0, width, 901))
symbol = symbol.crop(symbol.getchannel('A').getbbox())


def centered(art, side, extent, background=(0, 0, 0, 0)):
    canvas = Image.new('RGBA', (side, side), background)
    fitted = ImageOps.contain(art, (extent, extent), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, ((side - fitted.width) // 2, (side - fitted.height) // 2))
    return canvas


def without_outer_matte(art):
    """Remove only near-black pixels connected to the image's outside edge."""
    art = art.convert('RGBA')
    w, h = art.size
    pixels = art.load()
    opacity = bytearray([255]) * (w * h)
    visited = bytearray(w * h)
    queue = deque()
    for x in range(w):
        queue.extend((x, (h - 1) * w + x))
    for y in range(1, h - 1):
        queue.extend((y * w, y * w + w - 1))
    while queue:
        index = queue.popleft()
        if visited[index]:
            continue
        visited[index] = 1
        x, y = index % w, index // w
        if max(pixels[x, y][:3]) > 20:
            continue
        opacity[index] = 0
        for neighbor in (index - 1 if x else -1, index + 1 if x < w - 1 else -1,
                         index - w if y else -1, index + w if y < h - 1 else -1):
            if neighbor >= 0 and not visited[neighbor]:
                queue.append(neighbor)
    art.putalpha(ImageChops.multiply(art.getchannel('A'), Image.frombytes('L', art.size, bytes(opacity))))
    return art.crop(art.getchannel('A').getbbox())


app_icon = Image.open(BRAND / 'appkiro-app-icon-original.png').convert('RGB')
icon_artwork = without_outer_matte(app_icon)
centered(symbol, 1024, 960).save(BRAND / 'appkiro-symbol.png', optimize=True)
# iOS requires an opaque square. Keep the supplied composition and its gradient.
app_icon.resize((1024, 1024), Image.Resampling.LANCZOS).save(IMAGES / 'icon.png', optimize=True)
# Keep all visible artwork inside Android's central 66/108 safe circle.
centered(icon_artwork, 1024, 500).save(IMAGES / 'android-icon-foreground.png', optimize=True)
Image.new('RGB', (1024, 1024), '#030621').save(IMAGES / 'android-icon-background.png', optimize=True)
monochrome = Image.new('RGBA', symbol.size, 'white')
monochrome.putalpha(symbol.getchannel('A'))
centered(monochrome, 1024, 520).save(IMAGES / 'android-icon-monochrome.png', optimize=True)
centered(symbol, 1024, 800).save(IMAGES / 'splash-icon.png', optimize=True)
centered(icon_artwork, 64, 62).save(IMAGES / 'favicon.png', optimize=True)

# macOS supplies no automatic mask, so retain transparent outer corners.
centered(icon_artwork, 1024, 900).save(IMAGES / 'macos-icon.png', optimize=True)
print('Updated Kiro Password Manager logo, splash, favicon, and platform icons.')
