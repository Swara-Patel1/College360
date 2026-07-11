/**
 * ChatBot Component — LJU Student Assistant
 * 
 * A floating chatbot widget with ChatGPT-like UX that provides
 * AI-powered assistance to students using their university data.
 * 
 * Features:
 * - Floating action button with pulse animation
 * - Glassmorphism chat modal
 * - Message bubbles with typing indicator
 * - Chat history sidebar
 * - Suggested questions
 * - Dark/Light theme toggle
 * - Responsive (full-screen on mobile)
 * - Auto-scroll to latest messages
 * - Enter key to send
 */
import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/useChatStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import '../css/chatbot.css';

// ── Suggested Questions shown in the welcome state ──
const SUGGESTED_QUESTIONS = [
  { icon: '📊', text: 'What is my attendance percentage?' },
  { icon: '🎯', text: 'Am I eligible for placements?' },
  { icon: '📅', text: "Show today's timetable" },
  { icon: '🎉', text: 'What are upcoming events?' },
  { icon: '📚', text: 'Recommend courses for me' },
  { icon: '🏢', text: 'Which companies can I apply to?' },
];

export default function ChatBot() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const { user } = useAuthStore();

  const {
    isOpen,
    isSidebarOpen,
    isLoading,
    theme,
    messages,
    sessions,
    currentSessionId,
    error,
    toggleChat,
    closeChat,
    toggleSidebar,
    toggleTheme,
    sendMessage,
    loadSession,
    startNewChat,
    deleteSession,
    clearAllHistory,
    clearError,
  } = useChatStore();

  // ── Auto-scroll to bottom when messages change ──
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // ── Focus input when chat opens ──
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [isOpen]);

  // ── Get user initials for avatar ──
  const userInitials = user
    ? `${(user.first_name || '')[0] || ''}${(user.last_name || '')[0] || ''}`.toUpperCase() || 'U'
    : 'U';

  // ── Send message handler ──
  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  // ── Enter key handler ──
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Click suggested question ──
  const handleSuggestion = (text) => {
    setInput('');
    sendMessage(text);
  };

  // ── Format timestamp ──
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Format relative date for sidebar ──
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // ── Simple markdown-like formatting ──
  const formatMessage = (text) => {
    if (!text) return '';

    // Process line by line
    const lines = text.split('\n');
    let html = '';
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Bold text: **text** or __text__
      let processed = trimmed
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>');

      // Bullet points: • or - or *
      if (/^[•\-\*]\s+/.test(processed)) {
        if (!inList) { html += '<ul>'; inList = true; }
        processed = processed.replace(/^[•\-\*]\s+/, '');
        html += `<li>${processed}</li>`;
        continue;
      }

      if (inList) { html += '</ul>'; inList = false; }

      // Empty lines become breaks
      if (!processed) {
        html += '<br/>';
        continue;
      }

      html += `<p>${processed}</p>`;
    }

    if (inList) html += '</ul>';
    return html;
  };

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button
        id="chatbot-fab"
        className={`chatbot-fab ${isOpen ? 'open' : ''}`}
        onClick={toggleChat}
        title={isOpen ? 'Close assistant' : 'LJU Student Assistant'}
        aria-label="Toggle chatbot"
      >
        {isOpen ? '✕' : '✨'}
      </button>

      {/* ── Chat Modal ── */}
      {isOpen && (
        <div className={`chatbot-modal ${theme}`} role="dialog" aria-label="LJU Student Assistant">

          {/* ── Header ── */}
          <div className="chatbot-header">
            <div className="chatbot-avatar">✨</div>
            <div className="chatbot-header-info">
              <div className="chatbot-header-title">LJU Student Assistant</div>
              <div className="chatbot-header-status">Online</div>
            </div>
            <div className="chatbot-header-actions">
              <button
                className="chatbot-header-btn"
                onClick={toggleSidebar}
                title="Chat history"
                aria-label="Toggle chat history"
              >
                📋
              </button>
              <button
                className="chatbot-header-btn"
                onClick={startNewChat}
                title="New chat"
                aria-label="Start new chat"
              >
                ✏️
              </button>
              <button
                className="chatbot-header-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button
                className="chatbot-header-btn"
                onClick={closeChat}
                title="Close"
                aria-label="Close chatbot"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Chat History Sidebar ── */}
          {isSidebarOpen && (
            <div className="chatbot-sidebar">
              <div className="chatbot-sidebar-header">
                <span className="chatbot-sidebar-title">Chat History</span>
                <button className="chatbot-sidebar-close" onClick={toggleSidebar} aria-label="Close sidebar">
                  ✕
                </button>
              </div>

              <div className="chatbot-sidebar-list">
                {sessions.length === 0 ? (
                  <div className="chatbot-sidebar-empty">
                    No conversations yet.<br />Start a new chat! 💬
                  </div>
                ) : (
                  sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`chatbot-sidebar-item ${session.id === currentSessionId ? 'active' : ''}`}
                      onClick={() => loadSession(session.id)}
                    >
                      <span className="chatbot-sidebar-item-icon">💬</span>
                      <div className="chatbot-sidebar-item-content">
                        <div className="chatbot-sidebar-item-title">{session.title}</div>
                        <div className="chatbot-sidebar-item-preview">
                          {session.last_message?.preview || 'No messages'}
                          {' · '}
                          {formatDate(session.updated_at)}
                        </div>
                      </div>
                      <button
                        className="chatbot-sidebar-item-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="chatbot-sidebar-footer">
                <button className="chatbot-sidebar-new-btn" onClick={() => { startNewChat(); toggleSidebar(); }}>
                  ✏️ New Conversation
                </button>
                {sessions.length > 0 && (
                  <button className="chatbot-sidebar-clear-btn" onClick={clearAllHistory}>
                    🗑️ Clear All History
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Messages Area ── */}
          <div className="chatbot-messages">
            {messages.length === 0 && !isLoading ? (
              /* Welcome State */
              <div className="chatbot-welcome">
                <div className="chatbot-welcome-avatar">✨</div>
                <div className="chatbot-welcome-title">
                  Hi{user?.first_name ? ` ${user.first_name}` : ''}! 👋
                </div>
                <div className="chatbot-welcome-subtitle">
                  I'm your LJU Student Assistant. Ask me about your attendance, grades, timetable, fees, placements, or anything university-related!
                </div>

                {/* Suggested Questions */}
                <div className="chatbot-suggestions">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      className="chatbot-suggestion-pill"
                      onClick={() => handleSuggestion(q.text)}
                    >
                      {q.icon} {q.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message Bubbles */
              <>
                {messages.map((msg) => (
                  <div key={msg.id} className={`chatbot-msg ${msg.sender}`}>
                    <div className="chatbot-msg-avatar">
                      {msg.sender === 'assistant' ? '✨' : userInitials}
                    </div>
                    <div>
                      <div
                        className="chatbot-msg-bubble"
                        dangerouslySetInnerHTML={{ __html: formatMessage(msg.message) }}
                      />
                      <div className="chatbot-msg-time">{formatTime(msg.created_at)}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="chatbot-typing">
                <div className="chatbot-typing-avatar">✨</div>
                <div className="chatbot-typing-bubble">
                  <div className="chatbot-typing-dot" />
                  <div className="chatbot-typing-dot" />
                  <div className="chatbot-typing-dot" />
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="chatbot-error">
                ⚠️ {error}
                <button className="chatbot-error-dismiss" onClick={clearError} aria-label="Dismiss error">
                  ✕
                </button>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Area ── */}
          <div className="chatbot-input-area">
            <div className="chatbot-input-wrapper">
              <input
                ref={inputRef}
                id="chatbot-input"
                className="chatbot-input"
                type="text"
                placeholder="Ask me anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoComplete="off"
                aria-label="Type your message"
              />
              <button
                id="chatbot-send"
                className="chatbot-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                title="Send message"
                aria-label="Send message"
              >
                ➤
              </button>
            </div>
            <div className="chatbot-powered-by">
              Powered by Groq AI · LJU EduPulse
            </div>
          </div>
        </div>
      )}
    </>
  );
}
