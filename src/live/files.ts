import {useEffect, useState} from 'react';
import {supabase} from '../lib/supabase';
import {LIVE} from './state';

// Files in the private bucket (CLAUDE.md, Storage): photos are compressed on the phone, the row that
// owns a file names its path first (the bucket's policy checks it), and nobody replaces a file: a
// new photo is a new file, and the row points at it.

const BUCKET = 'lyra';

/** A photo made smaller on the phone: JPEG, at most 1600px on its longer side. */
export async function compressPhoto(file: File): Promise<Blob> {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('photo')), 'image/jpeg', 0.8));
    } catch {
        return file;
    }
}

/** Uploads a file to a path its row already names. Null when it worked, the reason otherwise. */
export async function uploadFile(path: string, body: Blob, contentType = 'image/jpeg'): Promise<string | null> {
    const {error} = await supabase.storage.from(BUCKET).upload(path, body, {contentType, upsert: false});
    return error ? error.message : null;
}

const newJpg = (folder: string) => `${folder}/${crypto.randomUUID()}.jpg`;

/** A student's card photo at a school (the student, or their guardian). */
export async function saveCardPhoto(school: string, student: string, file: File): Promise<string | null> {
    const path = newJpg(`${school}/cards/${student}`);
    const {error} = await supabase.from('student_card').update({photo_path: path}).eq('school_id', school).eq('student_id', student);
    return error ? error.message : uploadFile(path, await compressPhoto(file));
}

/** A teacher's or director's own photo, one for all their schools. */
export async function saveStaffPhoto(file: File): Promise<string | null> {
    const path = newJpg(`staff/${LIVE.person}`);
    const {error} = await supabase.from('staff_card').upsert({person_id: LIVE.person, photo_path: path});
    return error ? error.message : uploadFile(path, await compressPhoto(file));
}

/** The path a guardian's family person's photo goes to, named in the row before the file is sent. */
export const familyPhotoPath = (school: string) => newJpg(`${school}/family/${LIVE.person}`);

// Signed links last an hour; each path is asked for once while the page is open.
const links = new Map<string, Promise<string>>();

export function fileUrl(path: string): Promise<string> {
    let link = links.get(path);
    if (!link) {
        link = supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({data}) => data?.signedUrl ?? '');
        links.set(path, link);
    }
    return link;
}

/** A private file's link for an <img>, once it's ready (empty until then, or without a path). */
export function useFileUrl(path: string | undefined): string {
    const [url, setUrl] = useState('');
    useEffect(() => {
        let alive = true;
        setUrl('');
        if (path && LIVE.on) void fileUrl(path).then(link => alive && setUrl(link));
        return () => {
            alive = false;
        };
    }, [path]);
    return url;
}
