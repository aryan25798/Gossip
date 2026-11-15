import * as tus from 'tus-js-client';
import { supabase } from '../supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fijjtocoiaumfxzdjxbi.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpamp0b2NvaWF1bWZ4emRqeGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MjczMDgsImV4cCI6MjExMDMwMzMwOH0.YIbmTT6kSvmWn5XKx5lXRLWvN2IBpoLexii9pq7QpHE';

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (Supabase tier cap)
export const DEFAULT_CHUNK_SIZE = 6 * 1024 * 1024; // 6MB (Supabase optimal TUS chunk)

export const ALLOWED_MIME_TYPES = [
    // Images
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    // Videos
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    // Audio
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed'
];

export class UploadManager {
    constructor() {
        this.activeUploads = new Map(); // uploadId -> { uploadInstance, file, objectPath, bucket }
    }

    validateFile(file) {
        if (!file) throw new Error('No file provided for upload.');
        if (file.size > MAX_FILE_SIZE) {
            throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 50MB.`);
        }
        if (file.size === 0) {
            throw new Error('Zero-byte empty files cannot be uploaded.');
        }
        return true;
    }

    async uploadResumable({
        file,
        bucket = 'novachat-media',
        objectPath,
        onProgress = () => {},
        signal = null,
        uploadId = null
    }) {
        this.validateFile(file);

        const id = uploadId || `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const session = (await supabase.auth.getSession()).data.session;
        const authToken = session?.access_token || SUPABASE_ANON_KEY;

        return new Promise((resolve, reject) => {
            const upload = new tus.Upload(file, {
                endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
                retryDelays: [0, 1000, 3000, 5000, 10000],
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    authorization: `Bearer ${authToken}`,
                    'x-upsert': 'true',
                },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                metadata: {
                    bucketName: bucket,
                    objectName: objectPath,
                    contentType: file.type || 'application/octet-stream',
                    cacheControl: '3600',
                },
                chunkSize: DEFAULT_CHUNK_SIZE,
                onError: (error) => {
                    this.activeUploads.delete(id);
                    reject(error);
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100));
                    onProgress({
                        bytesUploaded,
                        bytesTotal,
                        percentage,
                        uploadId: id
                    });
                },
                onSuccess: () => {
                    this.activeUploads.delete(id);
                    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(objectPath);
                    resolve({
                        uploadId: id,
                        publicUrl,
                        path: objectPath,
                        bucket,
                        size: file.size,
                        mimeType: file.type || 'application/octet-stream',
                        fileName: file.name
                    });
                }
            });

            this.activeUploads.set(id, {
                upload,
                file,
                objectPath,
                bucket
            });

            if (signal) {
                signal.addEventListener('abort', () => {
                    upload.abort();
                    this.activeUploads.delete(id);
                    reject(new Error('Upload cancelled by user.'));
                });
            }

            // Resume existing chunks if available
            upload.findPreviousUploads().then((previousUploads) => {
                if (previousUploads.length > 0) {
                    upload.resumeFromPreviousUpload(previousUploads[0]);
                }
                upload.start();
            }).catch(() => {
                upload.start();
            });
        });
    }

    cancelUpload(uploadId) {
        const item = this.activeUploads.get(uploadId);
        if (item) {
            item.upload.abort();
            this.activeUploads.delete(uploadId);
            return true;
        }
        return false;
    }
}

export const uploadManager = new UploadManager();
