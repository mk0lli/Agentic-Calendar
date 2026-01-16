import os
import json
import uuid
import xml.etree.ElementTree as ET
from typing import List, Any
from openai import OpenAI

class OpenRouterBackend:
    """Backend using OpenRouter with structured tool call support."""

    def __init__(self, model_name: str, tools: List[Any]):
        self.model_name = model_name
        self.tools = tools
        self.client = OpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url="https://openrouter.ai/api/v1"
        )
        self.conversation_history = []

    # Tool schema for model
    def _tool_schema(self, tool):
        return {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema
            }
        }

    def _find_tool_by_name(self, name: str):
        for t in self.tools:
            if t.name == name:
                return t
        return None

    # --- Parse permissive <tool_call> text into structured tool call ---
    def _parse_tool_call_text(self, text: str):
        """Convert <tool_call> text output into tool_name + tool_args dict"""
        text = text.strip()
        if not text.startswith("<tool_call>"):
            return None, None
        try:
            root = ET.fromstring(text)
            func_elem = root.find("function")
            if func_elem is None:
                return None, None
            tool_name = func_elem.attrib.get("name") or func_elem.text
            param_elem = func_elem.find("parameter")
            if param_elem is None:
                return tool_name, {}
            try:
                tool_args = json.loads(param_elem.text)
            except:
                tool_args = {"text": param_elem.text}
            return tool_name, tool_args
        except ET.ParseError:
            return None, None

    def run(self, user_message: str) -> str:
        """
        Run a user message through Mistral, executing MCP tools locally.
        Returns the final assistant text response.
        """
        self.conversation_history.append({"role": "user", "content": user_message})

        while True:
            # Build model messages
            messages = self.conversation_history.copy()
            tools_list = [self._tool_schema(t) for t in self.tools]

            # Call the model
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                tools=tools_list,
                stream=False
            )

            msg = response.choices[0].message

            # Model wants to call a tool
            if getattr(msg, "tool_calls", None):
                call = msg.tool_calls[0]
                tool_name = call.function.name
                tool_args = json.loads(call.function.arguments)

                tool = self._find_tool_by_name(tool_name)
                result = tool.handler(tool_args) if tool else {"error": f"Tool '{tool_name}' not found"}

                # Append result as a tool message — *very important format*!
                self.conversation_history.append({
                    "role": "tool",
                    "name": tool_name,
                    "content": json.dumps(result),
                    "tool_call_id": call.id
                })
                continue

            # --- Model returned normal text ---
            final_response = msg.content or ""
            self.conversation_history.append({"role": "assistant", "content": final_response})
            return final_response


