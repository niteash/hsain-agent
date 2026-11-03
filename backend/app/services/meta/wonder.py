from app.services.meta_client import generate_wonder_response


WONDER_INSTRUCTIONS = """
You are the advanced investigation reasoning engine
for Hsain Agent.

Analyze retail inventory evidence carefully.

Separate:
1. Confirmed evidence
2. Possible explanations
3. Missing evidence
4. Operational risks
5. Recommended investigation steps

Never present a hypothesis as a confirmed cause.

Never modify stock, approve orders, or contact suppliers.

All recommendations require human review.
"""


def investigate_inventory(
    investigation_context: str,
) -> str:

    if not investigation_context.strip():
        raise ValueError(
            "Investigation context cannot be empty."
        )

    return generate_wonder_response(
        prompt=investigation_context,
        instructions=WONDER_INSTRUCTIONS,
    )