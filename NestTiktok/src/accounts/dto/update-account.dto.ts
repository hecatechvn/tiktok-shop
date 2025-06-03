import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { CreateAccountDto } from './create-account.dto';

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @IsOptional()
  @IsString()
  authCode?: string;

  @IsOptional()
  @IsString()
  appKey?: string;

  @IsOptional()
  @IsString()
  appSecret?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  sheetId?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
