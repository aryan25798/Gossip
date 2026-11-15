import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { uploadManager } from '../services/uploadManager';

const FileUploadContext = createContext();

export function useFileUpload() {
    return useContext(FileUploadContext);
}

export function FileUploadProvider({ children }) {
    const [uploads, setUploads] = useState({});

    const startUpload = useCallback(async (file, objectPath, options = {}) => {
        const uploadId = `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        setUploads(prev => ({
            ...prev,
            [uploadId]: {
                id: uploadId,
                fileName: file.name,
                fileSize: file.size,
                progress: 0,
                status: 'uploading',
                error: null
            }
        }));

        try {
            const result = await uploadManager.uploadResumable({
                file,
                objectPath,
                bucket: options.bucket || 'novachat-media',
                uploadId,
                onProgress: ({ percentage }) => {
                    setUploads(prev => {
                        if (!prev[uploadId]) return prev;
                        return {
                            ...prev,
                            [uploadId]: {
                                ...prev[uploadId],
                                progress: percentage,
                                status: percentage >= 100 ? 'completing' : 'uploading'
                            }
                        };
                    });
                    if (options.onProgress) options.onProgress(percentage);
                }
            });

            setUploads(prev => {
                const next = { ...prev };
                delete next[uploadId];
                return next;
            });

            return { uploadId, result };
        } catch (error) {
            setUploads(prev => ({
                ...prev,
                [uploadId]: {
                    ...prev[uploadId],
                    status: 'failed',
                    error: error.message
                }
            }));
            throw error;
        }
    }, []);

    const cancelUpload = useCallback((uploadId) => {
        const cancelled = uploadManager.cancelUpload(uploadId);
        if (cancelled) {
            setUploads(prev => {
                const next = { ...prev };
                delete next[uploadId];
                return next;
            });
        }
        return cancelled;
    }, []);

    const value = useMemo(() => ({
        uploads,
        startUpload,
        cancelUpload
    }), [uploads, startUpload, cancelUpload]);

    return (
        <FileUploadContext.Provider value={value}>
            {children}
        </FileUploadContext.Provider>
    );
}
