import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTaskDto {
  @ApiProperty({
    description:
      'Biểu thức cron cho task (ví dụ: 0 6 * * * cho 6h sáng hàng ngày)',
    example: '0 6 * * *',
  })
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiProperty({
    description: 'Thời gian chạy gần nhất',
    example: new Date(),
  })
  @IsOptional()
  lastRun?: Date;

  @ApiProperty({
    description: 'Trạng thái hoạt động của task',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
