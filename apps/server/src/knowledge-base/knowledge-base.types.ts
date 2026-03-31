import type { Response } from 'express';

export interface AuthenticatedRequestUser {
  sub: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  sessionId?: string;
}

export interface ParsedDocumentPayload {
  fileType: string;
  content: string;
}

export interface RetrievalCandidate {
  chunkId: string;
  documentId: string;
  documentName: string;
  sequence: number;
  content: string;
  excerpt: string;
  score: number;
}

export interface RagStreamContext {
  knowledgeBaseId: string;
  question: string;
  user: AuthenticatedRequestUser;
  res: Response;
}
