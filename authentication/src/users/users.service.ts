import { ConsoleLogger, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { RolesService } from 'src/roles/roles.service';
import { v4 as uuidv4 } from 'uuid';
import { JwtService } from '@nestjs/jwt';
import { MailsService } from 'src/mails/mails.service';
import * as nodemailer from 'nodemailer';
import { UpdateUserDto } from 'src/auth/dto/update-user.dto';
import { ChangePasswordDto } from 'src/auth/dto/change-password.dto';
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly rolesService: RolesService,
    private jwtService: JwtService,
    private mailService: MailsService,
  ) { }

  async hashPassword(password: string, salt: string | null): Promise<any> {
    if (salt === null) {
      salt = await bcrypt.genSalt(11);
    }
    const hashedPassword = await bcrypt.hash(password, salt);
    return { salt, password: hashedPassword };
  }

  async generateOtp() {
    const otp = Math.floor(1000 + Math.random() * 9000);
    return otp;
  }

  async login(loginUserDto: CreateUserDto) {
    const email = loginUserDto.email.toLowerCase();
    const user = await this.usersRepository.findOne({
      where: { email: email },
      select: ['id', 'password', 'salt', 'email', 'category', 'role', 'first_name', 'last_name'],
      relations:['role']
    });
    if (user) {
      const { password } = await this.hashPassword(
        loginUserDto.password,
        user.salt,
      );
      if (password === user.password) {
        delete user.password;
         delete user.salt;
        //  NOTE - added user role in token too so we can use it directly.
        const jwt_token = this.jwtService.sign({
          id: user.id,
          email: user.email,
          role: user?.role?.name
        });
        const data = await this.usersRepository.update(
          { email: user.email },
          { jwt_token },
        );

        //NOTE - Made a proper response object
        return { isLoggedIn:true,   user: {
          id: user.id,
          email: user.email,
          role: user?.role?.name,
          category: user?.category,
          ...(user?.first_name && user?.last_name ? { name: `${user.first_name} ${user.last_name}` } : {}),
        }, token: jwt_token };
      } else {
        return { isLoggedIn: false, user: null, token:null };
      }
    } else {
      return { isLoggedIn: false, user: null, token:null };
    }
  }

  async registerWithGoogle(createUserDto: any) {
    const role = await this.rolesService.getDefaultRole();
    const user = await this.usersRepository.save({
      email: createUserDto?.email,
      jwt_token: createUserDto?.jwt_token,
      role,
      provider: 'google',
    });

    delete user.password;
    delete user.salt;
    return user;
  }

  async registerWithLinkedin(email: string) {
    const role = await this.rolesService.getDefaultRole();
    const user = await this.usersRepository.save({
      email,
      role,
      provider: 'linkedin',
    });

    delete user.password;
    delete user.salt;
    return user;
  }

  async create(createUserDto: CreateUserDto) {
    try {
      const { firstName: first_name, lastName: last_name, ...rest } = createUserDto;
      const { salt, password } = await this.hashPassword(
        rest.password,
        null,
      );
      const email = rest.email.toLowerCase();
      const role = await this.rolesService.getDefaultRole();
      const user = await this.usersRepository.save({
        first_name,
        last_name,
        ...rest,
        salt,
        password,
        role,
        email,
      });

      delete user.password;
      delete user.salt;
      const token = await this.createJwtForEmailVerification(user.id);
      const link = process.env.VERIFICATION_LINK + token;
      const htmlContent = `Please click on the link to verify your email address: <a href="${link}">${link}</a>`;
      const subject = 'Email Verification';
      const sentMail = await this.mailService.sendMail(
        user.email,
        subject,
        null,
        htmlContent,
      );
      console.log(sentMail);
      return { ...user, link: link };
    } catch (error) {
      return { message: error.message };
    }
  }

  // NOTE - if requesting user is super admin then send all the users except itself.
  findAll(userId: string ,  userRole: string  ) {
    const whereClause = userRole === 'superAdmin' ? {id : Not(userId) } : {} ;
    return this.usersRepository.find({
      where: whereClause,
      select: ['id', 'email' , 'first_name', 'last_name'],
    });
  }

  findOne(id: string) {
    return this.usersRepository.find({
      where: { id },
    });
  }

  async getOneById(id: string) {
    console.log("Searching with id: ", id)
    const users = await this.usersRepository.find({
      where: { id },
    });
    console.log("Usre found is this: ", users)

    if (users.length === 0) {
      throw new Error(`User with ID ${id} not found`);
    }

    return users[0];
  }

  async updateUserAccount(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.getOneById(id);
    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }

    if (updateUserDto.firstName !== undefined) {
      user.first_name = updateUserDto.firstName;
    }

    if (updateUserDto.lastName !== undefined) {
      user.last_name = updateUserDto.lastName;
    }

    if (updateUserDto.phone !== undefined) {
      user.phone = updateUserDto.phone;
    }

    const updatedUser = await this.usersRepository.save(user);
    return updatedUser;
  }

  findByEmail(email: string) {
    return this.usersRepository.find({
      where: { email },
      // select: ['id', 'email'],
    });
  }

  isTokenExpired(updatedAt: Date): boolean {
    const currentTime = new Date();
    const timeDifference = currentTime.getTime() - updatedAt.getTime();
    const timeDifferenceInHours = timeDifference / (1000 * 60 * 60);
    return timeDifferenceInHours > 24;
  }

  async update(id: string, updateUserDto: UpdateUserPasswordDto) {
    await this.usersRepository.update({ id }, updateUserDto);
    return this.usersRepository.findOne({
      where: { id: id },
      select: ['id', 'email', 'category'],
    });
  }

  remove(id: string) {
    return this.usersRepository.delete({ id });
  }

  getUserRoleById(id: string) {
    return this.usersRepository.findOne({
      where: { id },
      select: ['role'],
      relations: ['role'],
    });
  }

  async createAdmin(createUserDto: CreateUserDto) {
    const { salt, password } = await this.hashPassword(
      createUserDto.password,
      null,
    );
    const email = createUserDto.email.toLowerCase();
    const role = await this.rolesService.getAdminRole();
    const user = await this.usersRepository.save({
      ...createUserDto,
      salt,
      password,
      role,
      email,
    });

    delete user.password;
    delete user.salt;
    return user;
  }

  async createJwtForEmailVerification(id: string) {
    const secretKey = uuidv4();
    const payload = { userid: id, secretKey: secretKey };
    const verification_token = this.jwtService.sign(payload);
    if (verification_token) {
      const data = await this.usersRepository.update(
        { id: id },
        { secret: secretKey },
      );
    }
    // console.log(verification_token);
    return verification_token;
  }

  async verifyEmailToken(token: string) {
    try {
      const validate = this.jwtService.verify(token, {
        secret: process.env.SECRET || 'secret',
      });
      if (validate) {
        const payload = this.jwtService.decode(token);
        const id = payload['userid'];
        const secret = payload['secret'];
        const data = await this.usersRepository.findOne({
          where: { id: id, secret: secret },
        });
        if (data) {
          await this.usersRepository.update(
            { id: id },
            { secret: null },
          );
          return { message: 'verfication successful' };
        }
      }
    } catch (error) {
      return { message: error.message };
    }
  }

  async sendPasswordResetEmail(email: string) {
    const user = await this.usersRepository.findOne({ where: { email } });
    console.log("user: ", user)
    if (!user) {
      return { message: 'No user found with this email address' };
    }


    const token = uuidv4();

    // Save the token in your database 
    user.resetPasswordToken = token;
    await this.usersRepository.save(user);

    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname,
      port: Number(process.env.SMTP_Port),
      secure: false,
      auth: {
        user: process.env.SMTP_Username,
        pass: process.env.SMTP_Password,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    let mailOptions = {
      from: process.env.FROM_EMAIL,
      to: email,
      subject: 'Seller Pundit password reset',
      html: `
          <div style="text-align: center; font-size: 18px; color: black;">
            <img src="https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/logo-removebg-preview.png" alt="Logo" style="width: 200px;">
            <h1>Password Reset Request</h1>
            <p>We received a request to reset your password. If you did not make this request, please ignore this email.</p>
            <p>Otherwise, click the button below to reset your password:</p>
            <a href="${process.env.FRONTEND_URL}/reset-password/${token}" style="background-color: rgb(5,75,216); color: white; padding: 15px 32px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 4px 2px; cursor: pointer; border-radius: 12px;">Reset Password</a>
            <div style="text-align: left; font-size: 16px;">
              <p>If the button above does not work, you can also reset your password by clicking on the link below:</p>
              <a href="${process.env.FRONTEND_URL}/reset-password/${token}" style="color: blue;">${process.env.FRONTEND_URL}/reset-password/${token}</a>
              <br><br>
              <p>Best,</p>
              <p>Seller Pundit Support</p>
            </div>
          </div>
        `,
    };

    try {
      let info = await transporter.sendMail(mailOptions);
      console.log('Email sent: ' + info.response);
      return true;
    } catch (error) {
      console.log('Error sending email: ', error);
    }

  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { resetPasswordToken: token },
      select: ['id', 'salt', 'password', 'resetPasswordToken', 'email', 'updated_at']
    });

    if (!user || this.isTokenExpired(user.updated_at)) {
      throw new HttpException({ message: 'Link expired or invalid token. Please request a new link', error: 'An error occurred while resetting the password' }, HttpStatus.BAD_REQUEST);
    }

    const { password: hashedPassword } = await this.hashPassword(newPassword, user.salt);

    if (user.password === hashedPassword) {
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        message: 'New password cannot be the same as the old password'
      }, HttpStatus.BAD_REQUEST)
    }

    user.password = hashedPassword;
    user.resetPasswordToken = null;
    await this.usersRepository.save(user);

    return true;
  }

  async getOneByEmail(email: string) {
    return this.usersRepository.findOne({ where: { email } });
  }

  async removeParentSignupToken(parentId: string) {
    const parentUser = await this.usersRepository.find({
      where: { id: parentId },
    });
    if (parentUser && parentUser[0].signupToken) {
      parentUser[0].signupToken = null;
      await this.usersRepository.save(parentUser);
    }
  }

  async updateUser(email: string, password: string, firstName: string, lastName: string, parentId: string, accountExist:boolean) {
    try {
      const { salt, password: hashedPassword } = await this.hashPassword(
        password,
        null,
      );
      email = email.toLowerCase();
      const role = await this.rolesService.getDefaultRole();

      // Find the existing user
      const user = await this.usersRepository.findOne({ where: { email, parentId } });

      if (!user) {
        throw new Error('User not found');
      }

      // Update the user
      user.salt = salt;
      user.password = hashedPassword;
      user.role = role;
      user.status = 'active';
      user.first_name = firstName
      user.last_name = lastName
      user.account_exist = accountExist

      await this.usersRepository.save(user);

      delete user.password;
      delete user.salt;
      const token = await this.createJwtForEmailVerification(user.id);
      const link = process.env.VERIFICATION_LINK + token;
      const htmlContent = `Please click on the link to verify your email address: <a href="${link}">${link}</a>`;
      const subject = 'Email Verification';
      const sentMail = await this.mailService.sendMail(
        user.email,
        subject,
        null,
        htmlContent,
      );
      console.log(sentMail);
      await this.removeParentSignupToken(parentId);
      return { ...user, link: link };
    } catch (error) {
      return { message: error.message };
    }
  }

  async generateSignupToken(): Promise<string> {
    return uuidv4();
  }

  async storeSignupToken(signupToken: string, email: string, parentEmail: string): Promise<void> {
    const user = await this.findByEmail(parentEmail);
    if (!user) {
      throw new Error('Parent account not found');
    }

    user[0].signupToken = signupToken;

    await this.usersRepository.save(user);
  }

  async verifySignupToken(email: string, token: string): Promise<string | null> {
    const user = await this.usersRepository.findOne({ where: { signupToken: token } });
    if (!user || this.isTokenExpired(user.updated_at)) {
      return null;
    }

    return user.id;
  }

  async sendSignupEmail(email: string, isLoginLink: boolean = false): Promise<string> {
    console.log("Sending mail with link : auth/signup")
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname,
      port: Number(process.env.SMTP_Port),
      secure: false,
      auth: {
        user: process.env.SMTP_Username,
        pass: process.env.SMTP_Password,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Generate a signup token for the new user
    const signupToken = await this.generateSignupToken();

    let subject = '';
    let link = '';
    let buttonText = '';
    if (isLoginLink) {
      subject = 'You have been invited to join Seller Pundit!';
      link = `${process.env.FRONTEND_URL}/auth/login/${signupToken}`;
      buttonText = 'Login';
    } else {
      subject = 'You have been invited to join Seller Pundit!';
      link = `${process.env.FRONTEND_URL}/auth/signup/${signupToken}`;
      buttonText = 'Complete Signup';
    }

    let mailOptions = {
      from: process.env.FROM_EMAIL,
      to: email,
      subject: subject,
      html: `
      <div style="text-align: center; font-size: 18px; color: black;">
        <img src="https://sellerpundit-bucket-1.s3.ap-south-1.amazonaws.com/logo-removebg-preview.png" alt="Logo" style="width: 200px;">
        <h1>${subject}</h1>
        <p>We're excited to have you on board. To complete your process, please click the button below.</p>
        <a href="${link}" style="background-color: rgb(5,75,216); color: white; padding: 15px 32px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 4px 2px; cursor: pointer; border-radius: 12px;">${buttonText}</a>
        <div style="text-align: left; font-size: 16px;">
          <p>If the button above does not work, you can also complete the process by clicking on the link below:</p>
          <a href="${link}" style="color: blue;">${link}</a>
          <br><br>
          <p>If you did not request this email, please ignore it.</p>
          <p>Best,</p>
          <p>Seller Pundit Support</p>
        </div>
      </div>
    `,
    };

    try {
      let info = await transporter.sendMail(mailOptions);
      console.log('Email sent: ' + info.response);
      return signupToken;
    } catch (error) {
      console.log('Error sending email: ', error);
      throw error;
    }
  }

  async updateUserStatus(email: string, status: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { email } });

    if (!user) {
      throw new Error('User not found');
    }

    user.status = status;
    await this.usersRepository.save(user);
  }

  async getUserStatus(email: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { email } });

    if (!user) {
      throw new Error('User not found');
    }

    return user.account_exist;
  }

  async getAllChildAccounts(parentId: string): Promise<User[]> {
    return this.usersRepository.find({ where: { parentId } });
  }

  async saveChildUser(email: string, status: string, parentId: string): Promise<User> {
    const newUser = new User();
    newUser.email = email;
    newUser.status = status;
    newUser.parentId = parentId;
    newUser.account_exist = false;

    return this.usersRepository.save(newUser);
  }

  async updateAccount(updateUserDto: any): Promise<User> {
    console.log("Updating account: ", updateUserDto)
    const user = await this.findByEmail(updateUserDto.email);
    if (!user) {
      console.log("User not found")
      throw new Error('User not found');
    }
    console.log("User is: ", user)


    // Update the user object with the new values from updateUserDto
    Object.assign(user, updateUserDto);
    console.log("Object assigned")
    // Save the updated user object in the database
    const updatedUser = await this.usersRepository.save(user);
    console.log("User Updated")
    return updatedUser[0];
  }


  async changeUserPassword(id: string, changePasswordDto: ChangePasswordDto): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: id },
      select: ['id', 'password', 'salt', 'email', 'category'],
    });

    if (!user) {
      throw new HttpException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      }, HttpStatus.NOT_FOUND);
    }

    const { password: hashedOldPassword } = await this.hashPassword(changePasswordDto.oldPassword, user.salt);
    if (hashedOldPassword !== user.password) {
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Old password is incorrect',
      }, HttpStatus.BAD_REQUEST);
    }

    const { password: hashedNewPassword } = await this.hashPassword(changePasswordDto.newPassword, user.salt);
    if(hashedNewPassword === user.password){
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        message: 'New password cannot be the same as the old password'
      }, HttpStatus.BAD_REQUEST)
    }
    user.password = hashedNewPassword;

    const updatedUser = await this.usersRepository.save(user);
    return updatedUser;
  }
}
