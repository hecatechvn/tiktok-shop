import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
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

  @IsString()
  authCode: string;

  @IsString()
  appSecret: string;

  @IsString()
  appKey: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateShopCipherDto)
  shopCipher?: CreateShopCipherDto[];
}
