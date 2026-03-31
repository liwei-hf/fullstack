import { IsString, MaxLength } from 'class-validator';

export class RagChatStreamDto {
  @IsString()
  @MaxLength(2000)
  question!: string;
}
