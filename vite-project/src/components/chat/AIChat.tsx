import { useState, useRef, useEffect } from "react";
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  CircularProgress,
  Avatar,
} from "@mui/material";
import {
  Send as SendIcon,
  SmartToy as AIIcon,
  Person as PersonIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { sendAgentMessage } from "../../api/calendarApi";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  onEventChange?: () => void;
  onClose?: () => void;
}

export function AIChat({ onEventChange, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your calendar assistant. I can help you create, update, or delete events. Try saying something like 'Create a meeting tomorrow at 3pm' or 'Show me my events for next week'.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendAgentMessage(userMessage.content);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          response.response ||
          response.error ||
          "I couldn't process that request. Please try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Trigger event refresh if the AI made changes
      if (
        response.response &&
        (response.response.toLowerCase().includes("created") ||
          response.response.toLowerCase().includes("updated") ||
          response.response.toLowerCase().includes("deleted") ||
          response.response.toLowerCase().includes("synced"))
      ) {
        onEventChange?.();
      }
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Sorry, I encountered an error. Please make sure the backend server is running.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper",
        borderRadius: 3,
        overflow: "hidden",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <AIIcon sx={{ color: "white", fontSize: 28 }} />
          <Box>
            <Typography
              variant="h6"
              sx={{ fontWeight: 600, color: "white", lineHeight: 1.2 }}
            >
              AI Calendar Assistant
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.8)" }}>
              Powered by AI
            </Typography>
          </Box>
        </Box>
        {onClose && (
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              bgcolor: "rgba(255,255,255,0.9)",
              "&:hover": { bgcolor: "white" },
              width: 28,
              height: 28,
            }}
          >
            <CloseIcon sx={{ fontSize: 16, color: "#667eea" }} />
          </IconButton>
        )}
      </Box>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          bgcolor: "#f8f9fa",
        }}
      >
        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              display: "flex",
              gap: 1.5,
              flexDirection: message.role === "user" ? "row-reverse" : "row",
            }}
          >
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: message.role === "user" ? "#1976d2" : "#667eea",
                flexShrink: 0,
              }}
            >
              {message.role === "user" ? (
                <PersonIcon sx={{ fontSize: 20 }} />
              ) : (
                <AIIcon sx={{ fontSize: 20 }} />
              )}
            </Avatar>
            <Paper
              elevation={0}
              sx={{
                px: 2,
                py: 1.5,
                maxWidth: "80%",
                bgcolor: message.role === "user" ? "#1976d2" : "white",
                color: message.role === "user" ? "white" : "text.primary",
                borderRadius: 2.5,
                borderTopRightRadius: message.role === "user" ? 0.5 : 2.5,
                borderTopLeftRadius: message.role === "user" ? 2.5 : 0.5,
                boxShadow:
                  message.role === "user"
                    ? "0 2px 8px rgba(25, 118, 210, 0.25)"
                    : "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
              >
                {message.content}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mt: 0.5,
                  opacity: 0.7,
                  fontSize: "0.7rem",
                }}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Typography>
            </Paper>
          </Box>
        ))}
        {isLoading && (
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: "#667eea",
                flexShrink: 0,
              }}
            >
              <AIIcon sx={{ fontSize: 20 }} />
            </Avatar>
            <Paper
              elevation={0}
              sx={{
                px: 2.5,
                py: 1.5,
                bgcolor: "white",
                borderRadius: 2.5,
                borderTopLeftRadius: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <CircularProgress size={16} sx={{ color: "#667eea" }} />
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Thinking...
              </Typography>
            </Paper>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box
        sx={{
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "white",
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "flex-end",
          }}
        >
          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask me to manage your calendar..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            variant="outlined"
            size="small"
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 3,
                bgcolor: "#f8f9fa",
                "&:hover": {
                  bgcolor: "#f0f1f2",
                },
                "&.Mui-focused": {
                  bgcolor: "white",
                },
              },
            }}
          />
          <IconButton
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            sx={{
              bgcolor: "#667eea",
              color: "white",
              "&:hover": {
                bgcolor: "#5a6fd6",
              },
              "&.Mui-disabled": {
                bgcolor: "#e0e0e0",
                color: "#9e9e9e",
              },
              width: 44,
              height: 44,
            }}
          >
            <SendIcon />
          </IconButton>
        </Box>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 1,
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          Try: "Schedule a meeting tomorrow at 2pm" or "What's on my calendar?"
        </Typography>
      </Box>
    </Box>
  );
}

