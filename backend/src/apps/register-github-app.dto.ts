import { IsIn, IsOptional, IsString } from 'class-validator';

export class RegisterGithubAppDto {
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

  @IsOptional()
  @IsString()
  projectName?: string;
}
