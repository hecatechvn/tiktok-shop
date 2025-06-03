import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/decorator/roles.guard';
import { Roles } from 'src/decorator/roles.decorator';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from 'src/tasks/tasks.service';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  async create(@Body() createAccountDto: CreateAccountDto) {
    const result = await this.accountsService.create(createAccountDto);

    // Nếu tài khoản được tạo thành công và có ID, đăng ký cronjob ngay lập tức
    if (result && result._id) {
      await this.tasksService.registerAccountJob(result._id as string);
    }

    return result;
  }

  @Get()
  findAll() {
    return this.accountsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAccountDto: UpdateAccountDto) {
    return this.accountsService.update(id, updateAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accountsService.remove(id);
  }

  // Endpoints quản lý task
  @Get(':id/task')
  getTask(@Param('id') id: string) {
    return this.accountsService.getAccountTask(id);
  }

  @Patch(':id/task')
  async updateTask(@Param('id') id: string, @Body() task: UpdateTaskDto) {
    const result = await this.accountsService.updateTask(id, task);

    // Cập nhật cronjob sau khi task được cập nhật
    if (result) {
      await this.tasksService.registerAccountJob(id);
    }

    return result;
  }

  @Patch(':id/task/run')
  async updateTaskLastRun(
    @Param('id') id: string,
    @Body() body: { isAllMonth: boolean },
  ) {
    const result = await this.accountsService.updateTaskLastRun(id);
    if (result && body.isAllMonth) {
      await this.tasksService.runWriteSheetAllMonth(result);
    } else if (result && !body.isAllMonth) {
      await this.tasksService.runWriteSheetCurrentMonthAndUpdatePreviousMonth(
        result,
      );
    }
    return result;
  }
}
