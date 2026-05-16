#!/usr/bin/env python3
"""Test-only utility: slice a magenta-background sprite sheet into transparent frames/GIFs.

This is intentionally inside _sprite_generation_tests and not project code.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image


def chroma_key_magenta(im: Image.Image, tolerance: int = 40) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.array(im)
    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]
    mask = (r >= 255 - tolerance) & (g <= tolerance) & (b >= 255 - tolerance)
    arr[:, :, 3] = np.where(mask, 0, arr[:, :, 3])
    return Image.fromarray(arr, "RGBA")


def bbox_alpha(im: Image.Image):
    return im.getchannel("A").getbbox()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("output_dir", type=Path)
    ap.add_argument("--rows", type=int, default=4)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--cell-size", type=int, default=96)
    ap.add_argument("--tolerance", type=int, default=45)
    ap.add_argument("--duration", type=int, default=180)
    args = ap.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    raw = Image.open(args.input).convert("RGBA")
    w, h = raw.size
    cw, ch = w // args.cols, h // args.rows

    labels = []
    directions = ["down", "left", "right", "up"] if args.rows == 4 else [f"row{r+1}" for r in range(args.rows)]
    frames_by_row = []
    qc = {"input": str(args.input), "input_size": [w, h], "cell_size_source": [cw, ch], "rows": args.rows, "cols": args.cols, "frames": []}

    for r in range(args.rows):
        row_frames = []
        for c in range(args.cols):
            cell = raw.crop((c*cw, r*ch, (c+1)*cw, (r+1)*ch))
            clean = chroma_key_magenta(cell, args.tolerance)
            bbox = bbox_alpha(clean)
            canvas = Image.new("RGBA", (args.cell_size, args.cell_size), (0, 0, 0, 0))
            if bbox:
                sprite = clean.crop(bbox)
                # scale to fit 80% of target cell, nearest-neighbor for pixel look
                max_side = int(args.cell_size * 0.80)
                scale = min(max_side / sprite.width, max_side / sprite.height, 1.0)
                new_size = (max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale)))
                sprite = sprite.resize(new_size, Image.Resampling.NEAREST)
                x = (args.cell_size - sprite.width) // 2
                y = args.cell_size - sprite.height - int(args.cell_size * 0.08)  # feet alignment
                canvas.alpha_composite(sprite, (x, y))
            label = f"{directions[r]}-{c+1}"
            canvas.save(args.output_dir / f"{label}.png")
            labels.append(label)
            row_frames.append(canvas)
            qc["frames"].append({"label": label, "bbox": list(bbox) if bbox else None})
        frames_by_row.append(row_frames)
        row_frames[0].save(args.output_dir / f"{directions[r]}.gif", save_all=True, append_images=row_frames[1:], duration=args.duration, loop=0, disposal=2)

    sheet = Image.new("RGBA", (args.cols*args.cell_size, args.rows*args.cell_size), (0,0,0,0))
    for r, row in enumerate(frames_by_row):
        for c, frame in enumerate(row):
            sheet.alpha_composite(frame, (c*args.cell_size, r*args.cell_size))
    sheet.save(args.output_dir / "sheet-transparent.png")
    qc["labels"] = labels
    qc["output_sheet_size"] = list(sheet.size)
    (args.output_dir / "slice-meta.json").write_text(json.dumps(qc, indent=2), encoding="utf-8")
    print(args.output_dir)


if __name__ == "__main__":
    main()
