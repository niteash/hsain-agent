import json

from app.database import SessionLocal
from app.services.investigation_context import (
    build_investigation_context,
)


def main():

    db = SessionLocal()

    try:
        context = build_investigation_context(
            db=db,
            product_id=1,
        )

        print("\nINVESTIGATION CONTEXT")
        print("=" * 60)

        print(json.dumps(
            context,
            indent=4,
            ensure_ascii=False,
        ))

    except Exception as error:
        print("ERROR:", error)

    finally:
        db.close()


if __name__ == "__main__":
    main()