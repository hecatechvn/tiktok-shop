import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './entities/user.entity';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/enum';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(createUserDto: CreateUserDto) {
    const { password, ...userData } = createUserDto;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new this.userModel({
      ...userData,
      password: hashedPassword,
    });
    return user.save();
  }

  async findAll() {
    return this.userModel.find();
  }

  async findOne(id: string) {
    return this.userModel.findById(id);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    return this.userModel.findByIdAndUpdate(id, updateUserDto);
  }

  async remove(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }

  async findOneByUserName(userName: string) {
    return this.userModel.findOne({ userName }).select('+password');
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmPassword } = changePasswordDto;

    // Kiểm tra mật khẩu mới và xác nhận mật khẩu có khớp nhau không
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'Mật khẩu mới và xác nhận mật khẩu không khớp',
      );
    }

    // Tìm user theo ID và lấy cả password
    const user = await this.userModel.findById(userId).select('+password');
    if (!user) {
      throw new BadRequestException('Không tìm thấy người dùng');
    }

    // Kiểm tra mật khẩu hiện tại có đúng không
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    // Mã hóa mật khẩu mới
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Cập nhật mật khẩu mới
    user.password = hashedNewPassword;
    await user.save();

    return {
      success: true,
      message: 'Đổi mật khẩu thành công',
    };
  }

  async ensureAdminExists() {
    const adminExists = await this.userModel.findOne({ role: Role.ADMIN });

    if (!adminExists) {
      const adminPassword = 'admin123';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      const adminUser = new this.userModel({
        name: 'Admin',
        userName: 'admin',
        password: hashedPassword,
        role: Role.ADMIN,
      });

      await adminUser.save();
      console.log(
        'Admin account created with username: admin, password: admin123',
      );
    } else {
      console.log('Admin account already exists');
    }
  }
}
