import { forwardRef, Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AccountsModule } from 'src/accounts/accounts.module';
import { TiktokModule } from 'src/tiktok/tiktok.module';
import { GoogleSheetsModule } from 'src/google-sheets/google-sheets.module';

@Module({
  imports: [forwardRef(() => AccountsModule), TiktokModule, GoogleSheetsModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
