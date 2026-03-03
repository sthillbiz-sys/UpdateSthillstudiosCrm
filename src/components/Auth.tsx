import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Building2, AlertCircle } from 'lucide-react';
import { LOGO_SRC } from '../lib/assets';

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = isLogin
        ? await signIn(email, password)
        : await signUp(email, password);

      if (error) {
        setError(error.message);
      } else if (!isLogin) {
        setError('Account created! Please sign in.');
        setIsLogin(true);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a2332] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img
            src={LOGO_SRC}
            alt="SthillStudios Logo"
            className="w-48 h-auto mb-4"
          />
          <p className="text-gray-500 text-xs uppercase tracking-wider">
            CRM DASHBOARD
          </p>
        </div>

        <div className="bg-[#2a3647] rounded-xl shadow-2xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[#1e2836] border border-[#3a4555] rounded-lg text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-[#3b9ff3] focus:border-transparent transition-all"
                placeholder="you@sthillstudios.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-[#1e2836] border border-[#3a4555] rounded-lg text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-[#3b9ff3] focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#3b9ff3] to-[#5d7ef7] hover:from-[#2a8ee0] hover:to-[#4c6de6] text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              className="text-sm text-slate-400 hover:text-slate-300"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>

          {isLogin && (
            <div className="mt-4 text-center">
              <button className="text-sm text-slate-500 hover:text-slate-400">
                Forgot password?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
