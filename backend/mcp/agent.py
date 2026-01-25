from typing import List, Any


class Agent:
    """
    Lightweight MCP Agent that connects:
    - a backend (LLM + tool execution loop)
    - a set of tools
    """

    def __init__(
        self,
        name: str,
        description: str,
        backend: Any,
        tools: List[Any],
    ):
        self.name = name
        self.description = description
        self.backend = backend
        self.tools = tools
        self._validate_tools()

    def _validate_tools(self):
        for tool in self.tools:
            for attr in ("name", "description", "input_schema", "handler"):
                if not hasattr(tool, attr):
                    raise ValueError(
                        f"Tool {tool} is missing required attribute '{attr}'"
                    )

    def run(self, user_message: str) -> str:
        """
        Execute a user message through the backend.
        The backend is responsible for:
        - tool calls
        - conversation history
        - returning final text
        """
        return self.backend.run(user_message)
