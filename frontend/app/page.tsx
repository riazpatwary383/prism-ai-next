
"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type SpeechRecognitionResult = {
  transcript: string;
};

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<ArrayLike<SpeechRecognitionResult>>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const API_URL = "http://127.0.0.1:8000";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  function speak(text: string) {
    if (!speakReplies || typeof window === "undefined" ||
        !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ||
      speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        "Voice input is not supported in this browser. Try Chrome or Edge."
      );
      return;
    }

    setError("");

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = "";

      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      setPrompt(transcript);
    };

    recognition.onerror = () => {
      setError("Microphone error. Check browser microphone permission.");
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start voice input. Please try again.");
    }
  }

  function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    setFiles((previous) => [...previous, ...selected]);
    event.target.value = "";
  }

  async function sendMessage() {
    const text = prompt.trim();

    if ((!text && files.length === 0) || loading) return;

    const userText =
      text || `Please analyze these files: ${files.map((f) => f.name).join(", ")}`;

    setError("");
    setMessages((old) => [
      ...old,
      { role: "user", content: userText },
      { role: "assistant", content: "" },
    ]);
    setPrompt("");
    setLoading(true);

    const attachedFiles = [...files];
    setFiles([]);

    try {
      const form = new FormData();
      form.append("prompt", text);

      attachedFiles.forEach((file) => {
        form.append("files", file);
      });

      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(`Backend returned HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response received from backend.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event
            .split("\n")
            .find((item) => item.startsWith("data: "));

          if (!line) continue;

          const data = line.slice(6);
          if (data === "[DONE]") continue;

          const parsed = JSON.parse(data);

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.text) {
            result += parsed.text;

            setMessages((old) => {
              const updated = [...old];
              updated[updated.length - 1] = {
                role: "assistant",
                content: result,
              };
              return updated;
            });
          }
        }
      }

      if (result.trim()) speak(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";

      setError(message);

      setMessages((old) => {
        const updated = [...old];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${message}`,
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    window.speechSynthesis?.cancel();
    setMessages([]);
    setPrompt("");
    setFiles([]);
    setError("");
  }

  return (
    <main className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✦</span> Prism AI
        </div>

        <button className="new-chat" onClick={newChat}>
          ＋ New chat
        </button>

        <div className="side-label">YOUR SPACE</div>
        <div className="side-item">◷ Recent conversations</div>
        <div className="side-item">⌕ Explore</div>

        <div className="sidebar-bottom">
          <div className="avatar">P</div>
          <div>
            <strong>Personal workspace</strong>
            <small>Prism AI Assistant</small>
          </div>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <span>
            Prism <span className="muted">/ AI Assistant</span>
          </span>
          <span className="status"><i /> AI WORKSPACE</span>
        </header>

        <div className="conversation">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="hero-icon">✦</div>
              <div className="eyebrow">YOUR INTELLIGENT WORKSPACE</div>
              <h1>Ideas into <span>possibilities.</span></h1>
              <p>Ask questions, upload files, or talk to Prism AI.</p>

              <div className="suggestions">
                {[
                  ["✧", "Explain a topic", "Explain artificial intelligence simply."],
                  ["⌘", "Help me write", "Write a professional email to my supervisor."],
                  ["▤", "Analyze a file", "Analyze the file I upload."],
                ].map(([icon, title, text]) => (
                  <button
                    className="suggestion"
                    key={title}
                    onClick={() => setPrompt(text)}
                  >
                    <span>{icon}</span>
                    <strong>{title}</strong>
                    <small>Start exploring →</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={index}>
                  <div className="message-label">
                    {message.role === "user" ? "YOU" : "✦ PRISM AI"}
                  </div>

                  <div className="markdown">
                    {message.role === "assistant" ? (
                      <>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                        {message.content.trim() && (
                          <button
                            className="speak-message"
                            onClick={() => speak(message.content)}
                            title="Read this answer aloud"
                          >
                            🔊 Read aloud
                          </button>
                        )}
                      </>
                    ) : message.content}
                  </div>
                </article>
              ))}

              {loading && (
                <div className="typing">Prism is thinking…</div>
              )}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {error && <p className="error-message">{error}</p>}

          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, index) => (
                <div className="file-chip" key={`${file.name}-${index}`}>
                  <span>📎 {file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setFiles((old) => old.filter((_, i) => i !== index))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={
                listening ? "Listening... speak now" : "Message Prism AI..."
              }
              rows={2}
            />

            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.py,.js,.ts,.tsx,.html,.css,.xml,.log,.pdf,.png,.jpg,.jpeg,.webp,.gif"
              className="hidden-file"
              onChange={addFiles}
            />

            <div className="composer-bottom">
              <div className="tools">
                <button
                  type="button"
                  className="tool-button"
                  onClick={() => fileRef.current?.click()}
                  title="Attach files"
                  aria-label="Attach files"
                >
                  📎 <span>Attach</span>
                </button>

                <button
                  type="button"
                  className={`tool-button ${listening ? "active" : ""}`}
                  onClick={toggleVoice}
                  title="Voice input"
                  aria-label="Voice input"
                >
                  🎙️ <span>{listening ? "Listening" : "Speak"}</span>
                </button>

                <button
                  type="button"
                  className={`tool-button ${speakReplies ? "active" : ""}`}
                  onClick={() => {
                    setSpeakReplies((enabled) => {
                      if (enabled) window.speechSynthesis?.cancel();
                      return !enabled;
                    });
                  }}
                  title="Toggle spoken AI replies"
                  aria-label="Toggle spoken AI replies"
                >
                  🔊 <span>{speakReplies ? "Voice on" : "Voice off"}</span>
                </button>
              </div>

              <button
                className="send"
                type="submit"
                disabled={(!prompt.trim() && files.length === 0) || loading}
                aria-label="Send message"
              >
                {loading ? "…" : "↑"}
              </button>
            </div>
          </form>

          <p className="disclaimer">
            Prism AI can make mistakes. Verify important information.
          </p>
        </div>
      </section>
    </main>
  );
}
