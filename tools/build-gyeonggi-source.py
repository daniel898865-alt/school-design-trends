"""Build display boundaries from the pinned upstream GeoJSON (Shapely 2.1.2).

Usage: python tools/build-gyeonggi-source.py path/to/HangJeongDong_ver20261001.geojson
The download is an explicit separate step; no upstream code is executed.
"""
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import shapely
from shapely.geometry import MultiPolygon, mapping, shape

ROOT = Path(__file__).resolve().parents[1]
SHA = "843ece3a0b3429742cd4a1b699cc13987a88b5e5401f382e7fdaaa194ea5e605"
COMMIT = "3bc00489b76696db864bdbea4b19985cdfa8b403"
UPSTREAM = "ver20261001/HangJeongDong_ver20261001.geojson"


def as_multi(geometry):
    return MultiPolygon([geometry]) if geometry.geom_type == "Polygon" else geometry


def main():
    raw = Path(sys.argv[1]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA:
        raise ValueError("Unexpected source hash; review the new boundary source first.")
    upstream = json.loads(raw)
    grouped = defaultdict(list)
    properties = {}
    for feature in upstream["features"]:
        p = feature["properties"]
        if p["sido"] != "41":
            continue
        if p["sidonm"] != "경기도" or p["adm_cd2"][:5] != p["sgg"]:
            raise ValueError("Gyeonggi code/name cross-check failed")
        grouped[p["sgg"]].append(shape(feature["geometry"]))
        properties[p["sgg"]] = p
    codes = sorted(grouped)
    if len(codes) != 47 or sum(map(len, grouped.values())) != 602:
        raise ValueError("Expected 47 leaf areas / 602 administrative dong")
    original = [shapely.union_all(grouped[code]) for code in codes]
    # Node all shared edges together, so the display does not develop cracks.
    lines = shapely.union_all([geometry.boundary for geometry in original])
    faces = shapely.get_parts(shapely.polygonize(shapely.get_parts(lines)))
    assigned = defaultdict(list)
    overlaps = 0
    for face in faces:
        point = face.representative_point()
        owners = [i for i, geometry in enumerate(original) if geometry.covers(point)]
        if not owners:
            continue  # retain true holes; never fill unassigned territory
        if len(owners) > 1:
            overlaps += 1
        assigned[owners[0]].append(face)
    clean = [shapely.union_all(assigned[i]) for i in range(len(codes))]
    if not shapely.coverage_is_valid(clean):
        raise ValueError("Noded boundary coverage is invalid")
    display = list(shapely.coverage_simplify(clean, tolerance=0.0004))
    if not shapely.coverage_is_valid(display) or not all(shapely.is_valid(g) for g in display):
        raise ValueError("Simplified boundary coverage is invalid")
    delta = sum(a.symmetric_difference(b).area for a, b in zip(original, clean))
    if delta > 1e-7:
        raise ValueError("Boundary cleanup changed more than numerical overlap slivers")
    cities = {}
    leaves = {}
    for code, geometry in zip(codes, display):
        p = properties[code]
        name = p["sggnm"]
        city_name = re.match(r"^(.+?[시군])", name).group(1)
        district_name = name[len(city_name):]
        city_code = code[:4] + "0" if district_name else code
        city = cities.setdefault(city_code, {"code": city_code, "name": city_name, "districts": [], "geometries": [], "source_feature_count": 0})
        city["geometries"].append(geometry)
        city["source_feature_count"] += len(grouped[code])
        if district_name:
            city["districts"].append({"code": code, "name": district_name})
            leaves[code] = (city_code, district_name, geometry, len(grouped[code]))
    if len(cities) != 31 or len(leaves) != 24:
        raise ValueError("Expected 31 cities/counties and 24 general districts")
    features = []
    definitions = []
    for city_code, city in sorted(cities.items()):
        geometry = as_multi(shapely.union_all(city.pop("geometries")))
        point = geometry.representative_point()
        features.append({"type": "Feature", "properties": {
            "code": city_code, "name": city["name"], "level": "city", "parent_code": "41",
            "source_feature_count": city["source_feature_count"],
            "label_point": [point.x, point.y],
        }, "geometry": mapping(geometry)})
        definitions.append({"code": city_code, "name": city["name"], "districts": city["districts"]})
    for code, (parent, name, geometry, count) in sorted(leaves.items()):
        point = geometry.representative_point()
        features.append({"type": "Feature", "properties": {
            "code": code, "name": name, "level": "district", "parent_code": parent,
            "source_feature_count": count, "label_point": [point.x, point.y],
        }, "geometry": mapping(as_multi(geometry))})
    source = {
        "dataset": "SGIS administrative-dong boundaries, modified by vuski/admdongkor",
        "boundary_as_of": "2026-10-01", "license": "CC-BY-4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "upstream_license": "KOGL Type 1 (SGIS)",
        "repository": "https://github.com/vuski/admdongkor", "upstream_commit": COMMIT,
        "upstream_path": UPSTREAM, "upstream_sha256": SHA,
        "attribution": "통계청 SGIS(공공누리 제1유형), 가공 vuski/admdongkor(CC BY 4.0). School Design Trends: 경기도 추출, 시군·일반구 합치기, 공유 경계 정리·단순화·SVG 변환.",
        "processing": {"shapely": shapely.__version__, "geos": shapely.geos_version_string,
                       "tolerance_degrees": 0.0004, "overlap_faces": overlaps,
                       "cleanup_symmetric_difference_sq_degrees": delta,
                       "source_dong_count": 602, "leaf_area_count": 47,
                       "coverage_valid": True},
    }
    output = {"type": "FeatureCollection", "source": source, "features": features}
    (ROOT / "public/maps/gyeonggi-regions.geojson").write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    (ROOT / "rules/gyeonggi.json").write_text(json.dumps({"boundary_as_of": "2026-10-01", "cities": definitions}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"cities": len(cities), "districts": len(leaves), "features": len(features), "source": source}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
