import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      clientID: "1011544342810-ijmomh61lktbt8bjim2mr15dh521fhvg.apps.googleusercontent.com",
      clientSecret: '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',
      callbackURL: "https://authentication.sellerpundit.com/api/v1/auth/google/callback",
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const { emails } = profile;
    const user = await this.authService.getOneByEmail(emails[0].value);
    console.log("user", user)
    if (user) {
      return done(null, user);
    }else{
      const newUser = {email : emails[0].value, jwt_token : accessToken}
      const createdUser = await this.authService.registerWithGoogle(newUser);
      return done(null, createdUser);
    }
  }
}