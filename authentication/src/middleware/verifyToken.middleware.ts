import {
  HttpStatus,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response, NextFunction } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "src/users/entities/user.entity";

@Injectable()
export class VerifyTokenMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly jwtService: JwtService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader: string | string[] | undefined | null =
      req?.headers?.authorization ?? req?.headers?.Authorization;

    if (!authHeader) {
      throw new UnauthorizedException({
        status: HttpStatus.UNAUTHORIZED,
        message: "Unauthorized User without header",
      });
    }

    let tokenName: string;
    let token: string;

    if (typeof authHeader === "string") {
      [tokenName, token] = authHeader.split(" ");
    } else if (Array.isArray(authHeader)) {
      [tokenName, token] = authHeader[0].split(" ");
    } else {
      throw new UnauthorizedException({
        status: HttpStatus.UNAUTHORIZED,
        message: "Invalid Token Format.",
      });
    }

    if (tokenName !== process.env.TOKEN_NAME) {
      throw new UnauthorizedException({
        status: HttpStatus.UNAUTHORIZED,
        message: "Invalid Token Format.",
      });
    }

    if (!token) {
      throw new UnauthorizedException({
        status: HttpStatus.UNAUTHORIZED,
        message: "Unauthorized User without token",
      });
    }

    try {
      const decoded = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'secret',
      });
      const { id } = decoded;
      const user = await this.usersRepository.findOne({where : {id}});
      if (!user) {
        throw new UnauthorizedException({
          status: HttpStatus.UNAUTHORIZED,
          message: "Unauthorized User without user",
        });
      }
      req.user = decoded;
      next();
    } catch (error) {
      console.log(error);
      if (error.name === "TokenExpiredError") {
        throw new UnauthorizedException({
          status: HttpStatus.UNAUTHORIZED,
          message: "Token has been expired",
        });
      }
      throw new UnauthorizedException({
        status: HttpStatus.UNAUTHORIZED,
        message: "Invalid Token",
      });
    }
  }
}
