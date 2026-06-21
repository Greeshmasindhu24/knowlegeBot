import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import mammoth from 'mammoth';

export interface ExtractedChunk {
  content: string;
  metadata: {
    pageNumber?: number;
    chunkIndex: number;
  };
}

/**
 * Extracts text from a file buffer and chunks it, appending metadata.
 */
export async function processDocument(
  buffer: Buffer,
  fileType: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Promise<ExtractedChunk[]> {
  const type = fileType.toLowerCase();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });

  const chunks: ExtractedChunk[] = [];
  let chunkIndexCounter = 0;

  if (type === 'pdf') {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pdf = require('pdf-parse');
    const data = await pdf(buffer);
    const rawText = data.text || '';
    // pdf-parse places Form Feed (\f) between pages.
    // We split by \f to extract text page-by-page.
    const pages = rawText.split('\f');

    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i].trim();
      if (!pageText) continue;

      const pageDocs = await splitter.createDocuments([pageText]);
      for (const doc of pageDocs) {
        chunks.push({
          content: doc.pageContent,
          metadata: {
            pageNumber: i + 1, // 1-based page number
            chunkIndex: chunkIndexCounter++,
          },
        });
      }
    }
  } else if (type === 'docx') {
    const data = await mammoth.extractRawText({ buffer });
    const rawText = data.value || '';
    const docs = await splitter.createDocuments([rawText]);

    for (const doc of docs) {
      chunks.push({
        content: doc.pageContent,
        metadata: {
          chunkIndex: chunkIndexCounter++,
        },
      });
    }
  } else if (type === 'txt' || type === 'text' || type === 'md' || type === 'markdown') {
    const rawText = buffer.toString('utf-8');
    const docs = await splitter.createDocuments([rawText]);

    for (const doc of docs) {
      chunks.push({
        content: doc.pageContent,
        metadata: {
          chunkIndex: chunkIndexCounter++,
        },
      });
    }
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }

  return chunks;
}
