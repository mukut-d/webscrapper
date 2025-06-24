import { JwtService } from '@nestjs/jwt';

export class UserToken {
  constructor(private readonly jwtService: JwtService) {}

  async getUserId(req: any) {
    const token = await req.headers.authorization.split(' ')[1];
    const decoded = await this.jwtService.decode(token);
    return decoded['id'];
  }

  async getUserRole(req: any) {
    const token = await req.headers.authorization.split(' ')[1];
    const decoded = await this.jwtService.decode(token);
    return decoded['role'];
  }
}
