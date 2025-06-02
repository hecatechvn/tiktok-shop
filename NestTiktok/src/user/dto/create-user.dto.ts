import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from 'src/enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'The name of the user', example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'The username for login', example: 'johndoe123' })
  @IsString()
  userName: string;

  @ApiProperty({ description: 'The user password', example: 'password123' })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'The role of the user',
    enum: Role,
    example: Role.USER,
    default: Role.USER,
  })
  @IsEnum(Role)
  @IsOptional()
  role: Role;
}
