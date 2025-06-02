import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateShopCipherDto {
  @IsString()
  cipher: string;

  @IsString()
  code: string;

  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  region: string;

  @IsString()
  seller_type: string;
}

export class CreateAccountDto {
  @IsString()
  @IsOptional()
  accessToken?: string;

  @IsString()
  @IsOptional()
  refreshToken?: string;

  @IsNumber()
  @IsOptional()
  accessTokenExpireIn?: number;

  @IsNumber()
  @IsOptional()
  refreshTokenExpireIn?: number;

  @IsNotEmpty()
  @IsString()
  authCode: string;

  @IsNotEmpty()
  @IsString()
  appSecret: string;

  @IsNotEmpty()
  @IsString()
  appKey: string;

  @IsNotEmpty()
  @IsString()
  serviceId: string;

  @IsOptional()
  @IsString()
  sheets?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateShopCipherDto)
  shopCipher?: CreateShopCipherDto[];
}
