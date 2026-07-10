import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AppConfigDto } from './app-config.dto';

export class RegisterGitAppDto extends AppConfigDto {
  @IsString()
  repoUrl: string;

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
}
