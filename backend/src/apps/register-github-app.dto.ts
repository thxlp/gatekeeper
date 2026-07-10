import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AppConfigDto } from './app-config.dto';

export class RegisterGithubAppDto extends AppConfigDto {
  // "owner/repo" ที่เลือกมาจาก repo picker (GET /github/repos)
  @IsString()
  repoFullName: string;

  // ไม่ส่งมา = ใช้ default branch ของ repo ตามข้อมูลจาก GitHub API
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
  @IsString()
  projectName?: string;
}
