import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def world_bounds(mesh_objects):
    points = []
    for obj in mesh_objects:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return None
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return {
        "min": list(minimum),
        "max": list(maximum),
        "size": list(maximum - minimum),
        "center": list((minimum + maximum) * 0.5),
    }


def inspect_prop(path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    return {
        "file": str(path),
        "objects": [obj.name for obj in bpy.context.scene.objects],
        "meshes": [obj.name for obj in meshes],
        "bounds": world_bounds(meshes),
        "materials": sorted({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
    }


def find_armature():
    return next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)


def activate_action(armature, action):
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = action
    start, end = action.frame_range
    frame = int(round((start + end) * 0.5))
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    return frame


def bone_world_position(armature, bone_name):
    bone = armature.pose.bones.get(bone_name)
    if bone is None:
        return None
    return list(armature.matrix_world @ bone.head)


def inspect_character(path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    armature = find_armature()
    report = {
        "file": str(path),
        "objects": [obj.name for obj in bpy.context.scene.objects],
        "armature": armature.name if armature else None,
        "bones": [bone.name for bone in armature.data.bones] if armature else [],
        "actions": [],
        "bounds": world_bounds([obj for obj in bpy.context.scene.objects if obj.type == "MESH"]),
    }
    if armature is None:
        return report

    wanted = {"Axe_Stance", "Idle_5", "Idle_11"}
    for action in bpy.data.actions:
        item = {
            "name": action.name,
            "range": list(action.frame_range),
        }
        if action.name in wanted:
            item["sample_frame"] = activate_action(armature, action)
            item["left_hand"] = bone_world_position(armature, "LeftHand")
            item["right_hand"] = bone_world_position(armature, "RightHand")
            item["right_foot"] = bone_world_position(armature, "RightFoot")
            item["hips"] = bone_world_position(armature, "Hips")
        report["actions"].append(item)
    return report


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 5:
        raise SystemExit("Expected character, spear, axe, sword and report paths")
    character, spear, axe, sword, report_path = map(Path, args)
    report = {
        "character": inspect_character(character),
        "props": [inspect_prop(spear), inspect_prop(axe), inspect_prop(sword)],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
