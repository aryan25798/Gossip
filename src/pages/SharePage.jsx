import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { chatService } from '../services/chatService';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { FaPaperPlane, FaSpinner, FaImage, FaTimes } from 'react-icons/fa';

const SharePage = () => {
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [sharedData, setSharedData] = useState(null);
    const [sharedMediaBlob, setSharedMediaBlob] = useState(null);
    const [chats, setChats] = useState([]);
    const [selectedChats, setSelectedChats] = useState([]);
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const currentUserId = currentUser?.uid || currentUser?.id;
    const [error, setError] = useState('');

    useEffect(() => {
        const loadSharedContent = async () => {
            try {
                if ('caches' in window) {
                    const cache = await caches.open('share-target-cache');
                    const response = await cache.match('/api/share-data');

                    if (response) {
                        const data = await response.json();
                        setSharedData(data);

                        if (data.hasMedia) {
                            const mediaResponse = await cache.match('/api/share-media');
                            if (mediaResponse) {
                                const blob = await mediaResponse.blob();
                                setSharedMediaBlob(blob);
                            }
                        }
                    } else {
                        navigate('/');
                        return;
                    }
                }
            } catch (err) {
                console.error("Error loading shared content:", err);
                setError("Failed to load shared content.");
            } finally {
                setLoading(false);
            }
        };

        if (currentUserId) {
            loadSharedContent();
            chatService.getUserChats(currentUserId).then(userChats => {
                setChats(userChats || []);
            });
        }
    }, [currentUserId, navigate]);

    const toggleChat = (chatId) => {
        setSelectedChats(prev =>
            prev.includes(chatId)
                ? prev.filter(id => id !== chatId)
                : [...prev, chatId]
        );
    };

    const handleSend = async () => {
        if (selectedChats.length === 0 || !currentUser) return;
        setSending(true);

        try {
            for (const chatId of selectedChats) {
                if (sharedMediaBlob) {
                    const file = new File([sharedMediaBlob], `shared_${Date.now()}`, { type: sharedMediaBlob.type });
                    await chatService.sendMediaMessage(chatId, currentUser, file, sharedData?.text || '');
                } else if (sharedData?.text) {
                    await chatService.sendMessage(chatId, currentUser, sharedData.text);
                }
            }

            if ('caches' in window) {
                const cache = await caches.open('share-target-cache');
                await cache.delete('/api/share-data');
                await cache.delete('/api/share-media');
            }

            navigate('/');
        } catch (err) {
            console.error("Error sending shared content:", err);
            setError("Failed to send content. Please try again.");
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <FaSpinner className="animate-spin text-3xl text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
                <h1 className="text-xl font-bold">Forward to...</h1>
                <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                    <FaTimes />
                </Button>
            </div>

            {/* Content Preview */}
            <div className="p-4 bg-surface-elevated border-b border-border flex items-center gap-4">
                {sharedMediaBlob ? (
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
                        {sharedMediaBlob.type.startsWith('image') ? (
                            <img src={URL.createObjectURL(sharedMediaBlob)} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <FaImage className="text-2xl text-muted-foreground" />
                        )}
                    </div>
                ) : null}
                <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-medium truncate">{sharedData?.title || 'Shared Content'}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{sharedData?.text || sharedData?.url}</p>
                </div>
            </div>

            {/* Error Message */}
            {error && <div className="p-3 bg-red-500/10 text-red-500 text-sm text-center">{error}</div>}

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Chats</h2>
                {chats.map(chat => {
                    const isSelected = selectedChats.includes(chat.id);
                    return (
                        <div
                            key={chat.id}
                            onClick={() => toggleChat(chat.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-surface-elevated'}`}
                        >
                            <Avatar src={chat.photoURL} alt={chat.name} size="md" />
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-sm truncate">{chat.name}</h3>
                                <p className="text-xs text-muted-foreground truncate">{chat.lastMessage || 'No messages'}</p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Action Bar */}
            <div className="p-4 border-t border-border bg-surface flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                    {selectedChats.length} {selectedChats.length === 1 ? 'chat' : 'chats'} selected
                </span>
                <Button
                    onClick={handleSend}
                    disabled={selectedChats.length === 0 || sending}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white rounded-xl px-6"
                >
                    {sending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
                    <span>Send</span>
                </Button>
            </div>
        </div>
    );
};

export default SharePage;
