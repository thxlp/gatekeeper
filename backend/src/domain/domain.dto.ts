import { IsString, MaxLength } from 'class-validator';

export class AddDomainDto {
  @IsString()
  @MaxLength(253)
  domain: string;
}
