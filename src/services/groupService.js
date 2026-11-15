import { supabase } from "../supabase";

export const exitGroup = async (chatId, userId) => {
    try {
        await supabase
            .from('conversation_participants')
            .delete()
            .match({ conversation_id: chatId, user_id: userId });
    } catch (error) {
        console.error("[groupService] Failed to exit group:", error);
        throw error;
    }
};

export const removeGroupParticipant = async (chatId, adminId, targetId) => {
    try {
        await supabase
            .from('conversation_participants')
            .delete()
            .match({ conversation_id: chatId, user_id: targetId });
    } catch (error) {
        console.error("[groupService] Failed to remove participant:", error);
        throw error;
    }
};

export const promoteToAdmin = async (chatId, adminId, targetId) => {
    try {
        await supabase
            .from('conversation_participants')
            .update({ role: 'admin' })
            .match({ conversation_id: chatId, user_id: targetId });
    } catch (error) {
        console.error("[groupService] Failed to promote to admin:", error);
        throw error;
    }
};

export const dismissAdmin = async (chatId, adminId, targetId) => {
    try {
        await supabase
            .from('conversation_participants')
            .update({ role: 'member' })
            .match({ conversation_id: chatId, user_id: targetId });
    } catch (error) {
        console.error("[groupService] Failed to dismiss admin:", error);
        throw error;
    }
};
