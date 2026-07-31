import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


TARGETS = {
    "Axe_Stance": "Weapon_Spear",
    "Idle_5": "Weapon_Sword",
    "Idle_11": "Weapon_Axe",
}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def find_armature():
    return next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")


def import_prop(path, object_name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one mesh in {path}, found {len(meshes)}")
    prop = meshes[0]
    prop.name = object_name
    prop.data.name = f"{object_name}_Mesh"
    for obj in imported:
        if obj is not prop and obj.type == "EMPTY":
            bpy.data.objects.remove(obj, do_unlink=True)
    return prop


def set_action_pose(armature, action, frame=None):
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = action
    if frame is None:
        start, end = action.frame_range
        frame = int(round((start + end) * 0.5))
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    return frame


def bone_head_world(armature, name):
    return armature.matrix_world @ armature.pose.bones[name].head


def oriented_matrix(origin, z_direction, scale, roll=0.0):
    z_direction = Vector(z_direction).normalized()
    rotation = z_direction.to_track_quat("Z", "Y").to_matrix().to_4x4()
    if roll:
        rotation = rotation @ Matrix.Rotation(roll, 4, "Z")
    return Matrix.Translation(origin) @ rotation @ Matrix.Diagonal((scale, scale, scale, 1.0))


def parent_to_hand_at_world_matrix(prop, armature, world_matrix):
    prop.parent = armature
    prop.parent_type = "BONE"
    prop.parent_bone = "RightHand"
    prop.matrix_world = world_matrix
    bpy.context.view_layer.update()


def place_spear(prop, armature, action):
    set_action_pose(armature, action)
    right = bone_head_world(armature, "RightHand")
    left = bone_head_world(armature, "LeftHand")
    scale = 0.95
    grip_at_right = -0.15
    direction = (left - right).normalized()
    origin = right - direction * (grip_at_right * scale)
    parent_to_hand_at_world_matrix(prop, armature, oriented_matrix(origin, direction, scale, math.radians(12)))


def place_sword(prop, armature, action):
    set_action_pose(armature, action)
    right = bone_head_world(armature, "RightHand")
    scale = 0.55
    grip = 0.68
    direction = Vector((0.08, -0.08, 0.994)).normalized()
    origin = right - direction * (grip * scale)
    parent_to_hand_at_world_matrix(prop, armature, oriented_matrix(origin, direction, scale, math.radians(-18)))


def place_axe(prop, armature, action):
    set_action_pose(armature, action)
    right = bone_head_world(armature, "RightHand")
    scale = 1.12
    grip = -0.15
    direction = Vector((0.25, 0.0, 0.968)).normalized()
    origin = right - direction * (grip * scale)
    parent_to_hand_at_world_matrix(prop, armature, oriented_matrix(origin, direction, scale, math.radians(90)))


def clear_nla(animation_data):
    if animation_data is None:
        return
    animation_data.action = None
    for track in list(animation_data.nla_tracks):
        animation_data.nla_tracks.remove(track)


def add_nla_strip(owner, track_name, action):
    if owner.animation_data is None:
        owner.animation_data_create()
    track = owner.animation_data.nla_tracks.new()
    track.name = track_name
    start = int(round(action.frame_range[0]))
    strip = track.strips.new(track_name, start, action)
    strip.name = track_name
    return track


def create_scale_action(prop, clip_name, frame_range, visible, base_scale):
    if prop.animation_data is None:
        prop.animation_data_create()
    action = bpy.data.actions.new(name=f"{clip_name}__{prop.name}")
    prop.animation_data.action = action
    multiplier = 1.0 if visible else 0.0001
    scale = tuple(value * multiplier for value in base_scale)
    start, end = frame_range
    prop.scale = scale
    prop.keyframe_insert(data_path="scale", frame=float(start), group="Visibility")
    prop.keyframe_insert(data_path="scale", frame=float(end), group="Visibility")
    prop.animation_data.action = None
    return action


def configure_nla(armature, props, character_actions):
    base_scales = {prop.name: tuple(prop.scale) for prop in props}
    clear_nla(armature.animation_data)
    for prop in props:
        clear_nla(prop.animation_data)

    for clip_name, action in character_actions.items():
        add_nla_strip(armature, clip_name, action)
        for prop in props:
            visible = TARGETS.get(clip_name) == prop.name
            scale_action = create_scale_action(prop, clip_name, action.frame_range, visible, base_scales[prop.name])
            add_nla_strip(prop, clip_name, scale_action)


def export_glb(output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_merge_animation="NLA_TRACK",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_optimize_animation_keep_anim_object=True,
        export_skins=True,
        export_morph=True,
        export_yup=True,
        export_image_format="AUTO",
        export_materials="EXPORT",
    )


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 6:
        raise SystemExit("Expected character, spear, axe, sword, output GLB and report JSON")
    character_path, spear_path, axe_path, sword_path, output_path, report_path = map(Path, args)

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(character_path))
    armature = find_armature()
    character_actions = {action.name: action for action in bpy.data.actions}
    missing = set(TARGETS) - set(character_actions)
    if missing:
        raise RuntimeError(f"Missing animation clips: {sorted(missing)}")

    spear = import_prop(spear_path, "Weapon_Spear")
    axe = import_prop(axe_path, "Weapon_Axe")
    sword = import_prop(sword_path, "Weapon_Sword")

    place_spear(spear, armature, character_actions["Axe_Stance"])
    place_sword(sword, armature, character_actions["Idle_5"])
    place_axe(axe, armature, character_actions["Idle_11"])

    props = [spear, axe, sword]
    configure_nla(armature, props, character_actions)
    export_glb(output_path)

    report = {
        "source": str(character_path),
        "output": str(output_path),
        "clips": sorted(character_actions),
        "weapon_clips": TARGETS,
        "weapons": [prop.name for prop in props],
        "output_size": output_path.stat().st_size,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()



