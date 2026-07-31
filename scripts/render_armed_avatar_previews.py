import sys
from pathlib import Path

import bpy
from mathutils import Vector


CLIPS = ("Axe_Stance",)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(name, location, energy, size, color):
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0, 0, 1.0))


def set_action(owner, action):
    if owner.animation_data is None:
        owner.animation_data_create()
    for track in owner.animation_data.nla_tracks:
        track.mute = True
    owner.animation_data.action = action
    slot_id = f"OB{owner.name}"
    owner.animation_data.action_slot = next(slot for slot in action.slots if slot.identifier == slot_id)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Expected input GLB and output directory")
    input_path, output_dir = map(Path, args)
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("Preview World")
    scene.world.color = (0.007, 0.012, 0.018)

    camera_data = bpy.data.cameras.new("Preview Camera")
    camera = bpy.data.objects.new("Preview Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (3.6, -5.2, 2.25)
    camera.data.lens = 64
    look_at(camera, (0.0, 0.0, 1.05))
    scene.camera = camera

    add_area_light("Key", (3.2, -3.0, 4.5), 1250, 4.0, (1.0, 0.82, 0.62))
    add_area_light("Fill", (-3.5, -1.5, 2.7), 900, 3.5, (0.30, 0.52, 1.0))
    add_area_light("Rim", (0.0, 3.0, 3.4), 1100, 3.0, (0.34, 0.78, 1.0))

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Preview Floor"
    material = bpy.data.materials.new("Preview Floor Material")
    material.diffuse_color = (0.015, 0.025, 0.035, 1.0)
    material.metallic = 0.35
    material.roughness = 0.28
    floor.data.materials.append(material)

    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    props = [obj for obj in scene.objects if obj.name.startswith("Weapon_")]
    actions = {action.name: action for action in bpy.data.actions}
    for clip_name in CLIPS:
        action = actions[clip_name]
        set_action(armature, action)
        for prop in props:
            set_action(prop, action)
        frame = max(int(action.frame_range[1]) - 1, int(action.frame_range[0]))
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        scene.render.filepath = str(output_dir / f"{clip_name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
