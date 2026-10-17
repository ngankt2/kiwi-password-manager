"""Recreate branding and platform icons from the supplied images. Requires Pillow."""
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

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


def centered(art, side, extent, background=(0, 0, 0, 0)):
    canvas = Image.new('RGBA', (side, side), background)
    fitted = ImageOps.contain(art, (extent, extent), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, ((side - fitted.width) // 2, (side - fitted.height) // 2))
    return canvas


def flood_from_edges(art, passable):
    """Return a mask (255) of pixels reachable from the image edge through passable pixels."""
    w, h = art.size
    pixels = art.load()
    reached = bytearray(w * h)
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
        if not passable(pixels[x, y]):
            continue
        reached[index] = 255
        for neighbor in (index - 1 if x else -1, index + 1 if x < w - 1 else -1,
                         index - w if y else -1, index + w if y < h - 1 else -1):
            if neighbor >= 0 and not visited[neighbor]:
                queue.append(neighbor)
    return Image.frombytes('L', art.size, bytes(reached))


def enclosed_regions(art, passable, min_area):
    """Return a mask (255) of passable regions of at least `min_area` pixels that do not touch the edge."""
    w, h = art.size
    pixels = art.load()
    found = bytearray(w * h)
    visited = bytearray(w * h)
    for start in range(w * h):
        if visited[start] or not passable(pixels[start % w, start // w]):
            continue
        visited[start] = 1
        queue, region = deque([start]), []
        while queue:
            index = queue.popleft()
            region.append(index)
            x, y = index % w, index // w
            for neighbor in (index - 1 if x else -1, index + 1 if x < w - 1 else -1,
                             index - w if y else -1, index + w if y < h - 1 else -1):
                if neighbor >= 0 and not visited[neighbor] and passable(pixels[neighbor % w, neighbor // w]):
                    visited[neighbor] = 1
                    queue.append(neighbor)
        if len(region) >= min_area:
            for index in region:
                found[index] = 255
    return Image.frombytes('L', art.size, bytes(found))


def squircle_mask(side, body):
    """Apple-style continuous-corner squircle of `body` pixels centred on a `side` canvas."""
    scale = 4
    big, half = side * scale, body * scale / 2
    centre = big / 2
    mask = Image.new('L', (big, big), 0)
    rows = []
    for y in range(big):
        dy = abs(y + 0.5 - centre) / half
        if dy >= 1:
            continue
        dx = (1 - dy ** 5) ** (1 / 5) * half
        rows.append((y, round(centre - dx), round(centre + dx)))
    draw = ImageDraw.Draw(mask)
    for y, left, right in rows:
        draw.line((left, y, right - 1, y), fill=255)
    return mask.resize((side, side), Image.Resampling.LANCZOS)


# The supplied icon is a white squircle (70..953) on a dark matte. Crop the tile and paint the
# matte, its antialiased rim and any corner marks white so every platform starts from a clean square.
supplied = Image.open(BRAND / 'appkiro-app-icon-original.png').convert('RGB')
tile = supplied.crop((70, 70, 954, 954))
matte = flood_from_edges(tile, lambda pixel: min(pixel) < 235)
tile.paste('white', mask=matte.filter(ImageFilter.MaxFilter(3)))
tile = tile.resize((1024, 1024), Image.Resampling.LANCZOS)
# Artwork alone: the white field reachable from the edge becomes transparent.
icon_artwork = tile.convert('RGBA')
# Large enclosed white areas (inside the shackle and the key bow) are background too; the
# slightly grey asterisks never pass the threshold, so they stay painted.
white = lambda pixel: min(pixel) > 238
field = ImageChops.lighter(flood_from_edges(tile, white), enclosed_regions(tile, white, 400))
field = field.filter(ImageFilter.MaxFilter(3))
icon_artwork.putalpha(ImageOps.invert(field).filter(ImageFilter.GaussianBlur(0.6)))
icon_artwork = icon_artwork.crop(icon_artwork.getchannel('A').getbbox())
# Re-centre the artwork with breathing room so platform corner masks never clip the lock or sparkles.
tile = Image.new('RGBA', (1024, 1024), 'white')
fitted = ImageOps.contain(icon_artwork, (800, 800), Image.Resampling.LANCZOS)
tile.alpha_composite(fitted, ((1024 - fitted.width) // 2, (1024 - fitted.height) // 2))
tile = tile.convert('RGB')

# The in-app symbol and splash reuse the icon artwork so every surface shows the same kiwi lock.
centered(icon_artwork, 1024, 960).save(BRAND / 'appkiro-symbol.png', optimize=True)
# iOS requires an opaque square and applies its own mask.
tile.save(IMAGES / 'icon.png', optimize=True)
# Keep all visible artwork inside Android's central 66/108 safe circle.
centered(icon_artwork, 1024, 560).save(IMAGES / 'android-icon-foreground.png', optimize=True)
Image.new('RGB', (1024, 1024), '#FFFFFF').save(IMAGES / 'android-icon-background.png', optimize=True)
# Themed icon: darker artwork reads as more opaque, so the lock, seeds and rim stay distinct.
tone = icon_artwork.convert('L').point(lambda value: min(255, (255 - value) * 8 // 5))
monochrome = Image.new('RGBA', icon_artwork.size, 'white')
monochrome.putalpha(ImageChops.multiply(icon_artwork.getchannel('A'), tone))
centered(monochrome, 1024, 560).save(IMAGES / 'android-icon-monochrome.png', optimize=True)
centered(icon_artwork, 1024, 800).save(IMAGES / 'splash-icon.png', optimize=True)


def masked_tile(side, body):
    """The tile clipped to a squircle with transparent outer corners (macOS and the web)."""
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(tile.resize((body, body), Image.Resampling.LANCZOS), ((side - body) // 2,) * 2)
    canvas.putalpha(squircle_mask(side, body))
    return canvas


masked_tile(64, 62).save(IMAGES / 'favicon.png', optimize=True)
# macOS supplies no automatic mask: follow Apple's 824/1024 grid with a soft drop shadow.
macos = masked_tile(1024, 824)
shadow = Image.new('RGBA', macos.size, (0, 0, 0, 0))
shadow.putalpha(macos.getchannel('A').point(lambda value: value * 70 // 255).filter(ImageFilter.GaussianBlur(14)))
macos_icon = Image.new('RGBA', macos.size, (0, 0, 0, 0))
macos_icon.alpha_composite(shadow, (0, 10))
macos_icon.alpha_composite(macos)
macos_icon.save(IMAGES / 'macos-icon.png', optimize=True)
print('Updated Kiwi Password logo, splash, favicon, and platform icons.')
