/**
 * Firebase Storage Service for BillHippo
 * Handles file uploads (business logos, generated images, etc.)
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

// Upload a business logo
export async function uploadLogo(userId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `users/${userId}/logo/${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// Upload a generated AI image
export async function uploadGeneratedImage(userId: string, blob: Blob, filename: string): Promise<string> {
  const storageRef = ref(storage, `users/${userId}/media/${filename}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// Delete a file from storage
export async function deleteFile(path: string) {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}
