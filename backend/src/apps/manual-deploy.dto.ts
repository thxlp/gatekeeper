import { IsIn, IsOptional, IsString } from 'class-validator';

export class ManualDeployDto {
  // ถ้าใส่มา = redeploy manual app เดิม (ต้องเป็นเจ้าของ + ต้องเป็น sourceType 'manual')
  // ถ้าไม่ใส่ = สร้าง manual app ใหม่ (runtime จำเป็นตอนนี้)
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsIn(['node', 'python', 'static', 'docker'])
  runtime?: string;
}
