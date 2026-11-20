"""Extract horizontal platform centerlines from the original masks (requires Pillow)."""
from collections import deque
import json
from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parents[1] / 'game' / 'assets'
levels = {}
for name in ('level1', 'level2'):
    with Image.open(assets / (name + '_mask.jpg')) as image:
        width, height = image.size
        # Ignore light JPEG edge ringing while keeping every dark component.
        dark = bytearray(value < 100 for value in image.convert('L').tobytes())
    with Image.open(assets / (name + '.png')) as art:
        assert art.size == (width, height), 'Art and mask dimensions must match'
    platforms = []
    for seed in range(width * height):
        if not dark[seed]:
            continue
        dark[seed] = 0
        todo = deque([seed])
        min_x, min_y, max_x, max_y = width, height, 0, 0
        while todo:
            position = todo.pop()
            y, x = divmod(position, width)
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            neighbours = []
            if x: neighbours.append(position - 1)
            if x < width - 1: neighbours.append(position + 1)
            if y: neighbours.append(position - width)
            if y < height - 1: neighbours.append(position + width)
            for neighbour in neighbours:
                if dark[neighbour]:
                    dark[neighbour] = 0
                    todo.append(neighbour)
        center_y = (min_y + max_y) / 2
        platforms.append({'x1': min_x, 'y1': center_y, 'x2': max_x, 'y2': center_y,
                          'halfThickness': (max_y - min_y + 1) / 2})
    platforms.sort(key=lambda platform: (platform['x1'], platform['y1']))
    levels[name] = {'width': width, 'height': height, 'platforms': platforms}
    print(f'{name}: {width} x {height}, {len(platforms)} platforms')
(assets / 'levels.json').write_text(json.dumps(levels, indent=2) + '\n', encoding='utf-8')
