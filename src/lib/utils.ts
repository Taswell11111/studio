import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Constructs a Firebase Storage download URL from a gs:// path and an access token.
 * @param gsPath The full gs:// path (e.g., "gs://bucket-name/path/to/file.csv").
 * @param token The Firebase Storage access token.
 * @returns The full HTTPS download URL or null if the path is invalid.
 */
export function getFirebaseStorageUrl(gsPath: string, token: string): string | null {
  if (!gsPath.startsWith('gs://')) {
    return null;
  }
  
  const pathWithoutPrefix = gsPath.substring(5);
  const firstSlashIndex = pathWithoutPrefix.indexOf('/');
  
  if (firstSlashIndex === -1) {
    return null;
  }
  
  const bucket = pathWithoutPrefix.substring(0, firstSlashIndex);
  const filePath = pathWithoutPrefix.substring(firstSlashIndex + 1);
  const encodedFilePath = encodeURIComponent(filePath);
  
  // The bucket name in the URL should not contain ".appspot.com" or ".firebasestorage.app"
  const urlBucket = bucket.replace('.appspot.com', '').replace('.firebasestorage.app', '');
  
  return `https://firebasestorage.googleapis.com/v0/b/${urlBucket}.appspot.com/o/${encodedFilePath}?alt=media&token=${token}`;
}
