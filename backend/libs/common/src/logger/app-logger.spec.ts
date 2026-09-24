import { maskSensitiveData } from './app-logger.service';

describe('AppLogger - maskSensitiveData (TDD)', () => {
  it('should mask plain string containing password fields in JSON', () => {
    const raw = '{"email":"test@test.com","password":"dummy-mock-secret-value"}';
    const masked = maskSensitiveData(raw);
    expect(masked).toContain('"password":"***MASKED***"');
    expect(masked).not.toContain('dummy-mock-secret-value');
  });

  it('should mask sensitive keys in nested object', () => {
    const data = {
      user: {
        id: '123',
        email: 'user@example.com',
        password: 'dummy-mock-password',
        token: 'jwt.token.here',
        nested: {
          secret: 'dummy-mock-nested-secret',
          publicInfo: 'visible',
        },
      },
    };

    const result = maskSensitiveData(data);
    expect(result.user.password).toBe('***MASKED***');
    expect(result.user.token).toBe('***MASKED***');
    expect(result.user.nested.secret).toBe('***MASKED***');
    expect(result.user.email).toBe('user@example.com');
    expect(result.user.nested.publicInfo).toBe('visible');
  });

  it('should handle null and undefined safely', () => {
    expect(maskSensitiveData(null)).toBeNull();
    expect(maskSensitiveData(undefined)).toBeUndefined();
  });
});
