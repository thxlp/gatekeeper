import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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

  // port ที่แอป listen (ไม่ระบุ = เดาจาก EXPOSE/runtime default) — multipart form ส่งเป็น string
  // จึง @Type(() => Number) แปลงเป็น number ก่อน validate
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  // config เพิ่มเติม (env/addons/resources/spa) เป็น JSON string เพราะ multipart ส่ง object/array
  // ตรงๆ ไม่ได้ — service parse + validate เป็น AppConfigDto อีกที (ดู deployManual)
  @IsOptional()
  @IsString()
  config?: string;
}
