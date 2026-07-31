import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


CLIP_NAME = "Axe_Stance"


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


def set_action_pose(armature, action):
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = action
    start, end = action.frame_range
    bpy.context.scene.frame_set(int(round((start + end) * 0.5)))
    bpy.context.view_layer.update()


def bone_head_world(armature, name):
    return armature.matrix_world @ armature.pose.bones[name].head


def bone_world_matrix(armature, bone_name):
    return armature.matrix_world @ armature.pose.bones[bone_name].matrix


def oriented_matrix(origin, z_direction, scale, roll=0.0):
    rotation = Vector(z_direction).normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    if roll:
        rotation = rotation @ Matrix.Rotation(roll, 4, "Z")
    return Matrix.Translation(origin) @ rotation @ Matrix.Diagonal((scale, scale, scale, 1.0))


def place_spear(prop, armature, action):
    set_action_pose(armature, action)
    right = bone_head_world(armature, "RightHand")
    left = bone_head_world(armature, "LeftHand")
    scale = 0.9
    grip_at_right = -0.15
    direction = (left - right).normalized()
    origin = right - direction * (grip_at_right * scale)
    world_matrix = oriented_matrix(origin, direction, scale, math.radians(12))
    prop.matrix_world = world_matrix
    return bone_world_matrix(armature, "RightHand").inverted() @ world_matrix


def place_axe_on_back(prop, armature, action):
    set_action_pose(armature, action)
    spine = bone_head_world(armature, "Spine02")
    scale = 1.08
    direction = Vector((-0.62, 0.08, 0.78)).normalized()
    origin = spine + Vector((0.0, 0.28, 0.08))
    world_matrix = oriented_matrix(origin, direction, scale, math.radians(12))
    prop.matrix_world = world_matrix
    return bone_world_matrix(armature, "Spine02").inverted() @ world_matrix


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
    strip = track.strips.new(track_name, int(round(action.frame_range[0])), action)
    strip.name = track_name


def create_follow_action(prop, armature, character_action, bone_name, bone_offset):
    if prop.animation_data is None:
        prop.animation_data_create()
    action = bpy.data.actions.new(name=f"{CLIP_NAME}__{prop.name}")
    prop.animation_data.action = action
    prop.rotation_mode = "QUATERNION"
    start = int(math.floor(character_action.frame_range[0]))
    end = int(math.ceil(character_action.frame_range[1]))
    armature.animation_data.action = character_action
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        location, rotation, scale = (bone_world_matrix(armature, bone_name) @ bone_offset).decompose()
        prop.location = location
        prop.rotation_quaternion = rotation
        prop.scale = scale
        prop.keyframe_insert(data_path="location", frame=frame, group="Bone Follow")
        prop.keyframe_insert(data_path="rotation_quaternion", frame=frame, group="Bone Follow")
        prop.keyframe_insert(data_path="scale", frame=frame, group="Bone Follow")
    prop.animation_data.action = None
    return action


def configure_nla(armature, props, character_action, attachments):
    clear_nla(armature.animation_data)
    prop_actions = {}
    for prop in props:
        clear_nla(prop.animation_data)
        bone_name, bone_offset = attachments[prop.name]
        prop_actions[prop.name] = create_follow_action(prop, armature, character_action, bone_name, bone_offset)

    armature.animation_data.action = None
    add_nla_strip(armature, CLIP_NAME, character_action)
    for prop in props:
        add_nla_strip(prop, CLIP_NAME, prop_actions[prop.name])


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
    if len(args) != 5:
        raise SystemExit("Expected character, spear, axe, output GLB and report JSON")
    character_path, spear_path, axe_path, output_path, report_path = map(Path, args)

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(character_path))
    armature = find_armature()
    actions = list(bpy.data.actions)
    if len(actions) != 1:
        raise RuntimeError(f"Expected one character action, found {len(actions)}")
    character_action = actions[0]
    character_action.name = CLIP_NAME

    spear = import_prop(spear_path, "Weapon_Spear")
    axe = import_prop(axe_path, "Weapon_Axe_Back")
    attachments = {
        spear.name: ("RightHand", place_spear(spear, armature, character_action)),
        axe.name: ("Spine02", place_axe_on_back(axe, armature, character_action)),
    }
    configure_nla(armature, [spear, axe], character_action, attachments)
    export_glb(output_path)

    report = {
        "source": str(character_path),
        "output": str(output_path),
        "clip": CLIP_NAME,
        "frame_range": list(character_action.frame_range),
        "weapons": [spear.name, axe.name],
        "output_size": output_path.stat().st_size,
        "attachment": "spear follows RightHand; permanent axe follows Spine02",
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
