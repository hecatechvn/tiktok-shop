import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from 'src/interface/common.interface';

interface UserPayload {
  userId: string;
  userName: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { userName, password } = loginDto;
    const user = await this.userService.findOneByUserName(userName);
    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không hợp lệ');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Thông tin đăng nhập không hợp lệ');
    }

    const payload: JwtPayload = {
      sub: user._id.toString(),
      userName: user.userName,
      role: user.role,
    };

    // Tạo cả access token và refresh token
    const [access_token, refresh_token] = await Promise.all([
      this.generateAccessToken(payload),
      this.generateRefreshToken(payload),
    ]);

    return {
      access_token,
      refresh_token,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      // Xác thực refresh token
      const payload =
        await this.jwtService.verifyAsync<JwtPayload>(refreshToken);

      // Kiểm tra xem người dùng còn tồn tại không
      const user = await this.userService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Người dùng không còn tồn tại');
      }

      // Tạo token mới
      const tokenPayload: JwtPayload = {
        sub: user._id.toString(),
        userName: user.userName,
        role: user.role,
      };

      const [access_token, new_refresh_token] = await Promise.all([
        this.generateAccessToken(tokenPayload),
        this.generateRefreshToken(tokenPayload),
      ]);

      return {
        access_token,
        refresh_token: new_refresh_token,
      };
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  private async generateAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m', // Thời gian ngắn hơn cho access token
    });
  }

  private async generateRefreshToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d', // Thời gian dài hơn cho refresh token
    });
  }

  getProfile(user: UserPayload) {
    return {
      _id: user.userId,
      userName: user.userName,
      name: user.userName, // Sử dụng userName làm name nếu không có trường name
      role: user.role,
    };
  }
}
