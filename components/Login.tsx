import React, { useState } from 'react';

interface LoginProps {
  onLogin: (username: string, pass: string) => Promise<boolean> | boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    try {
      const success = await Promise.resolve(onLogin(email, password));
      if (!success) {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError('An error occurred during login');
      console.error(err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 animate-fade-in-up">
        
        {/* Logo Section */}
        <div className="text-center mb-8">
           <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
              <span className="material-icons text-white text-3xl">propane</span>
           </div>
           <h1 className="text-2xl font-bold text-gray-800">GasCyl Track</h1>
           <p className="text-gray-500 text-sm mt-1">Industrial Asset Management</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
              <span className="material-icons text-sm">error</span>
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <div className="relative">
              <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-lg">email</span>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800"
                placeholder="Enter email"
                required
                disabled={isLoggingIn}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-lg">lock</span>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800"
                placeholder="Enter password"
                required
                disabled={isLoggingIn}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
             <label className="flex items-center gap-2 cursor-pointer">
               <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" />
               <span className="text-gray-600">Remember me</span>
             </label>
             <button type="button" className="text-blue-600 hover:text-blue-800 font-medium">Forgot Password?</button>
          </div>

          <button 
            type="submit" 
            disabled={isLoggingIn}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isLoggingIn ? (
                <span>Signing In...</span>
            ) : (
                <>
                    <span>Sign In</span>
                    <span className="material-icons text-sm">arrow_forward</span>
                </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
           Note: Ensure you have a registered user in your Supabase Auth.
        </p>
      </div>
    </div>
  );
};

export default Login;