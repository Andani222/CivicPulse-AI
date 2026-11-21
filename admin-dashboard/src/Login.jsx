import { API_BASE_URL } from './config/api';
import { useState } from 'react';
import { ShieldCheck, Lock, Mail } from 'lucide-react';
import './Login.css';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Login failed.');
      }

      if (result.user?.role !== 'admin') {
        throw new Error('Access denied. Administrator account required.');
      }

      onLogin({
        token: result.token,
        user: result.user,
      });

    } catch (error) {
      setError(error.message || 'Unable to connect to CivicPulse.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <ShieldCheck size={34} />
        </div>

        <h1>CivicPulse</h1>
        <p className="login-subtitle">Administrator Portal</p>

        <form onSubmit={handleSubmit}>
          <label>Email address</label>
          <div className="login-input">
            <Mail size={18} />
            <input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <label>Password</label>
          <div className="login-input">
            <Lock size={18} />
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer">
          Secure access for authorised municipal administrators.
        </p>
      </div>
    </div>
  );
}

export default Login;
