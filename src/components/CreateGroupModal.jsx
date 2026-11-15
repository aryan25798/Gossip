import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../contexts/AuthContext";
import { useFriend } from "../contexts/FriendContext";
import { chatService } from "../services/chatService";
import { FaTimes, FaCheck, FaSearch, FaUsers } from "react-icons/fa";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Input } from "./ui/Input";

export default function CreateGroupModal({ onClose }) {
    const [groupName, setGroupName] = useState("");
    const [friendList, setFriendList] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { currentUser } = useAuth();
    const { friends } = useFriend();

    useEffect(() => {
        const fetchFriendsData = async () => {
            const currentId = currentUser?.uid || currentUser?.id;
            try {
                let query = supabase.from('users').select('id, display_name, email, avatar_url').neq('id', currentId).limit(50);
                if (friends && friends.length > 0) {
                    query = supabase.from('users').select('id, display_name, email, avatar_url').in('id', friends);
                }
                const { data, error } = await query;
                if (data && !error) {
                    setFriendList(data.map(u => ({
                        id: u.id,
                        uid: u.id,
                        displayName: u.display_name || u.email,
                        photoURL: u.avatar_url
                    })));
                }
            } catch (error) {
                console.error("Error fetching friends for group:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFriendsData();
    }, [friends, currentUser]);

    const handleSelectUser = (uid) => {
        if (selectedUsers.includes(uid)) {
            setSelectedUsers(selectedUsers.filter(id => id !== uid));
        } else {
            setSelectedUsers([...selectedUsers, uid]);
        }
    };

    const createGroup = async () => {
        if (!groupName || selectedUsers.length === 0) return;
        const currentUserId = currentUser.uid || currentUser.id;

        try {
            await chatService.createGroupChat(groupName, selectedUsers, currentUserId);
            onClose();
        } catch (error) {
            console.error("Error creating group:", error);
        }
    };

    const filteredFriends = friendList.filter(friend =>
        friend.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-surface-elevated">
                    <div className="flex items-center gap-2">
                        <FaUsers className="text-primary text-xl" />
                        <h2 className="text-lg font-semibold text-text-1">Create Group</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="text-text-2 hover:text-text-1 rounded-full">
                        <FaTimes />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-4 flex flex-col gap-4 overflow-y-auto">
                    {/* Group Name Input */}
                    <div>
                        <label className="text-xs font-semibold text-text-2 uppercase tracking-wider block mb-2">Group Subject</label>
                        <Input
                            placeholder="Type group subject here..."
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="w-full"
                            maxLength={50}
                        />
                    </div>

                    {/* Selected Users Chips */}
                    {selectedUsers.length > 0 && (
                        <div>
                            <label className="text-xs font-semibold text-text-2 uppercase tracking-wider block mb-2">
                                Selected ({selectedUsers.length})
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {selectedUsers.map(uid => {
                                    const user = friendList.find(f => f.id === uid);
                                    return (
                                        <div key={uid} className="flex items-center gap-1 bg-surface-elevated border border-border text-xs px-2 py-1 rounded-full text-text-1">
                                            <Avatar src={user?.photoURL} alt={user?.displayName} size="xs" />
                                            <span className="truncate max-w-[100px]">{user?.displayName}</span>
                                            <button onClick={() => handleSelectUser(uid)} className="hover:text-red-500 ml-1">
                                                <FaTimes size={10} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Friends Search */}
                    <div>
                        <label className="text-xs font-semibold text-text-2 uppercase tracking-wider block mb-2">Add Participants</label>
                        <div className="relative mb-2">
                            <FaSearch className="absolute left-3 top-3 text-text-2 text-sm" />
                            <Input
                                placeholder="Search contacts..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 w-full"
                            />
                        </div>

                        {/* List */}
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar border border-border rounded-xl p-1 bg-background">
                            {loading ? (
                                <div className="text-center py-6 text-text-2 text-sm">
                                    Loading contacts...
                                </div>
                            ) : filteredFriends.length === 0 ? (
                                <div className="text-center py-6 text-text-2 text-sm">
                                    No contacts found
                                </div>
                            ) : (
                                filteredFriends.map(friend => {
                                    const isSelected = selectedUsers.includes(friend.id);
                                    return (
                                        <div
                                            key={friend.id}
                                            onClick={() => handleSelectUser(friend.id)}
                                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-surface-elevated'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar src={friend.photoURL} alt={friend.displayName} size="sm" />
                                                <span className="text-sm font-medium text-text-1">{friend.displayName}</span>
                                            </div>
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                                {isSelected && <FaCheck size={10} />}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-surface-elevated flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={createGroup}
                        disabled={!groupName.trim() || selectedUsers.length === 0}
                        className="bg-primary hover:bg-primary/90 text-white"
                    >
                        Create Group
                    </Button>
                </div>
            </div>
        </div>
    );
}
