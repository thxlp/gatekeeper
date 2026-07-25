import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateManagedDbDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @IsIn(['postgres', 'redis', 'mysql'])
  engine: 'postgres' | 'redis' | 'mysql';
}

// attach/detach managed DB กับแอปหนึ่งตัว
export class AttachDbDto {
  @IsString()
  appId: string;
}
