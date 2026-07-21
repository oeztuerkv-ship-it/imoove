#!/usr/bin/env python3
"""Regenerate assets/logo_animation.json for the ONRODA intro splash.

Requires: Pillow (pip install pillow)
Run from artifacts/mobile:
  python3 scripts/generate-onroda-splash-lottie.py
"""
from __future__ import annotations

import base64
import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
OUT = ROOT / "assets" / "logo_animation.json"

W, H = 600, 720
FR = 60
OP = 156  # 2.6s @ 60fps
CX, CY = 300, 268
R = 92

F_PIN_IN_END = 12
F_TAXI_ENTER_START = 18
F_ORBIT_START = 30
F_ORBIT_END = 108
F_TAXI_FADE_START = 108
F_TAXI_FADE_END = 132
F_PULSE_START = 120
F_PULSE_MID = 129
F_PULSE_END = 138
F_WM_START = 132
F_WM_END = 150


def static(v):
    return {"a": 0, "k": v if isinstance(v, list) else [v], "ix": 2}


def anim(keyframes):
    k = []
    for i, frame in enumerate(keyframes):
        item = {"t": frame["t"], "s": frame["s"]}
        if i < len(keyframes) - 1:
            n = len(frame["s"])
            item["i"] = {"x": [0.42] * n, "y": [1] * n}
            item["o"] = {"x": [0.58] * n, "y": [0] * n}
        k.append(item)
    return {"a": 1, "k": k, "ix": 2}


def pos_at(theta: float) -> list[float]:
    return [CX - R * math.sin(theta), CY + R * math.cos(theta)]


def rot_at(theta: float) -> float:
    return math.degrees(math.atan2(-math.sin(theta), -math.cos(theta)))


def b64png(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def ensure_taxi(path: Path) -> None:
    if path.exists():
        return
    taxi = Image.new("RGBA", (96, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(taxi)
    d.rounded_rectangle([4, 12, 92, 40], radius=8, fill=(255, 196, 0, 255))
    d.rounded_rectangle([28, 4, 68, 18], radius=6, fill=(255, 210, 40, 255))
    d.rounded_rectangle([32, 6, 46, 16], radius=2, fill=(40, 60, 90, 220))
    d.rounded_rectangle([50, 6, 64, 16], radius=2, fill=(40, 60, 90, 220))
    d.ellipse([14, 34, 30, 48], fill=(35, 35, 40, 255))
    d.ellipse([66, 34, 82, 48], fill=(35, 35, 40, 255))
    d.rectangle([44, 1, 52, 6], fill=(255, 80, 60, 255))
    taxi.save(path)


def main() -> None:
    pin_path = IMAGES / "onroda-pin.png"
    wm_path = IMAGES / "onroda-wordmark.png"
    taxi_path = IMAGES / "onroda-splash-taxi.png"
    if not pin_path.exists() or not wm_path.exists():
        raise SystemExit("Missing onroda-pin.png / onroda-wordmark.png — crop from logo first.")
    ensure_taxi(taxi_path)

    pin_b64, wm_b64, taxi_b64 = map(b64png, (pin_path, wm_path, taxi_path))
    pin_w, pin_h = Image.open(pin_path).size
    wm_w, wm_h = Image.open(wm_path).size
    taxi_w, taxi_h = Image.open(taxi_path).size

    pin_dw = 140
    pin_dh = int(140 * pin_h / pin_w)
    wm_dw = 280
    pin_scale = pin_dw / pin_w * 100
    wm_scale = wm_dw / wm_w * 100
    taxi_scale = 56 / taxi_w * 100

    n = 60
    orbit_pos, orbit_rot = [], []
    for i in range(n + 1):
        t = F_ORBIT_START + (F_ORBIT_END - F_ORBIT_START) * i / n
        theta = 2 * math.pi * i / n
        orbit_pos.append({"t": t, "s": pos_at(theta)})
        orbit_rot.append({"t": t, "s": [rot_at(theta)]})

    taxi_pos_k = [
        {"t": F_TAXI_ENTER_START, "s": [CX - R - 180, CY + R]},
        {"t": F_ORBIT_START, "s": pos_at(0)},
    ] + orbit_pos[1:]
    taxi_rot_k = [
        {"t": F_TAXI_ENTER_START, "s": [0]},
        {"t": F_ORBIT_START, "s": [rot_at(0)]},
    ] + orbit_rot[1:]

    def img_asset(aid: str, name: str, w: int, h: int, b64: str):
        return {
            "id": aid,
            "nm": name,
            "u": "",
            "p": f"data:image/png;base64,{b64}",
            "e": 1,
            "w": w,
            "h": h,
        }

    assets = [
        img_asset("pin", "pin", pin_w, pin_h, pin_b64),
        img_asset("wm", "wordmark", wm_w, wm_h, wm_b64),
        img_asset("taxi", "taxi", taxi_w, taxi_h, taxi_b64),
    ]

    pin_layer = {
        "ddd": 0,
        "ind": 4,
        "ty": 2,
        "nm": "Pin",
        "refId": "pin",
        "sr": 1,
        "ks": {
            "o": anim([{"t": 0, "s": [0]}, {"t": F_PIN_IN_END, "s": [100]}]),
            "r": static(0),
            "p": static([CX, CY]),
            "a": static([pin_w / 2, pin_h * 0.40]),
            "s": anim(
                [
                    {"t": 0, "s": [pin_scale, pin_scale]},
                    {"t": F_PULSE_START, "s": [pin_scale, pin_scale]},
                    {"t": F_PULSE_MID, "s": [pin_scale * 1.08, pin_scale * 1.08]},
                    {"t": F_PULSE_END, "s": [pin_scale, pin_scale]},
                ]
            ),
        },
        "ao": 0,
        "ip": 0,
        "op": OP,
        "st": 0,
        "bm": 0,
    }

    wm_layer = {
        "ddd": 0,
        "ind": 1,
        "ty": 2,
        "nm": "Wordmark",
        "refId": "wm",
        "sr": 1,
        "ks": {
            "o": anim(
                [
                    {"t": 0, "s": [0]},
                    {"t": F_WM_START, "s": [0]},
                    {"t": F_WM_END, "s": [100]},
                ]
            ),
            "r": static(0),
            "p": static([CX, CY + pin_dh * 0.58 + 28]),
            "a": static([wm_w / 2, wm_h / 2]),
            "s": static([wm_scale, wm_scale]),
        },
        "ao": 0,
        "ip": 0,
        "op": OP,
        "st": 0,
        "bm": 0,
    }

    taxi_layer = {
        "ddd": 0,
        "ind": 2,
        "ty": 2,
        "nm": "Taxi",
        "refId": "taxi",
        "sr": 1,
        "ks": {
            "o": anim(
                [
                    {"t": 0, "s": [0]},
                    {"t": F_TAXI_ENTER_START, "s": [0]},
                    {"t": F_TAXI_ENTER_START + 5, "s": [100]},
                    {"t": F_TAXI_FADE_START, "s": [100]},
                    {"t": F_TAXI_FADE_END, "s": [0]},
                ]
            ),
            "r": anim(taxi_rot_k),
            "p": anim(taxi_pos_k),
            "a": static([taxi_w / 2, taxi_h / 2]),
            "s": static([taxi_scale, taxi_scale]),
        },
        "ao": 0,
        "ip": 0,
        "op": OP,
        "st": 0,
        "bm": 0,
    }

    trim_e = anim([{"t": F_ORBIT_START, "s": [0]}, {"t": F_ORBIT_END, "s": [100]}])
    ring_layer = {
        "ddd": 0,
        "ind": 3,
        "ty": 4,
        "nm": "Orbit Ring",
        "sr": 1,
        "ks": {
            "o": anim(
                [
                    {"t": 0, "s": [0]},
                    {"t": F_ORBIT_START, "s": [0]},
                    {"t": F_ORBIT_START + 2, "s": [100]},
                    {"t": F_TAXI_FADE_END, "s": [100]},
                    {"t": OP, "s": [85]},
                ]
            ),
            "r": static(0),
            "p": static([CX, CY]),
            "a": static([0, 0]),
            "s": static([100, 100]),
        },
        "ao": 0,
        "shapes": [
            {
                "ty": "gr",
                "nm": "Ellipse",
                "it": [
                    {
                        "ty": "el",
                        "nm": "Ellipse Path",
                        "p": static([0, 0]),
                        "s": static([R * 2, R * 2]),
                        "d": 1,
                    },
                    {
                        "ty": "st",
                        "nm": "Stroke",
                        "c": static([0.937, 0.114, 0.149, 1]),
                        "o": static(100),
                        "w": static(3.5),
                        "lc": 2,
                        "lj": 2,
                        "ml": 4,
                        "bm": 0,
                        "d": [],
                    },
                    {
                        "ty": "tm",
                        "nm": "Trim Paths",
                        "s": static(0),
                        "e": trim_e,
                        "o": static(90),
                        "m": 1,
                        "ix": 2,
                    },
                    {
                        "ty": "tr",
                        "p": static([0, 0]),
                        "a": static([0, 0]),
                        "s": static([100, 100]),
                        "r": static(0),
                        "o": static(100),
                        "sk": static(0),
                        "sa": static(0),
                    },
                ],
            }
        ],
        "ip": 0,
        "op": OP,
        "st": 0,
        "bm": 0,
    }

    lottie = {
        "v": "5.7.4",
        "fr": FR,
        "ip": 0,
        "op": OP,
        "w": W,
        "h": H,
        "nm": "ONRODA Splash",
        "ddd": 0,
        "assets": assets,
        "layers": [wm_layer, taxi_layer, pin_layer, ring_layer],
    }
    OUT.write_text(json.dumps(lottie, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
