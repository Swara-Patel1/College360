import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './routes/AppRoutes.jsx';
import { useNotifStore } from './store/useNotifStore.js';
import './css/fonts.css';
import './css/main.css';

// Initialize React Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

function App() {
  const toasts = useNotifStore((state) => state.toasts);
  const removeToast = useNotifStore((state) => state.removeToast);

  const toastIcons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppRoutes />
        
        {/* React Toast Container mapping to original main.css classes */}
        {toasts.length > 0 && (
          <div className="toast-container">
            {toasts.map((toast) => (
              <div 
                key={toast.id} 
                className={`toast ${toast.type}`}
                onClick={() => removeToast(toast.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="toast-icon">{toastIcons[toast.type] || 'ℹ️'}</div>
                <div className="toast-content">
                  {toast.title && <div className="toast-title">{toast.title}</div>}
                  <div className="toast-message">{toast.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Router>
    </QueryClientProvider>
  );
}

export default App;
