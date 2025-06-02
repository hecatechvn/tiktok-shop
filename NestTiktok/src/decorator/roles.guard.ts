import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Request } from 'express';
import { User } from 'src/user/entities/user.entity';

interface RequestWithUser extends Request {
  user: User;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true; // không cần kiểm tra nếu route không yêu cầu role
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userRole = request.user?.role as string;
    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Bạn không có quyền truy cập.');
    }
    return true;
  }
}
