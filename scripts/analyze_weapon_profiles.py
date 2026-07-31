import json
import sys
from pathlib import Path

import bpy


def profile(path, bins=24):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    obj = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    z_min = min(vertex.z for vertex in vertices)
    z_max = max(vertex.z for vertex in vertices)
    step = (z_max - z_min) / bins
    rows = []
    for index in range(bins):
        low = z_min + index * step
        high = low + step
        sample = [vertex for vertex in vertices if low <= vertex.z <= high]
        if sample:
            rows.append({
                "z": round((low + high) * 0.5, 4),
                "x_width": round(max(vertex.x for vertex in sample) - min(vertex.x for vertex in sample), 4),
                "y_width": round(max(vertex.y for vertex in sample) - min(vertex.y for vertex in sample), 4),
                "count": len(sample),
            })
    return {"file": str(path), "profile": rows}


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    print(json.dumps([profile(Path(path)) for path in args], indent=2))


if __name__ == "__main__":
    main()
