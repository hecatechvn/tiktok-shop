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
import { Logger } from '@nestjs/common';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

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
        'automation@hecatech.vn';
      const sheetId = await this.googleSheetsService.createSheet(
        `Báo cáo tài khoản ${createAccountDto.shopName}`,
        userEmail,
      );

      // Chia sẻ Google Sheet với tất cả các email trong danh sách sheetEmails nếu có
      if (
        sheetId &&
        createAccountDto.sheetEmails &&
        createAccountDto.sheetEmails.length > 0
      ) {
        await this.updateSheetSharing(sheetId, createAccountDto.sheetEmails);
      }

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
          sheetEmails: createAccountDto.sheetEmails || [],
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
        sheetEmails: createAccountDto.sheetEmails || [],
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
    // Kiểm tra nếu có cập nhật danh sách email
    if (updateAccountDto.sheetEmails) {
      const account = await this.accountModel.findById(id);
      if (account && account.sheetId) {
        // Lấy danh sách email hiện tại từ account
        const currentEmails = account.sheetEmails || [];

        // Cập nhật quyền truy cập cho các email
        await this.updateSheetSharing(
          account.sheetId,
          updateAccountDto.sheetEmails,
          currentEmails,
        );
      }
    }

    const updatedAccount = await this.accountModel.findByIdAndUpdate(
      id,
      updateAccountDto,
      { new: true },
    );
    return updatedAccount;
  }

  /**
   * Cập nhật việc chia sẻ Google Sheet với danh sách email mới
   * @param sheetId - ID của Google Sheet
   * @param newEmails - Danh sách email mới cần chia sẻ
   * @param currentEmails - Danh sách email hiện tại đang được chia sẻ
   */
  async updateSheetSharing(
    sheetId: string,
    newEmails: string[],
    currentEmails: string[] = [],
  ): Promise<void> {
    try {
      // Tìm các email đã bị xóa (có trong danh sách cũ nhưng không có trong danh sách mới)
      const removedEmails = currentEmails.filter(
        (email) => !newEmails.includes(email),
      );

      // Thu hồi quyền truy cập cho các email đã bị xóa
      for (const email of removedEmails) {
        try {
          await this.googleSheetsService.revokeAccess(sheetId, email);
          this.logger.log(
            `Đã thu hồi quyền truy cập sheet ${sheetId} từ email ${email}`,
          );
        } catch (revokeError) {
          this.logger.error(
            `Lỗi khi thu hồi quyền truy cập sheet ${sheetId} từ email ${email}:`,
            revokeError instanceof Error
              ? revokeError.message
              : String(revokeError),
          );
          // Tiếp tục với email tiếp theo ngay cả khi có lỗi
        }
      }

      // Chia sẻ Google Sheet với từng email mới trong danh sách
      for (const email of newEmails) {
        try {
          // Chỉ cấp quyền cho các email mới (không có trong danh sách cũ)
          if (!currentEmails.includes(email)) {
            await this.googleSheetsService.shareSheet(sheetId, email, 'writer');
            this.logger.log(`Đã chia sẻ sheet ${sheetId} với email ${email}`);
          }
        } catch (shareError) {
          this.logger.error(
            `Lỗi khi chia sẻ sheet ${sheetId} với email ${email}:`,
            shareError instanceof Error
              ? shareError.message
              : String(shareError),
          );
          // Tiếp tục với email tiếp theo ngay cả khi có lỗi
        }
      }

      this.logger.log(
        `Đã cập nhật chia sẻ sheet ${sheetId}: thêm ${newEmails.length - currentEmails.length} email mới, thu hồi ${removedEmails.length} email`,
      );
    } catch (error) {
      this.logger.error(
        `Lỗi khi cập nhật chia sẻ sheet ${sheetId}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async remove(id: string) {
    // Tìm tài khoản trước khi xóa
    const account = await this.accountModel.findById(id);
    if (!account) {
      return null;
    }

    // Nếu có sheet ID và danh sách email, thu hồi quyền truy cập
    if (
      account.sheetId &&
      account.sheetEmails &&
      account.sheetEmails.length > 0
    ) {
      try {
        // Thu hồi quyền truy cập cho tất cả email
        for (const email of account.sheetEmails) {
          try {
            await this.googleSheetsService.revokeAccess(account.sheetId, email);
            this.logger.log(
              `Đã thu hồi quyền truy cập sheet ${account.sheetId} từ email ${email}`,
            );
          } catch (revokeError) {
            this.logger.error(
              `Lỗi khi thu hồi quyền truy cập sheet ${account.sheetId} từ email ${email}:`,
              revokeError instanceof Error
                ? revokeError.message
                : String(revokeError),
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Lỗi khi thu hồi quyền truy cập sheet ${account.sheetId}:`,
          error instanceof Error ? error.message : String(error),
        );
        // Tiếp tục xóa tài khoản ngay cả khi có lỗi thu hồi quyền
      }
    }

    // Xóa cronjob trước khi xóa tài khoản
    try {
      // Gọi phương thức xóa task từ TasksService
      this.tasksService.deleteAccountJob(id);
    } catch (error) {
      this.logger.error(
        `Lỗi khi xóa cronjob cho tài khoản ${id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // Xóa tài khoản từ database
    return this.accountModel.findByIdAndDelete(id);
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
