"""Prepare a Pascal VOC dataset and train a custom Ultralytics YOLO model.

Usage:
    ..\\.venv\\Scripts\\python.exe backend\\scripts\\train_yolo.py ^
        --dataset C:\\path\\to\\voc-dataset ^
        --classes person car bicycle ^
        --epochs 50

The input directory must contain image files and Pascal VOC ``.xml`` files
with matching stems. The generated dataset and weights are written under
``backend/training`` by default. Set ``MODEL_PATH`` to the resulting
``best.pt`` when starting the API.
"""

from __future__ import annotations

import argparse
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml
from PIL import Image
from ultralytics import YOLO


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--classes", nargs="+", required=True)
    parser.add_argument("--base-model", default="yolo11n.pt")
    parser.add_argument("--output", type=Path, default=Path("backend/training"))
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def find_pairs(dataset: Path) -> list[tuple[Path, Path]]:
    pairs = []
    for image_path in dataset.rglob("*"):
        if image_path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        annotation_path = image_path.with_suffix(".xml")
        if annotation_path.exists():
            pairs.append((image_path, annotation_path))
    if not pairs:
        raise SystemExit("No image/XML pairs found in the dataset directory.")
    return pairs


def convert_annotation(annotation_path: Path, class_to_id: dict[str, int]) -> list[str]:
    root = ET.parse(annotation_path).getroot()
    size = root.find("size")
    if size is None:
        raise ValueError(f"Missing image size in {annotation_path}")
    width = float(size.findtext("width", "0"))
    height = float(size.findtext("height", "0"))
    if width <= 0 or height <= 0:
        raise ValueError(f"Invalid image size in {annotation_path}")

    labels = []
    for object_node in root.findall("object"):
        name = object_node.findtext("name", "").strip()
        if name not in class_to_id:
            continue
        box = object_node.find("bndbox")
        if box is None:
            continue
        xmin = float(box.findtext("xmin", "0"))
        ymin = float(box.findtext("ymin", "0"))
        xmax = float(box.findtext("xmax", "0"))
        ymax = float(box.findtext("ymax", "0"))
        center_x = ((xmin + xmax) / 2) / width
        center_y = ((ymin + ymax) / 2) / height
        box_width = (xmax - xmin) / width
        box_height = (ymax - ymin) / height
        values = [center_x, center_y, box_width, box_height]
        if box_width <= 0 or box_height <= 0:
            continue
        labels.append(f"{class_to_id[name]} " + " ".join(f"{value:.6f}" for value in values))
    return labels


def prepare_dataset(
    pairs: list[tuple[Path, Path]],
    output: Path,
    classes: list[str],
    val_ratio: float,
    seed: int,
) -> Path:
    random.Random(seed).shuffle(pairs)
    split_at = max(1, int(len(pairs) * (1 - val_ratio)))
    class_to_id = {name: index for index, name in enumerate(classes)}

    for split, split_pairs in (("train", pairs[:split_at]), ("val", pairs[split_at:])):
        if not split_pairs:
            split_pairs = pairs[-1:]
        for image_path, annotation_path in split_pairs:
            image = Image.open(image_path)
            image.verify()
            destination_image = output / "images" / split / image_path.name
            destination_label = output / "labels" / split / f"{image_path.stem}.txt"
            destination_image.parent.mkdir(parents=True, exist_ok=True)
            destination_label.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(image_path, destination_image)
            destination_label.write_text(
                "\n".join(convert_annotation(annotation_path, class_to_id)) + "\n",
                encoding="utf-8",
            )

    data_yaml = output / "data.yaml"
    data_yaml.write_text(
        yaml.safe_dump(
            {
                "path": str(output.resolve()),
                "train": "images/train",
                "val": "images/val",
                "names": classes,
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    return data_yaml


def main() -> None:
    args = parse_args()
    if not 0 < args.val_ratio < 1:
        raise SystemExit("--val-ratio must be between 0 and 1.")
    pairs = find_pairs(args.dataset)
    data_yaml = prepare_dataset(pairs, args.output, args.classes, args.val_ratio, args.seed)
    model = YOLO(args.base_model)
    model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        project=str(args.output / "runs"),
        name="custom",
        exist_ok=True,
    )


if __name__ == "__main__":
    main()
