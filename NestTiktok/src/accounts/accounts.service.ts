import { Injectable } from '@nestjs/common';
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

@Injectable()
export class AccountsService {
  constructor(
    private readonly tiktokService: TiktokService,
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,
  ) {}

  async create(
    createAccountDto: CreateAccountDto,
  ): Promise<AccountDocument | null> {
    const { authCode, appKey, appSecret } = createAccountDto;
    const commonParams: CommonParams = {
      appKey,
      appSecret,
      authCode,
      accessToken: '',
      refreshToken: '',
      sign: '',
      timestamp: 0,
      pageSize: 10,
      shopCipher: '',
      queryParams: {},
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
        accessToken: access_token,
      };

      const getShopCipher =
        await this.tiktokService.getShopCipher<ShopCipherResponse>(
          paramsGetCipher,
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
            cronExpression: '0 0 * * *', // Mặc định chạy lúc 0h hàng ngày
            isActive: true,
            description: '',
            lastRun: new Date(),
          },
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
          cronExpression: '0 0 * * *', // Mặc định chạy lúc 0h hàng ngày
          isActive: true,
          description: '',
          lastRun: new Date(),
        },
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
