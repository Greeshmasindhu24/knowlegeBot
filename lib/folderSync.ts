import fs from 'fs/promises';
import path from 'path';
import { createAdminClient } from './supabase-server';
import { ingestDocumentBuffer } from './ingestion';
import { persistDocument } from './documentPersistence';
import { isFileTooLarge } from './uploadConstants';
import { isSupportedUploadExtension } from './supportedFileTypes';

const FOLDER_SYNC_SOURCE = 'folder_sync';

export function getDocumentsFolderPath(): string {
  return path.join(process.cwd(), 'documents');
}

interface FolderSyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  skipped: string[];
  errors: { file: string; error: string }[];
}

async function listSyncableFiles(folderPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      if (!isSupportedUploadExtension(ext)) continue;
      files.push(entry.name);
    }

    return files;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      await fs.mkdir(folderPath, { recursive: true });
      return [];
    }
    throw error;
  }
}

export async function syncDocumentsFolder(
  userId: string,
  department: string
): Promise<FolderSyncResult> {
  const folderPath = getDocumentsFolderPath();
  const result: FolderSyncResult = {
    added: [],
    updated: [],
    removed: [],
    skipped: [],
    errors: [],
  };

  const diskFiles = await listSyncableFiles(folderPath);
  const supabaseAdmin = createAdminClient();

  const { data: existingDocs, error: fetchError } = await supabaseAdmin
    .from('documents')
    .select('id, name, source_url, file_path, source_updated_at')
    .eq('source_system', FOLDER_SYNC_SOURCE);

  if (fetchError) {
    throw new Error(`Failed to load folder-sync documents: ${fetchError.message}`);
  }

  const docBySourceUrl = new Map(
    (existingDocs || []).map((doc) => [doc.source_url || doc.name, doc])
  );

  for (const filename of diskFiles) {
    const relativePath = `documents/${filename}`;
    const fullPath = path.join(folderPath, filename);
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    try {
      const stat = await fs.stat(fullPath);
      if (isFileTooLarge(stat.size)) {
        result.skipped.push(filename);
        continue;
      }

      const buffer = Buffer.from(await fs.readFile(fullPath));
      const existing = docBySourceUrl.get(relativePath);

      if (!existing) {
        const persisted = await persistDocument({
          buffer,
          filename,
          fileSize: stat.size,
          extension: ext,
          userId,
          department,
          sourceSystem: FOLDER_SYNC_SOURCE,
          sourceUrl: relativePath,
        });
        result.added.push(`${filename} (${persisted.chunkCount} chunks)`);
        continue;
      }

      const lastIndexed = existing.source_updated_at
        ? new Date(existing.source_updated_at).getTime()
        : 0;
      const fileModified = stat.mtimeMs;

      if (fileModified <= lastIndexed) {
        result.skipped.push(filename);
        continue;
      }

      const chunkCount = await ingestDocumentBuffer(existing.id, buffer, ext);
      await supabaseAdmin
        .from('documents')
        .update({
          file_size: stat.size,
          source_updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      result.updated.push(`${filename} (${chunkCount} chunks)`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ file: filename, error: message });
    }
  }

  const diskSet = new Set(diskFiles.map((f) => `documents/${f}`));

  for (const doc of existingDocs || []) {
    const key = doc.source_url || doc.name;
    if (diskSet.has(key)) continue;

    try {
      await supabaseAdmin.storage.from('documents').remove([doc.file_path]);
      await supabaseAdmin.from('documents').delete().eq('id', doc.id);
      result.removed.push(doc.name);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ file: doc.name, error: message });
    }
  }

  return result;
}
