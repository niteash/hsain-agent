from app.database import SessionLocal

from app.services.investigation_context import (
    build_investigation_context,
)

from app.services.investigation_prompt import (
    build_investigation_prompt,
)


def main():

    db = SessionLocal()

    try:
        context = build_investigation_context(
            db=db,
            product_id=1,
        )

        prompt = build_investigation_prompt(context)

        print("\nPROMPT GENERATED SUCCESSFULLY")
        print("=" * 60)

        print("Prompt length:", len(prompt), "characters")

        print("\nPrompt preview:")
        print(prompt[:2000])

        assert "STRICT RULES" in prompt
        assert "Historical discrepancy" in prompt
        assert "INVESTIGATION CONTEXT" in prompt

        print("\nAll prompt checks passed.")

    finally:
        db.close()


if __name__ == "__main__":
    main()