import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'path';
import mammoth from 'mammoth';
import {
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from './knowledge-base.constants';
import type { ParsedDocumentPayload } from './knowledge-base.types';

@Injectable()
export class KnowledgeBaseParserService {
  async parseDocument(file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<ParsedDocumentPayload> {
    const extension = extname(file.originalname).toLowerCase();
    if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension)) {
      throw new BadRequestException('仅支持 PDF、Markdown、TXT、DOCX 文件');
    }

    let content = '';
    if (extension === '.pdf') {
      const pdfModule = (await import('pdf-parse/dist/pdf-parse/esm/index.js')) as unknown as {
        PDFParse: new (options: { data: Uint8Array }) => {
          getText(): Promise<{ text: string }>;
          destroy(): Promise<void>;
        };
      };
      const { PDFParse } = pdfModule;
      const parser = new PDFParse({
        data: new Uint8Array(file.buffer),
      });
      const result = await parser.getText();
      content = result.text;
      await parser.destroy();
    } else if (extension === '.docx') {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content = result.value;
    } else {
      content = file.buffer.toString('utf-8');
    }

    const normalizedContent = this.normalizeContent(content);
    if (!normalizedContent) {
      throw new BadRequestException('文档内容为空，无法生成知识库索引');
    }

    return {
      fileType: extension.replace('.', '').toUpperCase(),
      content: normalizedContent,
    };
  }

  private normalizeContent(content: string) {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
