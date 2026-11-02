import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable, of, throwError, timeout } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

interface CsrfResponse {
  csrfToken: string;
}

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

const USERS_STORAGE_KEY = 'cuan_auth_users';
const SESSION_STORAGE_KEY = 'cuan_auth_session';

async function hashPassword(password: string, salt: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const keyData = enc.encode(`${password}:${salt}:cuan_app_secret`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback below
    }
  }
  // Simple fallback hash
  let hash = 0;
  const str = `${password}:${salt}:cuan_app_secret`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

function generateSalt(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiBaseUrl;
  private authenticatedUser: AuthUser | null = null;
  private readonly http = inject(HttpClient);

  constructor() {
    this.restoreLocalSession();
  }

  get currentUser(): AuthUser | null {
    return this.authenticatedUser;
  }

  loadSession(): Observable<AuthUser | null> {
    if (this.authenticatedUser) {
      return of(this.authenticatedUser);
    }

    const localUser = this.restoreLocalSession();
    if (localUser) {
      return of(localUser);
    }

    return this.http.get<AuthUser>(`${this.apiUrl}/auth/me`, { withCredentials: true }).pipe(
      timeout({ first: 1500 }),
      tap(user => {
        this.authenticatedUser = user;
        if (user) {
          this.saveLocalSession(user);
        }
      }),
      catchError(() => of(null))
    );
  }

  async loginWithPassword(email: string, password: string): Promise<AuthUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const storedUsers = this.getStoredUsers();
    const existing = storedUsers[normalizedEmail];

    if (existing) {
      const computedHash = await hashPassword(password, existing.salt);
      if (computedHash === existing.passwordHash) {
        const user: AuthUser = {
          id: existing.id,
          email: existing.email,
          name: existing.email.split('@')[0],
          picture: null,
        };
        this.authenticatedUser = user;
        this.saveLocalSession(user);
        return user;
      }
      throw new HttpErrorResponse({
        error: { message: 'Email atau kata sandi salah. Jika belum memiliki akun, silakan daftar.' },
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    // If not found in local storage, attempt backend login with short timeout
    try {
      const user = await this.postWithCsrf<AuthUser>('/auth/email/login', { email: normalizedEmail, password }, 2500);
      this.authenticatedUser = user;
      this.saveLocalSession(user);
      return user;
    } catch (backendError) {
      if (backendError instanceof HttpErrorResponse && backendError.status === 401) {
        throw backendError;
      }
      throw new HttpErrorResponse({
        error: { message: 'Email atau kata sandi salah. Jika belum memiliki akun, silakan daftar.' },
        status: 401,
        statusText: 'Unauthorized',
      });
    }
  }

  async registerWithPassword(email: string, password: string): Promise<AuthUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const storedUsers = this.getStoredUsers();

    if (storedUsers[normalizedEmail]) {
      throw new HttpErrorResponse({
        error: { message: 'Email sudah terdaftar. Silakan masuk dengan akun tersebut.' },
        status: 409,
        statusText: 'Conflict',
      });
    }

    // Instantly register locally
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    const newUserRecord: StoredUser = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };

    storedUsers[normalizedEmail] = newUserRecord;
    this.saveStoredUsers(storedUsers);

    const user: AuthUser = {
      id: userId,
      email: normalizedEmail,
      name: normalizedEmail.split('@')[0],
      picture: null,
    };

    this.authenticatedUser = user;
    this.saveLocalSession(user);

    // Sync with backend asynchronously without blocking user registration
    this.postWithCsrf<AuthUser>('/auth/email/register', { email: normalizedEmail, password }, 3000)
      .catch(() => {
        // Ignored in local mode
      });

    return user;
  }

  async logout(): Promise<void> {
    this.authenticatedUser = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore
    }

    try {
      await this.postWithCsrf<void>('/auth/logout', {}, 1500);
    } catch {
      // Backend may be offline, ignore
    }
  }

  private restoreLocalSession(): AuthUser | null {
    try {
      const sessionData = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionData) {
        const user = JSON.parse(sessionData) as AuthUser;
        if (user?.id && user?.email) {
          this.authenticatedUser = user;
          return user;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private saveLocalSession(user: AuthUser): void {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // Ignore
    }
  }

  private getStoredUsers(): Record<string, StoredUser> {
    try {
      const data = localStorage.getItem(USERS_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private saveStoredUsers(users: Record<string, StoredUser>): void {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch {
      // Ignore
    }
  }

  public hasStoredPassword(email?: string | null): boolean {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    const stored = this.getStoredUsers();
    return !!(stored[normalized] && stored[normalized].passwordHash);
  }

  public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.authenticatedUser;
    if (!user || !user.email) {
      throw new Error('User not logged in');
    }
    const normalizedEmail = user.email.trim().toLowerCase();
    const storedUsers = this.getStoredUsers();
    const existing = storedUsers[normalizedEmail];

    if (existing && existing.passwordHash) {
      const computedHash = await hashPassword(currentPassword, existing.salt);
      if (computedHash !== existing.passwordHash) {
        throw new Error('Kata sandi saat ini tidak sesuai.');
      }
    }

    const newSalt = generateSalt();
    const newPasswordHash = await hashPassword(newPassword, newSalt);

    if (existing) {
      existing.passwordHash = newPasswordHash;
      existing.salt = newSalt;
      storedUsers[normalizedEmail] = existing;
    } else {
      storedUsers[normalizedEmail] = {
        id: user.id,
        email: normalizedEmail,
        passwordHash: newPasswordHash,
        salt: newSalt,
        createdAt: new Date().toISOString(),
      };
    }
    this.saveStoredUsers(storedUsers);

    try {
      await this.postWithCsrf<void>('/auth/change-password', {
        email: normalizedEmail,
        currentPassword,
        newPassword
      }, 2000);
    } catch {
      // Ignore backend error for local/offline storage
    }
  }

  private async postWithCsrf<T>(path: string, body: unknown, timeoutMs = 2500): Promise<T> {
    const csrf = await firstValueFrom(
      this.http.get<CsrfResponse>(`${this.apiUrl}/auth/csrf`, { withCredentials: true })
        .pipe(timeout({ first: Math.min(timeoutMs, 2000) }))
    );
    return firstValueFrom(this.http.post<T>(`${this.apiUrl}${path}`, body, {
      withCredentials: true,
      headers: new HttpHeaders({ 'X-CSRF-Token': csrf.csrfToken }),
    }).pipe(timeout({ first: timeoutMs })));
  }
}
