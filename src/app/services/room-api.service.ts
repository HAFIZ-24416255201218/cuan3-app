import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SharedRoom } from './room.service';

interface CsrfResponse {
  csrfToken: string;
}

/**
 * Thin HTTP wrapper for the server-side Room API.
 * Falls back gracefully (returns null / throws) when the server is offline,
 * so the app continues to work in offline / local-only mode.
 */
@Injectable({ providedIn: 'root' })
export class RoomApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiBaseUrl;
  private readonly TIMEOUT_MS = 5000;

  /** Upload a newly-created room to the server. Returns the server copy or null on failure. */
  async uploadRoom(room: SharedRoom): Promise<SharedRoom | null> {
    try {
      const headers = await this.csrfHeaders();
      const result = await firstValueFrom(
        this.http.post<SharedRoom>(`${this.apiUrl}/rooms`, room, { headers, withCredentials: true })
          .pipe(timeout(this.TIMEOUT_MS), catchError(() => of(null)))
      );
      return result;
    } catch {
      return null;
    }
  }

  /** Find a room by invite code on the server. Returns the room or null if not found / offline. */
  async findRoom(code: string): Promise<SharedRoom | null> {
    try {
      const clean = code.trim().replace(/[^A-Za-z0-9]/g, '');
      if (!clean) return null;
      const result = await firstValueFrom(
        this.http.get<SharedRoom>(`${this.apiUrl}/rooms/find/${encodeURIComponent(clean)}`, { withCredentials: true })
          .pipe(timeout(this.TIMEOUT_MS), catchError(() => of(null)))
      );
      return result;
    } catch {
      return null;
    }
  }

  /** Join an existing server-side room (adds caller as member). Returns updated room. */
  async joinRoom(roomId: string, memberName: string): Promise<SharedRoom | null> {
    try {
      const headers = await this.csrfHeaders();
      const result = await firstValueFrom(
        this.http.post<SharedRoom>(
          `${this.apiUrl}/rooms/${encodeURIComponent(roomId)}/join`,
          { name: memberName },
          { headers, withCredentials: true }
        ).pipe(timeout(this.TIMEOUT_MS), catchError(() => of(null)))
      );
      return result;
    } catch {
      return null;
    }
  }

  /** Push updated transactions/savings to server. Returns updated room or null on failure. */
  async syncRoom(roomId: string, patch: Partial<Pick<SharedRoom, 'transactions' | 'savingsGoals' | 'members'>>): Promise<SharedRoom | null> {
    try {
      const headers = await this.csrfHeaders();
      const result = await firstValueFrom(
        this.http.put<SharedRoom>(
          `${this.apiUrl}/rooms/${encodeURIComponent(roomId)}`,
          patch,
          { headers, withCredentials: true }
        ).pipe(timeout(this.TIMEOUT_MS), catchError(() => of(null)))
      );
      return result;
    } catch {
      return null;
    }
  }

  /** Delete (owner) or leave (member) a room on the server. */
  async deleteOrLeaveRoom(roomId: string): Promise<void> {
    try {
      const headers = await this.csrfHeaders();
      await firstValueFrom(
        this.http.delete(`${this.apiUrl}/rooms/${encodeURIComponent(roomId)}`, { headers, withCredentials: true })
          .pipe(timeout(this.TIMEOUT_MS), catchError(() => of(null)))
      );
    } catch {
      // Ignore – local state is already cleaned up by RoomService
    }
  }

  private async csrfHeaders(): Promise<HttpHeaders> {
    try {
      const csrf = await firstValueFrom(
        this.http.get<CsrfResponse>(`${this.apiUrl}/auth/csrf`, { withCredentials: true })
          .pipe(timeout(2000), catchError(() => of(null)))
      );
      if (csrf?.csrfToken) {
        return new HttpHeaders({ 'X-CSRF-Token': csrf.csrfToken });
      }
    } catch {
      // Server offline – return empty headers; request will likely fail gracefully
    }
    return new HttpHeaders();
  }
}

