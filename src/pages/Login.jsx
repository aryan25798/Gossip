import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FaLock, FaEnvelope, FaShieldAlt, FaUserPlus, FaSignInAlt, FaGoogle } from "react-icons/fa";

export default function Login() {
    const { currentUser, loginWithEmail, signupWithEmail, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    
    // Auth Mode: 'login' | 'register' | 'admin'
    const searchParams = new URLSearchParams(window.location.search);
    const initialMode = searchParams.get('mode') === 'admin' ? 'admin' : (searchParams.get('mode') === 'register' ? 'register' : 'login');
    const [mode, setMode] = useState(initialMode);
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ error: "", success: "" });

    useEffect(() => {
        if (currentUser && currentUser.claimsSettled) {
            const isAdmin = !!currentUser.isAdmin || currentUser.role === 'admin' || currentUser.role === 'superAdmin' || currentUser.email === 'admin@novachat.app';
            if (isAdmin && (mode === 'admin' || window.location.search.includes('mode=admin'))) {
                navigate("/admin", { replace: true });
            } else if (isAdmin) {
                navigate("/admin", { replace: true });
            } else {
                navigate("/", { replace: true });
            }
        }
    }, [currentUser, navigate, mode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ error: "", success: "" });

        try {
            if (mode === 'register') {
                await signupWithEmail(email, password, displayName);
                setStatus({ error: "", success: "Account created! If email confirmation is enabled, check your email, or sign in now." });
            } else {
                const user = await loginWithEmail(email, password);
                if (mode === 'admin' || user?.role === 'admin' || user?.role === 'superAdmin') {
                    navigate("/admin", { replace: true });
                } else {
                    navigate("/", { replace: true });
                }
            }
        } catch (error) {
            setStatus({ error: error.message || "Authentication failed. Please check your credentials.", success: "" });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setLoading(true);
        setStatus({ error: "", success: "" });
        try {
            await loginWithGoogle();
        } catch (err) {
            setStatus({ error: err.message || "Google Sign-In failed.", success: "" });
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-background text-foreground font-sans selection:bg-primary/20">
            {/* Left Side - Hero / Branding */}
            <div className="hidden lg:flex w-1/2 bg-surface-elevated relative overflow-hidden items-center justify-center p-12">
                <div className="absolute inset-0 bg-primary/5 pattern-grid-lg opacity-20" />
                <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />

                <div className="relative z-10 max-w-lg space-y-8">
                    <div className="w-20 h-20 bg-gradient-to-tr from-primary to-blue-600 rounded-2xl shadow-2xl flex items-center justify-center mb-8 rotate-3">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <h1 className="text-5xl font-bold tracking-tight text-foreground">
                        Connect with <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">your world.</span>
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                        Industry-grade real-time messaging with Supabase PostgreSQL, live presence, and zero compromise on reliability.
                    </p>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:text-left space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            {mode === 'admin' ? "Admin Surveillance & Access" : mode === 'register' ? "Create an Account" : "Welcome back"}
                        </h2>
                        <p className="text-muted-foreground">
                            {mode === 'admin' 
                                ? "Enter your elevated credentials for GodMap & Spy Chat." 
                                : mode === 'register'
                                ? "Join NovaChat today with email or Google."
                                : "Sign in to your account to continue."}
                        </p>
                    </div>

                    {status.error && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-2">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {status.error}
                        </div>
                    )}

                    {status.success && (
                        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium flex items-center gap-2">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {status.success}
                        </div>
                    )}

                    {/* Google OAuth Button */}
                    {mode !== 'admin' && (
                        <div className="space-y-4">
                            <button
                                type="button"
                                onClick={handleGoogleAuth}
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-xl bg-surface hover:bg-surface-elevated text-foreground font-medium transition-all shadow-sm disabled:opacity-50"
                            >
                                <FaGoogle className="text-red-500 text-lg" />
                                <span>{mode === 'register' ? "Sign up with Google" : "Continue with Google"}</span>
                            </button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-border" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">or with email</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Email / Password Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'register' && (
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-foreground">Full Name / Display Name</label>
                                <input
                                    type="text"
                                    required
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="block w-full px-3 py-3 border border-border rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                    placeholder="John Doe"
                                />
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Email Address</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                                    <FaEnvelope />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                    placeholder={mode === 'admin' ? "admin@novachat.app" : "name@example.com"}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-foreground">Password</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                                    <FaLock />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 px-8 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
                            >
                                {loading ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : mode === 'admin' ? (
                                    <>
                                        <FaShieldAlt />
                                        <span>Access Surveillance Dashboard</span>
                                    </>
                                ) : mode === 'register' ? (
                                    <>
                                        <FaUserPlus />
                                        <span>Create Account</span>
                                    </>
                                ) : (
                                    <>
                                        <FaSignInAlt />
                                        <span>Sign In</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    {/* Mode Toggle Controls */}
                    <div className="flex flex-col gap-2 pt-2 text-center text-sm">
                        {mode === 'login' ? (
                            <>
                                <p className="text-muted-foreground">
                                    Don't have an account?{" "}
                                    <button onClick={() => { setMode('register'); setStatus({ error: "", success: "" }); }} className="text-primary font-semibold hover:underline">
                                        Sign up
                                    </button>
                                </p>
                                <button onClick={() => { setMode('admin'); setEmail('admin@novachat.app'); setStatus({ error: "", success: "" }); }} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                                    Switch to Administrator Login
                                </button>
                            </>
                        ) : mode === 'register' ? (
                            <p className="text-muted-foreground">
                                Already have an account?{" "}
                                <button onClick={() => { setMode('login'); setStatus({ error: "", success: "" }); }} className="text-primary font-semibold hover:underline">
                                    Sign in
                                </button>
                            </p>
                        ) : (
                            <button onClick={() => { setMode('login'); setEmail(''); setStatus({ error: "", success: "" }); }} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                                Back to Standard User Login
                            </button>
                        )}
                    </div>

                    <div className="pt-8 text-center text-xs text-muted-foreground">
                        <p>© 2024 NovaChat. Powered by Supabase.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
