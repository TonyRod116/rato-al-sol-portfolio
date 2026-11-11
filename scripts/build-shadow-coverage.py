"""Build the app's shadow geometry from the archives in docs/DATA_SOURCES.md."""

import argparse
import struct
import xml.etree.ElementTree as ET
from collections import defaultdict
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from pyproj import Transformer
from shapely import STRtree, union_all
from shapely.geometry import Polygon, shape

GML = '{http://www.opengis.net/gml/3.2}'
BUILDINGS = '{http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0}'
GRID = 4000
SCALE = 1_000_000
ROOT = Path(__file__).resolve().parents[1]
CITY = {'barcelona': ('08900', 25831), 'madrid': ('28900', 25830)}


def positions(ring):
    text = ring.findtext('.//' + GML + 'posList', '')
    values = [float(value) for value in text.split()]
    return list(zip(values[::2], values[1::2], strict=True))


def cadastral_buildings(archive, code):
    with ZipFile(archive) as source, source.open(f'A.ES.SDGC.BU.{code}.buildingpart.gml') as parts:
        events = ET.iterparse(parts, events=('start', 'end'))
        _, root = next(events)
        for event, feature in events:
            if event != 'end' or feature.tag != GML + 'featureMember':
                continue
            part = feature.find(BUILDINGS + 'BuildingPart')
            if part is None:
                root.clear()
                continue
            floors = int(part.findtext(BUILDINGS + 'numberOfFloorsAboveGround') or 0)
            if 0 < floors <= 100:
                for surface in part.iter(GML + 'PolygonPatch'):
                    exterior = surface.find(GML + 'exterior')
                    if exterior is None:
                        continue
                    outline = positions(exterior)
                    if len(outline) < 4:
                        continue
                    footprint = Polygon(outline, [positions(hole) for hole in surface.findall(GML + 'interior')])
                    yield floors * 3, footprint if footprint.is_valid else footprint.buffer(0)
            root.clear()


def municipal_buildings(archive):
    import shapefile

    with ZipFile(archive) as source, shapefile.Reader(
        shp=BytesIO(source.read('ALTURAS_EDIFICIOS.shp')),
        dbf=BytesIO(source.read('ALTURAS_EDIFICIOS.dbf')),
    ) as buildings:
        for record in buildings.iterShapeRecords(fields=['ALTURA']):
            height = record.record['ALTURA']
            if height is None or not 0 < height <= 500:
                continue
            footprint = shape(record.shape.__geo_interface__)
            footprint = footprint if footprint.is_valid else footprint.buffer(0)
            if not footprint.is_empty:
                yield height, footprint


def shadow_buildings(archive, code, municipal_archive):
    if municipal_archive is None:
        yield from cadastral_buildings(archive, code)
        return

    municipal = list(municipal_buildings(municipal_archive))
    if not municipal:
        raise ValueError('No valid heights in the Madrid municipal archive')
    print(f'Madrid: {len(municipal):,} municipal features', flush=True)
    index = STRtree([footprint for _, footprint in municipal])
    yield from municipal
    for height, footprint in cadastral_buildings(archive, code):
        hits = index.query(footprint, predicate='intersects')
        if not len(hits):
            yield height, footprint
            continue
        missing = footprint.difference(union_all(index.geometries[hits]))
        for part in polygons(missing):
            # Small differences between survey outlines do not establish a separate building.
            if part.area >= 5 and not part.buffer(-0.75).is_empty:
                yield height, part


def polygons(geometry):
    if geometry.geom_type == 'Polygon' and not geometry.is_empty:
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms:
            yield from polygons(part)


def build(city, archive, municipal_archive, output):
    code, crs = CITY[city]
    transform = Transformer.from_crs(crs, 4326, always_xy=True)

    def coordinates(ring):
        lon, lat = transform.transform(*ring.xy)
        points = [(round(x * SCALE), round(y * SCALE)) for x, y in zip(lon, lat, strict=True)]
        area = sum(x * next_y - y * next_x for (x, y), (next_x, next_y) in zip(points, points[1:]))
        return points if area else []

    tiles = defaultdict(bytearray)
    count = 0
    for height, footprint in shadow_buildings(archive, code, municipal_archive):
        for polygon in polygons(footprint.simplify(0.55, preserve_topology=True)):
            outer = coordinates(polygon.exterior)
            if not outer:
                continue
            rings = [outer]
            for interior in polygon.interiors:
                hole = coordinates(interior)
                if hole:
                    rings.append(hole)
            count += 1
            lon, lat = zip(*outer, strict=True)
            for x in range(min(lon) // GRID, max(lon) // GRID + 1):
                for y in range(min(lat) // GRID, max(lat) // GRID + 1):
                    tile = tiles[x, y]
                    tile.extend(struct.pack('<IHH', count, max(1, round(height * 10)), len(rings)))
                    for ring in rings:
                        tile.extend(struct.pack('<H', len(ring)))
                        for east, north in ring:
                            tile.extend(struct.pack('<hh', east - x * GRID, north - y * GRID))
    if not tiles:
        raise ValueError(f'No shadow polygons in the {city} archive')

    index = {}
    with (output / f'{city}.bin').open('wb') as target:
        for (x, y), tile in sorted(tiles.items()):
            index[f'{x},{y}'] = [target.tell(), len(tile)]
            target.write(tile)
    entries = ',\n'.join(f'  "{key}": {value}' for key, value in index.items())
    (output / f'{city}.json').write_text('{\n' + entries + '\n}\n', encoding='utf-8')
    print(f'{city}: {count:,} polygons, {len(tiles):,} tiles, {(output / f"{city}.bin").stat().st_size:,} bytes', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('city', choices=CITY)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--municipal', type=Path, help='Madrid municipal heights ZIP')
    args = parser.parse_args()
    if (args.city == 'madrid') != (args.municipal is not None):
        parser.error('Use --municipal with Madrid only')
    output = ROOT / 'mobile' / 'assets' / 'shadow-data'
    output.mkdir(exist_ok=True)
    build(args.city, args.archive, args.municipal, output)


if __name__ == '__main__':
    main()
