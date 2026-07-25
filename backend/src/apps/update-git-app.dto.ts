import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AppConfigDto } from './app-config.dto';

export class UpdateGitAppDto extends AppConfigDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['node', 'python', 'static', 'docker'])
  runtime?: string;

  // port ที่แอป listen (ไม่ระบุ = เดาจาก EXPOSE/runtime default)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // เปิด/ปิด auto-deploy ตอน push เข้า branch ที่เฝ้า
  @IsOptional()
  @IsBoolean()
  autoDeploy?: boolean;
}
