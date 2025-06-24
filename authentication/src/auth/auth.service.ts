import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/create-auth.dto';
import { randomBytes } from 'crypto';
import { User } from 'src/users/entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(private readonly userService: UsersService) { }

  async login(loginDto: LoginDto) {
    return this.userService.login(loginDto);
  }

  async activateAndLoginUser(email:any, password:any): Promise<any> {
    // Attempt to log in the user
    const user = await this.userService.login({ email, password });
    if (!user) {
      throw new Error('Failed to log in user');
    }

    // If login is successful, activate the user
    await this.userService.updateUserStatus(email, 'active');

    return user;
  }

  async register(createUserDto: any) {
    return this.userService.create(createUserDto);
  }

  async registerWithGoogle(createUserDto: any) {
    return this.userService.registerWithGoogle(createUserDto);
  }

  async registerWithLinkedin(email: string) {
    return this.userService.registerWithLinkedin(email);
  }

  async getUserRoleById(id: string) {
    return this.userService.getUserRoleById(id);
  }

  async forgotPassword(email: string) {
    return this.userService.sendPasswordResetEmail(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    return this.userService.resetPassword(token, newPassword);
  }

  async generateSignupToken(): Promise<string> {
    return this.userService.generateSignupToken();
  }

  async storeSignupToken(signupToken: string, email: string, parentId: string): Promise<void> {
    return this.userService.storeSignupToken(signupToken, email, parentId);
  }

  async getOneByEmail(email: string) {
    try {
      const user = await this.userService.getOneByEmail(email);
      return user;
    } catch (error) {
      console.error(`Failed to fetch user with email: ${email}`, error);
      throw error;
    }
  }

  async getOneById(id: string) {
    try {
      const user = await this.userService.getOneById(id);
      return user;
    } catch (error) {
      console.error(`Failed to fetch user with id: ${id}`, error);
      throw error;
    }
  }

  async updateUserAccount(id: string, updateUserDto: UpdateUserDto) {
    try {
      const updatedUser = await this.userService.updateUserAccount(id, updateUserDto);
      return updatedUser;
    } catch (error) {
      console.error(`Failed to update user with id: ${id}`, error);
      throw error;
    }
  }

  async sendSignupEmail(email: string, isLoginLink: boolean = false): Promise<string> {
    return this.userService.sendSignupEmail(email, isLoginLink);
  }

  async verifySignupToken(email: string, token: string): Promise<string | null> {
    return this.userService.verifySignupToken(email, token);
  }

  async updateUser(email: string, password: string, firstName: string, lastName: string, parentId: string, accountExist:boolean) {
    return this.userService.updateUser(email, password, firstName, lastName, parentId, accountExist);
  }

  async updateUserStatus(email: string, status: string): Promise<void> {
    return this.userService.updateUserStatus(email, status);
  }

  async checkUserStatus(email: string): Promise<boolean> {
    return this.userService.getUserStatus(email);
  }

  async getAllWhereParentIdIs(parentId: string): Promise<User[]> {
    return this.userService.getAllChildAccounts(parentId);
  }

  async saveChildUser(email: string, status: string, parentId: string): Promise<User> {
    return this.userService.saveChildUser(email, status, parentId);
  }


  async changeUserPassword(id: string, changePasswordDto: ChangePasswordDto): Promise<User> {
    return this.userService.changeUserPassword(id, changePasswordDto);
  }
}
