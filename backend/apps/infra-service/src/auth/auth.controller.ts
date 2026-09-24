import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './auth.dto';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: '이메일 회원가입 (개발팀 / 인프라팀 구분)' })
  @ApiResponse({ status: 201, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 등록된 이메일' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '이메일 비밀번호 로그인' })
  @ApiResponse({ status: 200, description: '로그인 성공 및 세션 토큰 반환' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiOperation({ summary: '현재 로그인된 사용자 프로필 조회' })
  @ApiResponse({ status: 200, description: '사용자 정보 반환' })
  @ApiResponse({ status: 401, description: '유효하지 않은 토큰' })
  async getMe(@Headers('authorization') authHeader: string) {
    if (!authHeader) {
      throw new UnauthorizedException('인증 토큰이 제공되지 않았습니다.');
    }
    const user = await this.authService.validateToken(authHeader);
    if (!user) {
      throw new UnauthorizedException('만료되었거나 유효하지 않은 세션입니다.');
    }
    return { success: true, user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '사용자 로그아웃' })
  async logout(@Headers('authorization') authHeader: string) {
    return this.authService.logout(authHeader || '');
  }
}
