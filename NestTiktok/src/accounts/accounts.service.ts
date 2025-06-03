import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { TiktokService } from 'src/tiktok/tiktok.service';
import { Account, Task, AccountDocument } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { Model } from 'mongoose';
import {
  CommonParams,
  RefreshTokenResponse,
  ShopCipherResponse,
} from 'src/types';
import { InjectModel } from '@nestjs/mongoose';
import { UpdateAccountDto } from './dto/update-account.dto';
import { GoogleSheetsService } from 'src/google-sheets/google-sheets.service';
import { TasksService } from 'src/tasks/tasks.service';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class AccountsService {
  constructor(
    private readonly tiktokService: TiktokService,
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,
    private readonly googleSheetsService: GoogleSheetsService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    createAccountDto: CreateAccountDto,
  ): Promise<AccountDocument | null> {
    const { authCode, appKey, appSecret } = createAccountDto;
    const commonParams: CommonParams = {
      app_key: appKey,
      app_secret: appSecret,
      auth_code: authCode,
      access_token: '',
      refresh_token: '',
      sign: '',
      timestamp: 0,
      page_size: 10,
      shop_cipher: '',
      query_params: {},
    };

    const getAccessToken =
      await this.tiktokService.getAccessToken<RefreshTokenResponse>(
        commonParams,
      );
    if (getAccessToken.code === 0) {
      const {
        access_token,
        refresh_token,
        access_token_expire_in,
        refresh_token_expire_in,
      } = getAccessToken.data;

      const paramsGetCipher: CommonParams = {
        ...commonParams,
        access_token: access_token,
      };

      const getShopCipher =
        await this.tiktokService.getShopCipher<ShopCipherResponse>(
          paramsGetCipher,
        );

      // Tạo Google Sheet và chia sẻ với email người dùng nếu có
      const userEmail =
        this.configService.get<string>('DEFAULT_SHARE_EMAIL') ||
        'nguyendinhtu110202@gmail.com';
      const sheetId = await this.googleSheetsService.createSheet(
        `Báo cáo tài khoản ${createAccountDto.shopName}`,
        userEmail,
      );

      if (getShopCipher.code === 0) {
        const { shops } = getShopCipher.data;
        const account = new this.accountModel({
          ...createAccountDto,
          accessToken: access_token,
          refreshToken: refresh_token,
          accessTokenExpireIn: access_token_expire_in,
          refreshTokenExpireIn: refresh_token_expire_in,
          shopCipher: shops,
          status: true,
          task: {
            cronExpression: '0 6 * * *', // Mặc định chạy lúc 6h hàng ngày
            isActive: true,
            description: '',
            lastRun: new Date(),
          },
          sheetId,
        });
        return account.save();
      }

      const account = new this.accountModel({
        ...createAccountDto,
        accessToken: access_token,
        refreshToken: refresh_token,
        accessTokenExpireIn: access_token_expire_in,
        refreshTokenExpireIn: refresh_token_expire_in,
        status: true,
        task: {
          cronExpression: '0 6 * * *', // Mặc định chạy lúc 6h hàng ngày
          isActive: true,
          description: '',
          lastRun: new Date(),
        },
        sheetId,
      });
      return account.save();
    }
    return null;
  }

  async findAll() {
    const accounts = await this.accountModel.find();
    return accounts;
  }

  async findOne(id: string) {
    const account = await this.accountModel.findById(id);
    return account;
  }

  async update(id: string, updateAccountDto: UpdateAccountDto) {
    const account = await this.accountModel.findByIdAndUpdate(
      id,
      updateAccountDto,
      { new: true },
    );
    return account;
  }

  async remove(id: string) {
    // Xóa cronjob trước khi xóa tài khoản
    try {
      // Gọi phương thức xóa task từ TasksService
      this.tasksService.deleteAccountJob(id);
    } catch (error) {
      console.error(`Lỗi khi xóa cronjob cho tài khoản ${id}:`, error);
    }

    // Xóa tài khoản từ database
    const account = await this.accountModel.findByIdAndDelete(id);
    return account;
  }

  // Phương thức quản lý task
  async getAccountTask(accountId: string) {
    const account = await this.accountModel.findById(accountId);
    if (!account) {
      throw new Error('Không tìm thấy tài khoản');
    }
    return account.task;
  }

  async updateTask(accountId: string, taskData: Partial<Task>) {
    const account = await this.accountModel.findById(accountId);
    if (!account) {
      throw new Error('Không tìm thấy tài khoản');
    }

    // Đảm bảo account.task tồn tại
    if (!account.task) {
      account.task = {
        cronExpression: '0 0 * * *',
        lastRun: new Date(),
        isActive: false,
      };
    }

    // Cập nhật thông tin task một cách an toàn
    if (taskData.cronExpression !== undefined) {
      account.task.cronExpression = taskData.cronExpression;
    }

    if (taskData.lastRun !== undefined) {
      account.task.lastRun = taskData.lastRun;
    }

    if (taskData.isActive !== undefined) {
      account.task.isActive = taskData.isActive;
    }

    // Đánh dấu trường task đã được sửa đổi để Mongoose cập nhật
    account.markModified('task');

    return account.save();
  }

  async updateTaskLastRun(accountId: string) {
    const account = await this.accountModel.findById(accountId);
    if (!account) {
      return;
    }

    account.task.lastRun = new Date();

    // Đánh dấu trường task đã được sửa đổi để Mongoose cập nhật
    account.markModified('task');

    return account.save();
  }
}
