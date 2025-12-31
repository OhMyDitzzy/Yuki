/**
This uploader is for internal purposes only and is protected by an API Key, If you want to keep using this then ask Paxsenix (Alex) for the API Key.

Put your API Key in the environment variable with the format
name:
CDN_API_KEY

value:
your apikey
 */

import axios from 'axios';
import FormData from 'form-data';
import { fromBuffer } from 'file-type';

interface UploadResponse {
    url?: string;
    response?: string;
    ok: boolean;
}

interface ApiResponse {
    url: string;
}

export async function paxsenixUploader(
    imageBuffer: Buffer,
    filename: string
): Promise<UploadResponse> {
    try {
        const fileTypeResult = await fromBuffer(imageBuffer);
        
        if (!fileTypeResult) {
            return {
                response: 'Unable to determine file type',
                ok: false
            };
        }

        const { ext } = fileTypeResult;
        const form = new FormData();
        form.append('file', imageBuffer, `${filename}.${ext}`);
        form.append('expires', '60');

        const response = await axios.post<ApiResponse>(
            'https://cdn-0.paxsenix.org/upload',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'X-API-Key': process.env.CDN_API_KEY || ''
                }
            }
        );

        return {
            url: response.data.url,
            ok: response.status === 200
        };
    } catch (error) {
        console.error(error);
        return {
            response: error instanceof Error ? error.message : 'Unknown error',
            ok: false
        };
    }
}