import json

from app.services.meta.sam_processor import (
    process_sam_result,
)


def main():

    sam_result = {
        "status": "completed",
        "model": "sam-3.1",
        "object_prompt": "packaged food",

        "boxes": [
            {
                "object_id": "0",
                "left": 10,
                "top": 20,
                "right": 110,
                "bottom": 220,
                "confidence": None,
                "frame": None,
            },
            {
                "object_id": "1",
                "left": 150,
                "top": 30,
                "right": 250,
                "bottom": 230,
                "confidence": None,
                "frame": None,
            },
        ],

        "masks": [
            {
                "object_id": "0",
                "width": 100,
                "height": 200,
                "encoding": "lossless",
                "revision": 1,
                "confidence": None,
                "foreground_pixels": 12000,
                "svg_path": "M 0 0 L 100 0 L 100 200 Z",
                "bounds": {
                    "left": 10,
                    "top": 20,
                    "right": 110,
                    "bottom": 220,
                },
                "frame": None,
            },
            {
                "object_id": "1",
                "width": 100,
                "height": 200,
                "encoding": "lossless",
                "revision": 1,
                "confidence": None,
                "foreground_pixels": 11500,
                "svg_path": "M 0 0 L 100 0 L 100 200 Z",
                "bounds": {
                    "left": 150,
                    "top": 30,
                    "right": 250,
                    "bottom": 230,
                },
                "frame": None,
            },
        ],
    }

    result = process_sam_result(
        sam_result
    )

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()