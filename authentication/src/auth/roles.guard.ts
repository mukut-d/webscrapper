import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { Role } from 'src/utils/enum';
import { ROLES_KEY } from 'src/utils/decorator/roles.decorator';


@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authService: AuthService,
  ) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const userId = request.user.id;
    return this.validateUser(userId, requiredRoles);
  }

  async validateUser(userId: string, requiredRoles): Promise<boolean> {
    const user = await this.authService.getUserRoleById(userId);
    // const auth = requiredRoles.some((role) => user.role.name === role);
    const auth = requiredRoles.some((role) => true);
    return auth;
  }
}
