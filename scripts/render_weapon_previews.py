import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def add_light(location, energy, size, color):
    data = bpy.data.lights.new(name="Preview Light", type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new("Preview Light", data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0, 0, 0))


def render(path, output_path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output_path)
    scene.world = bpy.data.worlds.new("Preview World")
    scene.world.color = (0.012, 0.018, 0.025)

    camera_data = bpy.data.cameras.new("Preview Camera")
    camera = bpy.data.objects.new("Preview Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (2.7, -3.2, 0.15)
    camera.data.lens = 62
    look_at(camera, (0, 0, 0))
    scene.camera = camera

    add_light((2.8, -2.0, 3.2), 1100, 4.0, (1.0, 0.86, 0.68))
    add_light((-2.3, -1.0, 1.2), 850, 3.0, (0.35, 0.55, 1.0))
    add_light((0.0, 2.8, 0.6), 700, 2.5, (0.5, 0.8, 1.0))

    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 4:
        raise SystemExit("Expected spear, axe, sword and output directory")
    output_dir = Path(args[-1])
    output_dir.mkdir(parents=True, exist_ok=True)
    for source, name in zip(args[:3], ("spear", "axe", "sword")):
        render(Path(source), output_dir / f"{name}.png")


if __name__ == "__main__":
    main()



