"""Extract platform centerlines from the scene masks (requires Pillow)."""
from collections import deque
import json
from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parents[1] / 'game' / 'assets'
levels = {}

# Level 4 has one connected fork. Trace its five strokes separately so the
# open space between the stairs stays open and their junction stays walkable.
level4_fork = [
    (59, 404, 132, 404),
    (132, 404, 230, 504),
    (123, 573, 191, 573),
    (191, 573, 230, 504),
    (230, 504, 407, 504),
]

for name in ('level1', 'level2', 'level3', 'level4'):
    with Image.open(assets / (name + '.png')) as art:
        art_size = art.size
    if name == 'level3':
        # The fairground has one flat floor at the painted waterline (row 532).
        width, height = art_size
        levels[name] = {'width': width, 'height': height, 'platforms': [
            {'x1': 0, 'y1': 535, 'x2': width, 'y2': 535, 'halfThickness': 3},
        ]}
        continue
    with Image.open(assets / (name + '_mask.jpg')) as image:
        width, height = image.size
        # Ignore light JPEG edge ringing while keeping every dark component.
        mask = bytes(value < 100 for value in image.convert('L').tobytes())
    assert art_size == (width, height), 'Art and mask dimensions must match'
    dark = bytearray(mask)
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
        if name == 'level4' and (min_x, min_y, max_x, max_y) == (56, 401, 410, 576):
            for x1, y1, x2, y2 in level4_fork:
                for x in range(x1, x2 + 1):
                    y = round(y1 + (y2 - y1) * (x - x1) / (x2 - x1))
                    assert mask[y * width + x], 'Fork centerline must follow a dark mask stroke'
                platforms.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'halfThickness': 3.5})
        else:
            assert max_y - min_y < 24, 'Trace non-horizontal platforms as separate strokes'
            center_y = (min_y + max_y) / 2
            platforms.append({'x1': min_x, 'y1': center_y, 'x2': max_x, 'y2': center_y,
                              'halfThickness': (max_y - min_y + 1) / 2})
    platforms.sort(key=lambda platform: (platform['x1'], platform['y1']))
    levels[name] = {'width': width, 'height': height, 'platforms': platforms}
    print(f'{name}: {width} x {height}, {len(platforms)} platforms')
(assets / 'levels.json').write_text(json.dumps(levels, indent=2) + '\n', encoding='utf-8')
