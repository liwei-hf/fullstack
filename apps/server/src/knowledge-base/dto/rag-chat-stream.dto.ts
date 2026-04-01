import { IsString, MaxLength } from 'class-validator';

// 问答请求 DTO，只允许传问题文本，长度上限用于限制极端长 prompt。
export class RagChatStreamDto {
  @IsString()
  @MaxLength(2000)
  question!: string;
}
