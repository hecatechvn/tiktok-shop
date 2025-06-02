import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from 'src/interface/common.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secret123',
      passReqToCallback: true,
    });
  }

  validate(request: any, payload: JwtPayload) {
    // Lấy token từ header request
    const extractToken = ExtractJwt.fromAuthHeaderAsBearerToken();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    return {
      userId: payload.sub,
      userName: payload.userName,
      role: payload.role,
    };
  }
}
