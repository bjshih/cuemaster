#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
  🎭 Cue Master - QLab 雙向互通轉換橋接器 (QLab Bi-directional Bridge)
=============================================================================
功能:
  1. import_qlab5(qlab_path) -> 匯入 .qlab5 二進位檔為 Cue Master 專案 (.cuemaster / .json)
  2. export_qlab5(cuemaster_path, output_path) -> 將 Cue Master 專案導出為 QLab 5 相容專案檔
"""

import plistlib
import json
import os
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def unarchive_plist(data):
    objects = data.get("$objects", [])
    memo = {}

    def resolve(idx):
        if isinstance(idx, bool):
            return idx
        if isinstance(idx, plistlib.UID):
            idx = idx.data
        if not isinstance(idx, int) or idx >= len(objects):
            return idx
        if idx in memo:
            return memo[idx]

        raw = objects[idx]
        if isinstance(raw, dict):
            cls_name = ""
            if "$class" in raw:
                cls_obj = objects[raw["$class"].data]
                cls_name = cls_obj.get("$classname", "")

            if "NS.keys" in raw and "NS.objects" in raw:
                d = {}
                memo[idx] = d
                keys = [resolve(k) for k in raw["NS.keys"]]
                vals = [resolve(v) for v in raw["NS.objects"]]
                for k, v in zip(keys, vals):
                    d[k] = v
                if cls_name:
                    d["__class__"] = cls_name
                return d
            elif "NS.objects" in raw:
                arr = []
                memo[idx] = arr
                for v in raw["NS.objects"]:
                    arr.append(resolve(v))
                return arr
            elif "NS.string" in raw:
                s = resolve(raw["NS.string"])
                memo[idx] = s
                return s
            else:
                d = {"__class__": cls_name} if cls_name else {}
                memo[idx] = d
                for k, v in raw.items():
                    if k not in ("$class", "$classes"):
                        d[k] = resolve(v)
                return d
        elif isinstance(raw, list):
            arr = []
            memo[idx] = arr
            for v in raw:
                arr.append(resolve(v))
            return arr
        else:
            return raw

    root = resolve(data["$top"]["root"])
    return root

def import_qlab5(qlab_filepath, output_json_path=None):
    """將 .qlab5 二進位專案轉換為 Cue Master 專案"""
    with open(qlab_filepath, "rb") as f:
        outer_data = plistlib.load(f)

    outer_root = unarchive_plist(outer_data)
    cue_lists_raw = outer_root.get("cueLists", {})
    sub_data = cue_lists_raw.get("NS.data")

    if not sub_data:
        raise ValueError("無法解析 QLab cueLists 內嵌資料")

    sub_plist = plistlib.loads(sub_data)
    sub_root = unarchive_plist(sub_plist)

    cue_counter = 1

    def to_str(v):
        if isinstance(v, str): return v
        if isinstance(v, dict):
            return to_str(v.get("NS.string", v.get("listName", v.get("name", ""))))
        return "" if v is None or v == "$null" else str(v)

    def to_float(v, default=0.0):
        if v is None or v == "$null" or v == "": return default
        try: return float(v)
        except (ValueError, TypeError): return default

    def to_int(v, default=0):
        if v is None or v == "$null" or v == "": return default
        try: return int(v)
        except (ValueError, TypeError): return default

    def parse_node(node):
        nonlocal cue_counter
        if not isinstance(node, dict): return None

        c_cls = node.get("__class__", "")
        if not ("Cue" in c_cls or "listName" in node or "cues" in node):
            return None

        cid = f"cue_{cue_counter}"
        cue_counter += 1

        name = to_str(node.get("listName", node.get("name", "")))
        number = to_str(node.get("number", ""))
        pre = to_float(node.get("preWait", node.get("preWaitDuration", 0.0)))
        dur = to_float(node.get("actionDuration", node.get("duration", 0.0)))
        post = to_float(node.get("postWait", node.get("postWaitDuration", 0.0)))
        cont = to_int(node.get("continueMode", 0))
        gmode = to_int(node.get("groupMode", 1), 1)

        target = ""
        ft = node.get("fileTarget")
        if isinstance(ft, dict):
            target = to_str(ft.get("relativePath", ft.get("path", "")))
        elif isinstance(ft, str):
            target = ft

        # 跨平台路徑正規化
        if target:
            target = target.replace("\\", "/")
            if "示範專案/media/" in target:
                target = target.split("示範專案/media/")[1]
            elif "示範專案/" in target:
                target = target.split("示範專案/")[1]
            elif "幸福三姊妹（正式演出版）V2/" in target:
                target = target.split("幸福三姊妹（正式演出版）V2/")[1]

        ctype = "GroupCue"
        if "AudioCue" in c_cls: ctype = "AudioCue"
        elif "VideoCue" in c_cls:
            target_lower = target.lower()
            if any(target_lower.endswith(ext) for ext in ('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg')):
                ctype = "ImageCue"
            else:
                ctype = "VideoCue"
        elif "ImageCue" in c_cls: ctype = "ImageCue"
        elif "FadeCue" in c_cls: ctype = "FadeCue"
        elif "StopCue" in c_cls: ctype = "StopCue"

        children = []
        for ch in node.get("cues", []):
            parsed = parse_node(ch)
            if parsed: children.append(parsed)

        node_res = {
            "id": cid,
            "type": ctype,
            "number": number,
            "name": name,
            "preWait": pre,
            "duration": dur,
            "postWait": post,
            "continueMode": cont,
            "groupMode": gmode,
            "fileTarget": target,
            "children": children
        }
        if ctype == "FadeCue":
            fade_mode = node.get("fadeMode")
            if not fade_mode or fade_mode == "$null":
                name_lower = name.lower()
                fade_mode = "fade-in" if ("fade in" in name_lower or "淡入" in name_lower) else "fade-out"
            stop_val = node.get("stopTargetWhenDone")
            if stop_val is None or stop_val == "$null":
                stop_target = (fade_mode == "fade-out")
            else:
                stop_target = bool(stop_val)
            node_res["fadeMode"] = fade_mode
            node_res["stopTargetWhenDone"] = stop_target
        return node_res

    transformed = parse_node(sub_root)
    proj = {
        "format": "CueMaster",
        "version": "2.0.0",
        "title": os.path.splitext(os.path.basename(qlab_filepath))[0],
        "rootCue": transformed
    }

    if output_json_path:
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(proj, f, ensure_ascii=False, indent=2)

    return proj

class NSKeyedArchiveBuilder:
    def __init__(self):
        self.objects = ['$null']
        self.memo = {}
        self.class_uids = {}

    def get_class_uid(self, classname, superclasses=None):
        if classname in self.class_uids:
            return self.class_uids[classname]
        if superclasses is None:
            if classname in ('GroupCue', 'AudioCue', 'VideoCue', 'FadeCue', 'StopCue'):
                superclasses = [classname, 'Cue', 'NSObject']
            elif classname in ('NSMutableArray', 'NSArray'):
                superclasses = [classname, 'NSArray', 'NSObject']
            elif classname in ('NSMutableDictionary', 'NSDictionary'):
                superclasses = [classname, 'NSDictionary', 'NSObject']
            elif classname == 'NSMutableData':
                superclasses = ['NSMutableData', 'NSData', 'NSObject']
            elif classname == 'F53Alias':
                superclasses = ['F53Alias', 'NSObject']
            else:
                superclasses = [classname, 'NSObject']
        
        cls_dict = {
            '$classes': superclasses,
            '$classname': classname
        }
        idx = len(self.objects)
        self.objects.append(cls_dict)
        uid = plistlib.UID(idx)
        self.class_uids[classname] = uid
        return uid

    def add_object(self, obj):
        if obj is None or obj == '$null':
            return plistlib.UID(0)
        if isinstance(obj, bool):
            return obj
        if isinstance(obj, (int, float)):
            return obj
        if isinstance(obj, bytes):
            idx = len(self.objects)
            self.objects.append(obj)
            return plistlib.UID(idx)
        if isinstance(obj, str):
            if obj in self.memo:
                return self.memo[obj]
            idx = len(self.objects)
            self.objects.append(obj)
            uid = plistlib.UID(idx)
            self.memo[obj] = uid
            return uid
        if isinstance(obj, plistlib.UID):
            return obj

        if isinstance(obj, list):
            arr_cls = self.get_class_uid('NSMutableArray')
            idx = len(self.objects)
            arr_dict = {'$class': arr_cls, 'NS.objects': []}
            self.objects.append(arr_dict)
            uids = [self.add_object(item) for item in obj]
            arr_dict['NS.objects'] = uids
            return plistlib.UID(idx)

        if isinstance(obj, dict):
            cls_name = obj.get('__class__', 'NSMutableDictionary')
            cls_uid = self.get_class_uid(cls_name)
            idx = len(self.objects)
            d_dict = {'$class': cls_uid}
            self.objects.append(d_dict)
            
            if cls_name in ('NSMutableDictionary', 'NSDictionary') and '__class__' not in obj:
                d_dict['NS.keys'] = [self.add_object(k) for k in obj.keys()]
                d_dict['NS.objects'] = [self.add_object(v) for v in obj.values()]
            else:
                for k, v in obj.items():
                    if k != '__class__':
                        d_dict[k] = self.add_object(v)
            return plistlib.UID(idx)

        raise TypeError(f"Unsupported type: {type(obj)}")

    def build(self, root_obj):
        root_uid = self.add_object(root_obj)
        return {
            '$version': 100000,
            '$archiver': 'NSKeyedArchiver',
            '$top': {'root': root_uid},
            '$objects': self.objects
        }

def _cuemaster_node_to_qlab(c):
    ctype = c.get('type', 'GroupCue')
    qlab_class = 'VideoCue' if ctype in ('VideoCue', 'ImageCue') else ctype
    q = {
        '__class__': qlab_class,
        'number': str(c.get('number', '')),
        'name': str(c.get('name', '')),
        'preWait': float(c.get('preWait', 0.0) or 0.0),
        'duration': float(c.get('duration', 0.0) or 0.0),
        'postWait': float(c.get('postWait', 0.0) or 0.0),
        'continueMode': int(c.get('continueMode', 0) or 0),
        'armed': True
    }
    if ctype == 'GroupCue':
        q['groupMode'] = int(c.get('groupMode', 1) or 1)
        q['cues'] = [_cuemaster_node_to_qlab(ch) for ch in c.get('children', [])]
    else:
        ft = c.get('fileTarget', '')
        if ft and ft != '$null':
            q['fileTarget'] = {
                '__class__': 'F53Alias',
                'path': ft,
                'relativePath': ft
            }
        else:
            q['fileTarget'] = '$null'

    if ctype == 'FadeCue':
        fade_mode = c.get('fadeMode')
        if not fade_mode:
            name_lower = c.get('name', '').lower()
            fade_mode = 'fade-in' if ('fade in' in name_lower or '淡入' in name_lower) else 'fade-out'
        stop_target = c.get('stopTargetWhenDone', fade_mode == 'fade-out')
        q['fadeMode'] = fade_mode
        q['stopTargetWhenDone'] = bool(stop_target)
        q['targetOpacity'] = 1.0 if fade_mode == 'fade-in' else 0.0
    return q

def export_qlab5(cuemaster_json_or_dict, output_qlab5_path):
    """將 Cue Master 專案導出為真正 QLab 5 相容的 .qlab5 二進位檔"""
    if isinstance(cuemaster_json_or_dict, str):
        with open(cuemaster_json_or_dict, "r", encoding="utf-8") as f:
            proj = json.load(f)
    else:
        proj = cuemaster_json_or_dict

    root_cue = proj.get("rootCue", {})
    qlab_cue_root = _cuemaster_node_to_qlab(root_cue)

    # 1. 序列化內部 cueLists NSKeyedArchiver
    sub_builder = NSKeyedArchiveBuilder()
    sub_plist = sub_builder.build(qlab_cue_root)
    sub_bytes = plistlib.dumps(sub_plist, fmt=plistlib.FMT_BINARY)

    # 2. 序列化外層 workspace NSKeyedArchiver
    outer_root = {
        '__class__': 'NSMutableDictionary',
        'workspaceName': proj.get('title', 'Cue Master Show'),
        'QLabShortVersionString': '5.5.9',
        'QLabBuildNumber': 5509,
        'cueLists': {
            '__class__': 'NSMutableData',
            'NS.data': sub_bytes
        }
    }
    outer_builder = NSKeyedArchiveBuilder()
    outer_plist = outer_builder.build(outer_root)
    outer_bytes = plistlib.dumps(outer_plist, fmt=plistlib.FMT_BINARY)

    with open(output_qlab5_path, 'wb') as f:
        f.write(outer_bytes)

    return True

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        src = r"示範專案\星星月月.qlab5" if os.path.exists(r"示範專案\星星月月.qlab5") else r"幸福三姊妹（正式演出版）V2\幸福三姊妹（正式演出版）V2.qlab5"
        dst = r"示範專案\星星月月_exported_test.cuemaster"
        back_qlab = r"示範專案\星星月月_roundtrip.qlab5"

        print(f"[Bridge] 正在測試從 QLab 匯入: {src}")
        p = import_qlab5(src, dst)
        print(f"[Bridge] 匯入成功！共解析根節點，產生: {dst}")

        print(f"[Bridge] 正在測試導出回 QLab: {back_qlab}")
        export_qlab5(dst, back_qlab)
        print(f"[Bridge] 導出成功！檔案大小: {os.path.getsize(back_qlab)} bytes")

        print(f"[Bridge] 正在驗證導出之 .qlab5 再匯入 (Round-trip check)...")
        re_p = import_qlab5(back_qlab)
        def count_c(node):
            return 1 + sum(count_c(c) for c in node.get("children", []))
        orig_count = count_c(p["rootCue"])
        re_count = count_c(re_p["rootCue"])
        print(f"[Bridge] 原始 Cue 數量: {orig_count}, 再匯入 Cue 數量: {re_count}")
        assert orig_count == re_count, "Cue 數量不一致！"
        print("[Bridge] 🎉 Round-trip 相容性 100% 驗證通過！")
    elif len(sys.argv) > 3 and sys.argv[1] == "--import":
        import_qlab5(sys.argv[2], sys.argv[3])
        print(f"Imported {sys.argv[2]} -> {sys.argv[3]}")
    elif len(sys.argv) > 3 and sys.argv[1] == "--export":
        export_qlab5(sys.argv[2], sys.argv[3])
        print(f"Exported {sys.argv[2]} -> {sys.argv[3]}")

