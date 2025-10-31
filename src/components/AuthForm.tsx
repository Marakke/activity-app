'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthFormProps {
    onAuthSuccess: () => void;
}

export default function AuthForm({ onAuthSuccess }: AuthFormProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isLogin) {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (signInError) throw signInError;

                onAuthSuccess();
            } else {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (signUpError) throw signUpError;

                setMessage('Account created! You can now log in.');
                setIsLogin(true);
                setPassword('');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='min-h-screen bg-slate-800 flex items-center justify-center p-4'>
            <div className='bg-slate-700 rounded-lg p-8 w-full max-w-md shadow-lg'>
                <h2 className='text-3xl font-bold text-white mb-2 text-center'>Activity Tracker</h2>
                <p className='text-slate-300 text-center mb-8'>{isLogin ? 'Welcome back!' : 'Create your account'}</p>

                <form onSubmit={handleAuth} className='space-y-4'>
                    <div>
                        <label htmlFor='email' className='block text-white mb-2'>
                            Email
                        </label>
                        <input
                            id='email'
                            type='email'
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className='w-full px-4 py-2 rounded-lg bg-slate-600 text-white placeholder-slate-400 border border-slate-500 focus:border-blue-500 focus:outline-none'
                            placeholder='your@email.com'
                        />
                    </div>

                    <div>
                        <label htmlFor='password' className='block text-white mb-2'>
                            Password
                        </label>
                        <input
                            id='password'
                            type='password'
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className='w-full px-4 py-2 rounded-lg bg-slate-600 text-white placeholder-slate-400 border border-slate-500 focus:border-blue-500 focus:outline-none'
                            placeholder='••••••••'
                        />
                    </div>

                    {error && (
                        <div className='bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm'>
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className='bg-green-500/20 border border-green-500 text-green-200 px-4 py-3 rounded-lg text-sm'>
                            {message}
                        </div>
                    )}

                    <button
                        type='submit'
                        disabled={loading}
                        className='w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors'
                    >
                        {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Sign Up'}
                    </button>
                </form>

                <div className='mt-6 text-center'>
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError(null);
                            setMessage(null);
                        }}
                        className='text-blue-400 hover:text-blue-300 text-sm'
                    >
                        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
                    </button>
                </div>
            </div>
        </div>
    );
}
