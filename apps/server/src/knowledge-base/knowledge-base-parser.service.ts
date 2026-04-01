import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import {
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from './knowledge-base.constants';
import type { ParsedDocumentPayload } from './knowledge-base.types';

/**
 * 文档解析服务
 *
 * 只负责把不同类型的文件转成“统一纯文本”，不关心后续怎么切片、怎么检索。
 */
@Injectable()
export class KnowledgeBaseParserService {
  /**
   * 把上传的文件解析成纯文本
   *
   * 当前版本按文件类型分别处理：
   * - PDF: pdf-parse
   * - DOCX: mammoth
   * - TXT/Markdown: 直接按 utf-8 读取
   */
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
      const result = await pdfParse(file.buffer);
      content = result.text;
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

  // 清洗掉空字符和过多空行，避免后续切片阶段产生大量低质量 chunk。
  private normalizeContent(content: string) {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
