import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export type UserRole = 'DEV_TEAM' | 'INFRA_TEAM';

export class RegisterDto {
  @ApiProperty({ example: 'dev@company.com', description: '사용자 이메일' })
  @IsEmail({}, { message: '올바른 이메일 형식을 입력하세요.' })
  email!: string;

  @ApiProperty({ example: 'dev1234!', description: '비밀번호 (최소 6자 이상)' })
  @IsString()
  @MinLength(6, { message: '비밀번호는 최소 6자 이상이어야 합니다.' })
  password!: string;

  @ApiProperty({ example: '홍길동', description: '사용자 이름' })
  @IsString()
  @IsNotEmpty({ message: '이름을 입력하세요.' })
  name!: string;

  @ApiProperty({ example: '서비스개발1팀', description: '소속 부서' })
  @IsString()
  @IsNotEmpty({ message: '부서명을 입력하세요.' })
  department!: string;

  @ApiProperty({
    example: 'DEV_TEAM',
    enum: ['DEV_TEAM', 'INFRA_TEAM'],
    description: '역할 (DEV_TEAM: 개발팀, INFRA_TEAM: 인프라팀)',
  })
  @IsEnum(['DEV_TEAM', 'INFRA_TEAM'], {
    message: '역할은 DEV_TEAM(개발팀) 또는 INFRA_TEAM(인프라팀)이어야 합니다.',
  })
  role!: UserRole;
}

export class LoginDto {
  @ApiProperty({ example: 'dev@company.com', description: '사용자 이메일' })
  @IsEmail({}, { message: '올바른 이메일 형식을 입력하세요.' })
  email!: string;

  @ApiProperty({ example: 'dev1234!', description: '비밀번호' })
  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력하세요.' })
  password!: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  department: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user: UserProfile;
  token: string;
}
