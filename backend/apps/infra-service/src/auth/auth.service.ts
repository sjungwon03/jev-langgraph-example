import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { RegisterDto, LoginDto, UserProfile, AuthResponse, UserRole } from './auth.dto';

interface StoredUser {
  id: string;
  email: string;
  name: string;
  department: string;
  role: UserRole;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private users: Map<string, StoredUser> = new Map(); // key: email lowercase
  private sessions: Map<string, string> = new Map(); // key: token, value: email lowercase

  onModuleInit() {
    this.seedDefaultUsers();
  }

  private seedDefaultUsers() {
    // Seed default Dev Team user
    if (!this.users.has('dev@company.com')) {
      const devSalt = crypto.randomBytes(16).toString('hex');
      const devHash = this.hashPassword('dev1234!', devSalt);
      this.users.set('dev@company.com', {
        id: 'usr_dev_001',
        email: 'dev@company.com',
        name: '김개발',
        department: '서비스개발1팀',
        role: 'DEV_TEAM',
        passwordHash: devHash,
        salt: devSalt,
        createdAt: new Date().toISOString(),
      });
    }

    // Seed default Infra Team user
    if (!this.users.has('infra@company.com')) {
      const infraSalt = crypto.randomBytes(16).toString('hex');
      const infraHash = this.hashPassword('infra1234!', infraSalt);
      this.users.set('infra@company.com', {
        id: 'usr_infra_001',
        email: 'infra@company.com',
        name: '인프라 관리자',
        department: '클라우드인프라팀',
        role: 'INFRA_TEAM',
        passwordHash: infraHash,
        salt: infraSalt,
        createdAt: new Date().toISOString(),
      });
    }

    this.logger.log('✅ Seeded default accounts: dev@company.com (DEV) & infra@company.com (INFRA)');
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  }

  private generateToken(): string {
    return `pve_auth_${uuidv4().replace(/-/g, '')}${crypto.randomBytes(12).toString('hex')}`;
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const emailKey = dto.email.trim().toLowerCase();

    if (this.users.has(emailKey)) {
      throw new ConflictException('이미 등록된 이메일 주소입니다.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(dto.password, salt);
    const userId = `usr_${uuidv4().slice(0, 8)}`;

    const newUser: StoredUser = {
      id: userId,
      email: emailKey,
      name: dto.name.trim(),
      department: dto.department.trim(),
      role: dto.role,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };

    this.users.set(emailKey, newUser);

    const token = this.generateToken();
    this.sessions.set(token, emailKey);

    this.logger.log(`New user registered: ${newUser.email} [${newUser.role}] (${newUser.department})`);

    const userProfile: UserProfile = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      department: newUser.department,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };

    return {
      success: true,
      message: '회원가입이 완료되었습니다.',
      user: userProfile,
      token,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const emailKey = dto.email.trim().toLowerCase();
    const user = this.users.get(emailKey);

    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    const inputHash = this.hashPassword(dto.password, user.salt);
    if (inputHash !== user.passwordHash) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    const token = this.generateToken();
    this.sessions.set(token, emailKey);

    this.logger.log(`User logged in: ${user.email} [${user.role}]`);

    const userProfile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      role: user.role,
      createdAt: user.createdAt,
    };

    return {
      success: true,
      message: '성공적으로 로그인되었습니다.',
      user: userProfile,
      token,
    };
  }

  async validateToken(token: string): Promise<UserProfile | null> {
    if (!token) return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    const email = this.sessions.get(cleanToken);
    if (!email) return null;

    const user = this.users.get(email);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async logout(token: string): Promise<{ success: boolean; message: string }> {
    if (token) {
      const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
      this.sessions.delete(cleanToken);
    }
    return { success: true, message: '로그아웃되었습니다.' };
  }
}
