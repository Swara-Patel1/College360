/**
 * Chat API Client — Handles communication with the Django chatbot backend.
 * All requests include JWT authentication token from localStorage.
 * 
 * The chatbot API runs on the Django backend (port 8000),
 * separate from the Supabase-based main API.
 */

const CHAT_API_BASE = 'http://localhost:8000/api/chat';

/**
 * Helper to build headers with JWT auth token and user identification.
 * Sends user info headers so the Django backend can identify Supabase users.
 */
function getAuthHeaders() {
  const token = localStorage.getItem('access_token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(user?.id ? { 'X-User-ID': String(user.id) } : {}),
    ...(user?.email ? { 'X-User-Email': user.email } : {}),
    ...(user?.first_name ? { 'X-User-FirstName': user.first_name } : {}),
    ...(user?.last_name ? { 'X-User-LastName': user.last_name } : {}),
    ...(user?.role ? { 'X-User-Role': user.role } : {}),
  };
}

/**
 * Helper for API requests with error handling.
 */
async function chatFetch(path, options = {}) {
  const url = `${CHAT_API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });

    // Handle 204 No Content (successful delete)
    if (response.status === 204) return null;

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.detail || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    // Network errors or JSON parse failures
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Cannot connect to the AI server. Please ensure the backend is running.');
    }
    throw error;
  }
}

/**
 * Send a message to the AI assistant.
 * @param {string} message - The user's message
 * @param {number|null} sessionId - Optional session ID to continue a conversation
 * @returns {Promise<Object>} Response with session_id, user_message, ai_response
 */
export async function postMessage(message, sessionId = null) {
  const body = { message };
  if (sessionId) {
    body.session_id = sessionId;
  }

  return chatFetch('/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Get all chat sessions for the logged-in student.
 * @returns {Promise<Array>} List of session objects with last_message preview
 */
export async function getSessions() {
  return chatFetch('/history/');
}

/**
 * Get all messages for a specific chat session.
 * @param {number} sessionId - The session ID
 * @returns {Promise<Object>} Session object with messages array
 */
export async function getSessionMessages(sessionId) {
  return chatFetch(`/history/${sessionId}/`);
}

/**
 * Delete all chat history for the logged-in student.
 * @returns {Promise<Object>} Confirmation message with deleted count
 */
export async function deleteAllHistory() {
  return chatFetch('/history/clear/', {
    method: 'DELETE',
  });
}

/**
 * Delete a specific chat session.
 * @param {number} sessionId - The session ID to delete
 * @returns {Promise<Object>} Confirmation message
 */
export async function deleteSession(sessionId) {
  return chatFetch(`/history/${sessionId}/delete/`, {
    method: 'DELETE',
  });
}
