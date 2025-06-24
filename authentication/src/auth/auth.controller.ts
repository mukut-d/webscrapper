import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  Logger, Req, Get, Param, HttpException, HttpStatus, ConsoleLogger,
  Put,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/create-auth.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { SsoAuthDto } from './dto/create-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { AddChildDto } from './dto/add-child.dto'
import { SignupChildDto } from './dto/signup-child.dto'
import { UpdateChildStatusDto } from './dto/update-child-status.dto'
import {ResendVerificationLinkDto} from './dto/resend-verification-link.dto'
import {UpdateUserDto} from './dto/update-user.dto'
import {ChangePasswordDto} from './dto/change-password.dto'
import { OAuth2Client } from 'google-auth-library';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as querystring from 'querystring';
import { Request } from 'express';
import { isInstance } from 'class-validator';

const linkedInUrl = 'https://www.linkedin.com/oauth/v2/accessToken';

@ApiTags('User Auth APIs')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private httpService: HttpService,
  ) {}

  // Google OAuth routes
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    const data = JSON.stringify(req.user);
    res.redirect(`https://app.sellerpundit.com/auth/authlogin?data=${data}`);
    // try {
    //   const user = req.user;
    //   if (!user) {
    //     return res.status(404).json({
    //       user: null,
    //       token: null,
    //       message: 'User not found',
    //     });
    //   }
    //   const jwtToken = user?.jwt_token;
    //   return res.status(200).json({
    //     user: user || user.createUserDto,
    //     token: jwtToken,
    //     message: 'User logged in successfully',
    //   });
    // } catch (error) {
    //   this.logger.error(error);
    //   return res.status(500).json({
    //     user: null,
    //     token: null,
    //     message: 'Something went wrong',
    //   });
    // }
  }

  @Post('register/google')
  @ApiOperation({ summary: 'Register User Using Google' })
  @ApiBody({ type: SsoAuthDto })
  @ApiOkResponse({ status: 201, description: 'User registered successfully' })
  async registerGoogle(@Body() email: string) {
    try {
      const user = await this.authService.getOneByEmail(email);
      if (user) {
        return {
          user: null,
          message: 'User already exists',
        };
      }
      const response = await this.authService.registerWithGoogle(email);
      return {
        user: response,
        message: 'User registered successfully',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        user: null,
        message: 'Something went wrong',
      };
    }
  }

  @Post('login/google')
  @ApiOperation({ summary: 'Login User Using Google' })
  @ApiBody({ type: SsoAuthDto })
  @ApiOkResponse({ status: 200, description: 'User logged in successfully' })
  async loginGoogle(@Body() email: string) {
    try {
      const user = await this.authService.getOneByEmail(email);
      if (!user) {
        return {
          user: null,
          token: null,
          message: 'User not found',
        };
      }
      const payloads = { id: user[0]['id'] };
      const accessToken = this.jwtService.sign(payloads);
      return {
        user,
        token: accessToken,
        message: 'User logged in successfully',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        user: null,
        token: null,
        message: 'Something went wrong',
      };
    }
  }

  // LinkedIn OAuth routes
  @Post('register/linkedin')
  @ApiOperation({ summary: 'Register User Using LinkedIn' })
  @ApiBody({ type: SsoAuthDto })
  @ApiOkResponse({ status: 201, description: 'User registered successfully' })
  async registerLinkedin(@Body() ssoAuthDto: SsoAuthDto) {
    try {
      const resp = await lastValueFrom(
        this.httpService.post(
          linkedInUrl,
          querystring.stringify({
            grant_type: 'authorization_code',
            code: ssoAuthDto.token,
            redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
            client_id: process.env.LINKEDIN_CLIENT_ID,
            client_secret: process.env.LINKEDIN_CLIENT_SECRET,
          }),
        ),
      );
      const accessToken = resp.data.access_token;

      const emailRequest = await lastValueFrom(
        await this.httpService.get(
          'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))&oauth2_access_token=' +
          accessToken,
        ),
      );

      const email = emailRequest.data.elements[0]['handle~'].emailAddress;
      const user = await this.authService.getOneByEmail(email);
      if (user) {
        return {
          user: null,
          message: 'User already exists',
        };
      }
      const response = await this.authService.registerWithLinkedin(email);
      return {
        user: response,
        message: 'User registered successfully',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        user: null,
        message: 'Something went wrong',
      };
    }
  }

  @Post('login/linkedin')
  @ApiOperation({ summary: 'Login User Using LinkedIn' })
  @ApiBody({ type: SsoAuthDto })
  @ApiOkResponse({ status: 200, description: 'User logged in successfully' })
  async loginLinkedin(@Body() ssoAuthDto: SsoAuthDto) {
    try {
      const query = `grant_type=authorization_code&code=${ssoAuthDto.token}&redirect_uri=${process.env.LINKEDIN_REDIRECT_URI}&client_id=${process.env.LINKEDIN_CLIENT_ID}&client_secret=${process.env.LINKEDIN_CLIENT_SECRET}`;
      const resps = await lastValueFrom(
        await this.httpService.post(linkedInUrl, null, {
          params: query,
        }),
      );
      const accessToken = resps.data.access_token;
      const emailRequest = await lastValueFrom(
        this.httpService.get(
          'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))&oauth2_access_token=' +
          accessToken,
        ),
      );
      const email = emailRequest.data.elements[0]['handle~'].emailAddress;
      const user = await this.authService.getOneByEmail(email);
      if (user) {
        return {
          user: null,
          token: null,
          message: 'User not found',
        };
      }
      const payloads = { id: user[0]['id'] };
      const accessTokenJwt = this.jwtService.sign(payloads);
      return {
        user,
        token: accessTokenJwt,
        message: 'User logged in successfully',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        user: null,
        token: null,
        message: 'Something went wrong',
      };
    }
  }

  // Standard login and registration

  @Post('login')
  @ApiOperation({ summary: 'Login User' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ status: 200, description: 'User logged in successfully' })
  async login(@Body() loginDto: any) {
    try {
      const { isLoggedIn, user, token } = await this.authService.login(loginDto);
      if (!isLoggedIn) {
        throw new HttpException({
          status: HttpStatus.UNAUTHORIZED,
          message: 'Invalid credentials',
        }, HttpStatus.UNAUTHORIZED);
      }
      // NOTE - It was redundant so I commented it.
      // const payload = { id: user['id'] };
      // const accessToken = this.jwtService.sign(payload);
      return {
        user,
        token,
        message: 'User logged in successfully',
      };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException({
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Something went wrong',
        }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
  
  @Post('register')
  @ApiOperation({ summary: 'Register User' })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() createUserDto: CreateUserDto) {
    try {
      const user = await this.authService.getOneByEmail(createUserDto.email);
      if (user) {
        throw new HttpException({
          status: HttpStatus.CONFLICT,
          message: 'User already exists'
        }, HttpStatus.CONFLICT)
      }
      const response = await this.authService.register(createUserDto);
      return {
        user: response,
        message: 'User registered successfully',
      };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      else {
        throw new HttpException({
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Something went wrong'
        }, HttpStatus.INTERNAL_SERVER_ERROR)

      }
    }
  }

  @Put('edit/:id')
  @ApiOperation({ summary: 'Edit User' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ status: 200, description: 'User updated successfully' })
  async edit(@Body() updateUserDto: UpdateUserDto, @Param('id') id: string) {  
    try {
      const user = await this.authService.getOneById(id);
      if (!user) {
        return {
          user: null,
          message: 'User not found',
        };
      }
      const updatedUser = await this.authService.updateUserAccount(id, updateUserDto);
      return {
        user: updatedUser,
        message: 'User updated successfully',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        user: null,
        message: 'Something went wrong',
      };
    }
  }



  @Put('change-password/:id')
  @ApiOperation({ summary: 'Change User Password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(@Body() changePasswordDto: ChangePasswordDto, @Param('id') id: string) {
    try {
      const user = await this.authService.getOneById(id);
      if (!user) {
        throw new HttpException({
          status: HttpStatus.NOT_FOUND,
          message: 'User not found',
        }, HttpStatus.NOT_FOUND);
      }
      const updatedUser = await this.authService.changeUserPassword(id, changePasswordDto);
      return {
        user: updatedUser,
        message: 'Password changed successfully',
      };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException({
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Something went wrong',
        }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }


  @Post('init-child-add')
  @ApiOperation({ summary: 'Initialize child account addition' })
  @ApiBody({ type: AddChildDto })
  @ApiOkResponse({ status: 201, description: 'Child account initialization successful' })
  async initChildAdd(@Body() addChildDto: AddChildDto) {
    try {
      // Check if the child email already exists
      const childUser = await this.authService.getOneByEmail(addChildDto.email);
      if (childUser) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }

      const parentAccount = await this.authService.getOneByEmail(addChildDto.parentUserId)
      if (!parentAccount) {
        throw new HttpException('Parent account not found', HttpStatus.NOT_FOUND);
      }

      // Send the signup email
      const signupToken = await this.authService.sendSignupEmail(addChildDto.email);

      // Store the signup token and parent user ID for later verification
      await this.authService.storeSignupToken(signupToken, addChildDto.email, addChildDto.parentUserId);

      // Save the child user in the database with the status as 'email sent'
      await this.authService.saveChildUser(addChildDto.email, 'email sent', parentAccount.id);

      return {
        message: 'Signup email sent successfully',
      };
    } catch (error) {
      console.error('Error in initChildAdd:', error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  @Post('finalize-child-add')
  @ApiOperation({ summary: 'Finalize child account addition' })
  @ApiBody({ type: SignupChildDto })
  @ApiOkResponse({ status: 201, description: 'Child account added successfully' })
  async finalizeChildAdd(@Body() signupChildDto: SignupChildDto) {
    try {
      // Verify the signup token and get the parent user ID 
      const parentId = await this.authService.verifySignupToken(signupChildDto.email, signupChildDto.token);
      if (!parentId) {
        throw new HttpException('The signup token is invalid or the signup link has expired. Please request a new one.', HttpStatus.BAD_REQUEST);
      }

      // Check the status of the child account
      const childUserStatus = await this.authService.checkUserStatus(signupChildDto.email);
      if (childUserStatus === true) {
        // Update the status of the child account to 'active' and log in the user
        const childUser = await this.authService.activateAndLoginUser(signupChildDto.email, signupChildDto.password);

        if (!childUser.isLoggedIn) {
          throw new HttpException({
            status: HttpStatus.UNAUTHORIZED,
            message: 'Invalid credentials',
          }, HttpStatus.UNAUTHORIZED);
        }
        const payload = { id: childUser['id'] };
        const accessToken = this.jwtService.sign(payload);
        return {
          childUser,
          token: accessToken,
          message: 'User logged in successfully',
        };
      } else {
        // Create the child account
        const accountExist = true;
        const childUser = await this.authService.updateUser(signupChildDto.email, signupChildDto.password, signupChildDto.firstName, signupChildDto.lastName, parentId, accountExist);

        return {
          user: childUser,
          message: 'Child account created successfully',
        };
      }
    } catch (error) {
      console.error('Error in finalizeChildAdd:', error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('resend-verification-link')
  @ApiOperation({ summary: 'Resend verification link' })
  @ApiBody({ type: ResendVerificationLinkDto })
  @ApiOkResponse({ status: 200, description: 'Verification link sent successfully' })
  async resendVerificationLink(@Body() resendVerificationLinkDto: ResendVerificationLinkDto) {
    try {
      // Find the user
      const user = await this.authService.getOneByEmail(resendVerificationLinkDto.email);

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      let message = '';
      let isLoginLink = false;
      if (user.status === 'inactive') {
        await this.authService.updateUserStatus(user.email, 'email sent');
        // Send the login email
        isLoginLink = true;
        message = 'Login email sent successfully';
      } else {
        // Resend the signup email
        message = 'Signup email sent successfully';
      }

      // Generate and send the email
      const token = await this.authService.sendSignupEmail(user.email, isLoginLink);

      // Update the token for the user
      await this.authService.storeSignupToken(token, user.email, resendVerificationLinkDto.parentEmail);

      return {
        message: message,
      };
    } catch (error) {
      console.error('Error in resendVerificationLink:', error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  @Post('update-child-status')
  @ApiOperation({ summary: 'Update child account status' })
  @ApiBody({ type: UpdateChildStatusDto })
  @ApiOkResponse({ status: 200, description: 'Child account status updated successfully' })
  async updateChildStatus(@Body() updateChildStatusDto: UpdateChildStatusDto) {
    try {
      const parentAccount = await this.authService.getOneByEmail(updateChildStatusDto.parentUserId);
      if (!parentAccount) {
        throw new HttpException('Parent account not found', HttpStatus.NOT_FOUND);
      }

      const childUser = await this.authService.getOneByEmail(updateChildStatusDto.childEmail);
      if (!childUser) {
        throw new HttpException('Child account not found', HttpStatus.NOT_FOUND);
      }

      if (updateChildStatusDto.status === 'active' || updateChildStatusDto.status === 'inactive') {
        await this.authService.updateUserStatus(updateChildStatusDto.childEmail, updateChildStatusDto.status);
      }

      return {
        message: 'Child account status updated successfully',
      };
    } catch (error) {
      console.error('Error in updateChildStatus:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Something went wrong', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  @Get('check-account-type/:email')
  @ApiOperation({ summary: 'Check Account Type' })
  @ApiParam({ name: 'email', type: String, description: 'User Email' })
  @ApiOkResponse({ status: 200, description: 'Account type returned' })
  async checkAccountType(@Param('email') email: string) {
    try {
      const user = await this.authService.getOneByEmail(email);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return {
        accountType: user.parentId ? 'child' : 'parent',
      };
    } catch (error) {
      console.error('Error in checkAccountType:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Something went wrong', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  @Get('get-child-accounts/:email')
  @ApiOperation({ summary: 'Get Child Accounts' })
  @ApiParam({ name: 'email', type: String, description: 'Parent User Email' })
  @ApiOkResponse({ status: 200, description: 'Child accounts returned' })
  async getChildAccounts(@Param('email') email: string) {
    try {
      const parentUser = await this.authService.getOneByEmail(email);
      if (!parentUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      if (parentUser.parentId) {
        throw new HttpException('The provided account is not a parent account', HttpStatus.BAD_REQUEST);
      }

      const childAccounts = await this.authService.getAllWhereParentIdIs(parentUser.id);
      return {
        childAccounts,
      };
    } catch (error) {
      console.error('Error in getChildAccounts:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Something went wrong', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Forgot Password' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ status: 200, description: 'Password reset link sent' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    try {
      const response = await this.authService.forgotPassword(forgotPasswordDto.email);
      if (typeof response === 'object' && response.message === 'No user found with this email address') {
        throw new HttpException({ message: 'Email not found', error: response.message }, HttpStatus.NOT_FOUND);
      } else if (response === true) {
        return {
          message: 'Password reset link sent to your email',
        };
      }
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({ message: 'Something went wrong', error: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset Password' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ status: 200, description: 'Password reset successful' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    try {
      const response = await this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.newPassword);
      if (response === true) {
        return {
          message: 'Password reset successful',
        };
      } 
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      else {
        throw new HttpException({ message: 'Something went wrong', error: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
}
