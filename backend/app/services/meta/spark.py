import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.config import META_MODELS
from app.services.meta_client import get_meta_client
from app.services.meta.tools import (
    TOOL_DEFINITIONS,
    execute_tool,
)

logger = logging.getLogger(__name__)

SPARK_INSTRUCTIONS = """
You are Hsain Agent, an intelligent retail inventory
investigation and decision-support assistant.

Your responsibilities:
- Analyze actual inventory records.
- Identify inventory risks.
- Investigate stock discrepancies.
- Explain replenishment recommendations.
- Analyze supplier and inventory movements.
- Recommend practical operational actions.

DATABASE ACCESS:
You have read-only database tools.

Use tools whenever a question requires actual database information.

Never invent database records.
Never claim to have accessed data unless a tool returned it.

INVENTORY RULES:
1. Database records are the source of truth.
2. Distinguish verified records from assumptions.
3. Never invent discrepancy causes.
4. Never present hypotheses as confirmed evidence.
5. Use deterministic reorder intelligence returned by tools.
6. Never independently calculate reorder quantities.
7. Pending supplier proposals are not confirmed incoming stock.
8. Never assume a supplier order has been delivered.

OPERATIONAL SAFETY:
1. You are read-only.
2. Never modify inventory.
3. Never create stock movements.
4. Never approve supplier orders.
5. Never create supplier orders.
6. Never contact suppliers.
7. Never change product configuration.
8. Never delete records.
9. Human approval is mandatory.

RESPONSE FORMAT:
- Explain what the database confirms.
- Identify relevant inventory risks.
- Separate facts from hypotheses.
- Explain calculations returned by tools.
- Recommend practical next steps.
- Explicitly mention when information is unavailable.

Never pretend that an operation was performed.
"""

MAX_TOOL_ROUNDS = 5
MAX_TOOL_CALLS = 15


def ask_spark(
    db: Session,
    question: str,
) -> dict[str, Any]:

    if not question or not question.strip():
        raise ValueError("Question cannot be empty.")

    if len(question) > 4000:
        raise ValueError("Question cannot exceed 4000 characters.")

    client = get_meta_client()
    model = META_MODELS["spark"]

    response = client.responses.create(
        model=model,
        instructions=SPARK_INSTRUCTIONS,
        input=question.strip(),
        tools=TOOL_DEFINITIONS,
    )

    executed_tools = []
    total_tool_calls = 0

    for _ in range(MAX_TOOL_ROUNDS):

        function_calls = [
            item
            for item in response.output
            if item.type == "function_call"
        ]

        if not function_calls:

            answer = (response.output_text or "").strip()

            if not answer:
                raise RuntimeError(
                    "Muse Spark returned an empty response."
                )

            return {
                "answer": answer,
                "model": model,
                "tool_calls": executed_tools,
                "response_id": response.id,
            }

        tool_outputs = []

        for item in function_calls:

            total_tool_calls += 1

            if total_tool_calls > MAX_TOOL_CALLS:
                raise RuntimeError(
                    "Muse Spark exceeded the maximum tool-call limit."
                )

            try:
                arguments = json.loads(item.arguments)

                if not isinstance(arguments, dict):
                    raise ValueError(
                        "Tool arguments must be a JSON object."
                    )

                result = execute_tool(
                    db=db,
                    tool_name=item.name,
                    arguments=arguments,
                )

            except (json.JSONDecodeError, ValueError):
                logger.warning(
                    "Invalid arguments from Muse Spark tool: %s",
                    item.name,
                )

                arguments = {}

                result = {
                    "success": False,
                    "error": "Invalid tool arguments.",
                }

            executed_tools.append({
                "tool": item.name,
                "arguments": arguments,
                "success": result.get("success", False),
            })

            tool_outputs.append({
                "type": "function_call_output",
                "call_id": item.call_id,
                "output": json.dumps(
                    result,
                    ensure_ascii=False,
                    default=str,
                ),
            })

        response = client.responses.create(
            model=model,
            instructions=SPARK_INSTRUCTIONS,
            previous_response_id=response.id,
            input=tool_outputs,
            tools=TOOL_DEFINITIONS,
        )

    raise RuntimeError(
        "Muse Spark exceeded the maximum tool execution rounds."
    )