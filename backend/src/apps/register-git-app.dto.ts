import { IsIn, IsOptional, IsString } from 'class-validator';

export class RegisterGitAppDto {
  @IsString()
  repoUrl: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['node', 'python', 'static', 'docker'])
  runtime?: string;
}
