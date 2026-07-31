import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


TARGETS = {
    "Axe_Stance": ("Weapon_Spear", -0.15),
}
BACK_WEAPON = "Weapon_Axe_Back"


def set_action(owner, action):
    if owner.animation_data is None:
        owner.animation_data_create()
    for track in owner.animation_data.nla_tracks:
        track.mute = True
    owner.animation_data.action = action
    slot_id = f"OB{owner.name}"
    slot = next((slot for slot in action.slots if slot.identifier == slot_id), None)
    if slot is None:
        raise RuntimeError(f"Action {action.name} has no slot {slot_id}")
    owner.animation_data.action_slot = slot


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Expected input GLB and output JSON")
    input_path, report_path = map(Path, args)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    props = {obj.name: obj for obj in bpy.context.scene.objects if obj.name.startswith("Weapon_")}
    actions = {action.name: action for action in bpy.data.actions}

    report = {
        "file": str(input_path),
        "size": input_path.stat().st_size,
        "clips": sorted(actions),
        "parents": {
            name: {
                "parent": obj.parent.name if obj.parent else None,
                "parent_type": obj.parent_type,
                "parent_bone": obj.parent_bone,
            }
            for name, obj in props.items()
        },
        "targets": {},
    }

    for clip_name, (visible_name, grip_z) in TARGETS.items():
        action = actions[clip_name]
        set_action(armature, action)
        for prop in props.values():
            set_action(prop, action)
        frame = int(round(sum(action.frame_range) * 0.5))
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()

        hand = armature.matrix_world @ armature.pose.bones["RightHand"].head
        visible = props[visible_name]
        grip = visible.matrix_world @ Vector((0.0, 0.0, grip_z))
        entry = {
            "frame": frame,
            "expected_visible": visible_name,
            "scales": {name: list(obj.scale) for name, obj in props.items()},
            "right_hand": list(hand),
            "grip": list(grip),
            "grip_distance": (grip - hand).length,
        }
        back_axe = props[BACK_WEAPON]
        spine = armature.matrix_world @ armature.pose.bones["Spine02"].head
        entry["back_axe_scale"] = list(back_axe.scale)
        entry["back_axe_center"] = list(back_axe.matrix_world.translation)
        entry["back_axe_spine_distance"] = (back_axe.matrix_world.translation - spine).length
        report["targets"][clip_name] = entry

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
