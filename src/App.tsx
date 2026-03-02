import { AuthProvider, useAuth } from './lib/auth';
import { PresenceProvider } from './lib/presence';
import { Auth } from './components/Auth';
import { CRM } from './components/CRM';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? (
    <PresenceProvider>
      <CRM />
    </PresenceProvider>
  ) : (
    <Auth />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
