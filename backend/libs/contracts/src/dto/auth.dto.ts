import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  password?: string;
}

export class GetProfileDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  password?: string;
}

export class AuthResponseDto {
  access_token: string;
  token_type: string;
  expires_in: string;
  user: {
    id: string;
    email: string;
    name?: string;
    provider?: string;
    profileImage?: string;
  };
}

export type SocialProvider = 'google' | 'naver' | 'kakao' | 'apple';

export class SocialLoginDto {
  @IsString()
  @IsNotEmpty()
  provider: SocialProvider;

  @IsString()
  @IsNotEmpty()
  providerId: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}

export interface ProviderStatusInfo {
  enabled: boolean;
  loginUrl: string;
}

export class OAuthProvidersResponseDto {
  providers: Record<SocialProvider, ProviderStatusInfo>;
}
