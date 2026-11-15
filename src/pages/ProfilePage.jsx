import React, { useState, useRef, useEffect } from "react";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { BsCamera, BsCheck } from "react-icons/bs";
import { IoArrowBack } from "react-icons/io5";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { uploadProfilePhoto } from "../services/authService";
import { motion } from "framer-motion";
import { toast } from "react-hot-toast";

const ProfilePage = () => {
    const { currentUser, updateProfileState, refreshUserProfile } = useAuth();
    const currentUserId = currentUser?.uid || currentUser?.id;
    const [name, setName] = useState(currentUser?.displayName || "");
    const [about, setAbout] = useState(currentUser?.aboutStatus || currentUser?.about || "Hey there! I am using NovaChat.");
    const [photoURL, setPhotoURL] = useState(currentUser?.photoURL || null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (currentUser) {
            setName(currentUser.displayName || "");
            setAbout(currentUser.aboutStatus || currentUser.about || "Hey there! I am using NovaChat.");
            setPhotoURL(currentUser.photoURL || null);
        }
    }, [currentUser]);

    const handleSave = async () => {
        if (!currentUserId) return;
        setSaving(true);
        try {
            await supabase.from('users').update({
                display_name: name,
                searchable_name: name.toLowerCase(),
                about_status: about
            }).eq('id', currentUserId);
            if (updateProfileState) {
                updateProfileState({ displayName: name, aboutStatus: about });
            }
            toast.success("Profile updated successfully!");
        } catch (error) {
            console.error("Error updating profile:", error);
            toast.error("Failed to update profile.");
        } finally {
            setSaving(false);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !currentUserId) return;

        setUploading(true);
        try {
            const publicUrl = await uploadProfilePhoto(currentUserId, file);
            const freshUrl = `${publicUrl}?t=${Date.now()}`;
            setPhotoURL(freshUrl);
            if (updateProfileState) {
                updateProfileState({ photoURL: freshUrl });
            }
            if (refreshUserProfile) {
                await refreshUserProfile();
            }
            toast.success("Avatar updated!");
        } catch (err) {
            console.error("Error uploading photo:", err);
            toast.error("Failed to upload photo: " + (err.message || "Unknown error"));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="flex flex-col h-full bg-surface-elevated overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="bg-surface px-4 py-5 flex items-center gap-6 border-b border-border sticky top-0 z-10">
                <Link to="/" className="text-text-2 hover:text-text-1 transition-colors">
                    <IoArrowBack className="w-6 h-6" />
                </Link>
                <h1 className="text-lg font-semibold text-text-1">Profile & Settings</h1>
            </div>

            <div className="max-w-xl mx-auto w-full p-6 flex flex-col gap-8">
                {/* Avatar Section */}
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <Avatar
                            src={photoURL || currentUser?.photoURL}
                            alt={name || currentUser?.displayName}
                            size="2xl"
                            className="ring-4 ring-primary/20 group-hover:opacity-80 transition-opacity w-32 h-32"
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <BsCamera className="w-8 h-8 text-white mb-1" />
                            <span className="text-[10px] text-white font-bold">{uploading ? "UPLOADING..." : "CHANGE PHOTO"}</span>
                        </div>
                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full">
                                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        accept="image/*"
                        className="hidden"
                    />
                    <div className="text-center">
                        <p className="text-xs text-text-2">Click to upload a new profile avatar</p>
                    </div>
                </div>

                {/* Form Fields */}
                <div className="flex flex-col gap-6 bg-surface p-6 rounded-2xl border border-border shadow-sm">
                    {/* Name */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-primary uppercase tracking-wider">Your Name</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your name"
                            className="bg-surface-elevated border-border"
                        />
                        <p className="text-xs text-text-2">
                            This is not your username or pin. This name will be visible to your NovaChat contacts.
                        </p>
                    </div>

                    {/* About */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-primary uppercase tracking-wider">About Status</label>
                        <Input
                            value={about}
                            onChange={(e) => setAbout(e.target.value)}
                            placeholder="Enter your status"
                            className="bg-surface-elevated border-border"
                        />
                    </div>

                    {/* Email Display */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-text-2 uppercase tracking-wider">Email Address</label>
                        <Input
                            value={currentUser?.email || ""}
                            disabled
                            className="bg-muted text-muted-foreground border-transparent cursor-not-allowed"
                        />
                    </div>

                    {/* Save Button */}
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-primary hover:bg-primary/90 text-white w-full py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                    >
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <BsCheck className="w-5 h-5" />
                                <span>Save Changes</span>
                            </>
                        )}
                    </Button>
                </div>

                {/* System Audit Card */}
                <div className="bg-surface p-6 rounded-2xl border border-border flex flex-col gap-4">
                    <h2 className="text-sm font-bold text-text-1 uppercase tracking-wider">System & Storage Health</h2>
                    <SystemHealthAudit />
                </div>

                {/* Version info */}
                <div className="text-center text-xs text-text-2 pb-6">
                    <p>Nova Messaging v2.0 • Pure Supabase Stack</p>
                    <p className="opacity-70 mt-1">End-to-End Encrypted Real-Time Communication</p>
                </div>
            </div>
        </div>
    );
};

const SystemHealthAudit = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    const runAudit = async () => {
        setLoading(true);
        const checks = [];

        // 1. Browser Check
        checks.push({
            name: "Browser Connectivity",
            status: navigator.onLine ? "pass" : "fail",
            detail: navigator.onLine ? "Online" : "Offline"
        });

        // 2. Supabase Connection Check
        try {
            const { data, error } = await supabase.from('users').select('id').limit(1);
            if (!error) {
                checks.push({
                    name: "Supabase PostgreSQL Database",
                    status: "pass",
                    detail: "Healthy & Connected"
                });
            } else {
                checks.push({
                    name: "Supabase PostgreSQL Database",
                    status: "fail",
                    detail: error.message
                });
            }
        } catch (e) {
            checks.push({
                name: "Supabase PostgreSQL Database",
                status: "fail",
                detail: e.message
            });
        }

        // 3. Supabase Auth Session
        const { data: { session } } = await supabase.auth.getSession();
        checks.push({
            name: "Supabase Auth Session",
            status: session ? "pass" : "warn",
            detail: session ? "Active Token" : "No Session"
        });

        setStatus(checks);
        setLoading(false);
    };

    return (
        <div className="flex flex-col gap-3">
            <button
                onClick={runAudit}
                disabled={loading}
                className="w-full py-2.5 text-xs font-mono font-bold uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors rounded-xl border border-dashed border-primary/40"
            >
                {loading ? "Checking System..." : "Run Supabase Diagnostics"}
            </button>

            {status && (
                <div className="flex flex-col gap-2 mt-2">
                    {status.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-surface-elevated border border-border">
                            <span className="font-medium text-text-1">{item.name}</span>
                            <span className={item.status === 'pass' ? 'text-emerald-500 font-semibold' : item.status === 'warn' ? 'text-amber-500' : 'text-red-500'}>
                                {item.detail}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ProfilePage;
