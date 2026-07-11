/**
 * Chat Store — Zustand state management for the LJU Student Assistant chatbot.
 * Manages chat modal state, messages, sessions, theme, and API interactions.
 */
import { create } from 'zustand';
import * as chatApi from '../api/chatApi.js';

export const useChatStore = create((set, get) => ({
  // ── UI State ────────────────────────────────────────────
  isOpen: false,
  isSidebarOpen: false,
  isLoading: false,
  theme: localStorage.getItem('chatbot_theme') || 'dark',

  // ── Chat Data ───────────────────────────────────────────
  messages: [],
  sessions: [],
  currentSessionId: null,
  error: null,

  // ── UI Actions ──────────────────────────────────────────
  toggleChat: () => {
    const { isOpen, sessions } = get();
    const nextOpen = !isOpen;
    set({ isOpen: nextOpen, error: null });

    // Load sessions when opening chat for the first time
    if (nextOpen && sessions.length === 0) {
      get().loadSessions();
    }
  },

  closeChat: () => set({ isOpen: false }),

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('chatbot_theme', newTheme);
    set({ theme: newTheme });
  },

  clearError: () => set({ error: null }),

  // ── Message Actions ─────────────────────────────────────
  sendMessage: async (text) => {
    if (!text.trim() || get().isLoading) return;

    const { currentSessionId, messages } = get();

    // Optimistically add user message to UI
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender: 'student',
      message: text,
      created_at: new Date().toISOString(),
    };

    set({
      messages: [...messages, tempUserMsg],
      isLoading: true,
      error: null,
    });

    try {
      const response = await chatApi.postMessage(text, currentSessionId);

      // Replace temp message with real one and add AI response
      set((state) => ({
        messages: [
          ...state.messages.filter((m) => m.id !== tempUserMsg.id),
          response.user_message,
          response.ai_response,
        ],
        currentSessionId: response.session_id,
        isLoading: false,
      }));

      // Refresh sessions list to show updated sidebar
      get().loadSessions();

    } catch (err) {
      // Keep user message but show error
      set({
        isLoading: false,
        error: err.message || 'Failed to send message. Please try again.',
      });
    }
  },

  // ── Session Actions ─────────────────────────────────────
  loadSessions: async () => {
    try {
      const sessions = await chatApi.getSessions();
      set({ sessions: sessions || [] });
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    }
  },

  loadSession: async (sessionId) => {
    try {
      set({ isLoading: true, error: null });
      const session = await chatApi.getSessionMessages(sessionId);

      set({
        currentSessionId: sessionId,
        messages: session.messages || [],
        isLoading: false,
        isSidebarOpen: false,  // Close sidebar after selecting
      });
    } catch (err) {
      set({
        isLoading: false,
        error: 'Failed to load conversation.',
      });
    }
  },

  startNewChat: () => {
    set({
      currentSessionId: null,
      messages: [],
      error: null,
      isSidebarOpen: false,
    });
  },

  deleteSession: async (sessionId) => {
    try {
      await chatApi.deleteSession(sessionId);

      // If we deleted the active session, clear messages
      const { currentSessionId } = get();
      if (currentSessionId === sessionId) {
        set({ currentSessionId: null, messages: [] });
      }

      // Refresh sessions list
      get().loadSessions();
    } catch (err) {
      set({ error: 'Failed to delete conversation.' });
    }
  },

  clearAllHistory: async () => {
    try {
      await chatApi.deleteAllHistory();
      set({
        sessions: [],
        messages: [],
        currentSessionId: null,
        isSidebarOpen: false,
      });
    } catch (err) {
      set({ error: 'Failed to clear chat history.' });
    }
  },
}));
