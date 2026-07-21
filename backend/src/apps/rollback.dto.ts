import { IsString, Length } from 'class-validator';

export class RollbackDto {
  // id ของ release เป้าหมาย (= requestId ของ deploy รอบนั้น — ดูจาก releases ใน GET /apps/:id)
  @IsString()
  @Length(1, 64)
  releaseId: string;
}
