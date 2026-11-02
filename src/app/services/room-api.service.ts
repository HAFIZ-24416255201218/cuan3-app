import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SharedRoom } from './room.service';

/**
 * Dedicated client for Room synchronization across different devices.
 * Communicates with the Vercel API backed by MongoDB Atlas.
 */
@Injectable({ providedIn: 'root' })
export class RoomApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiBaseUrl;
  private readonly TIMEOUT_MS = 8000;

  private get defaultHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
  }

  /**
   * Upload / sync a room to the cloud server so other devices can find it.
   */
  async uploadRoom(room: SharedRoom): Promise<SharedRoom | null> {
    try {
      console.log('[RoomApi] Mengunggah ruangan ke cloud:', room.name, room.inviteCode);
      const result = await firstValueFrom(
        this.http.post<SharedRoom>(`${this.apiUrl}/rooms`, room, {
          headers: this.defaultHeaders,
          withCredentials: false
        }).pipe(
          timeout(this.TIMEOUT_MS),
          catchError(err => {
            console.warn('[RoomApi] Upload room gagal:', err.status, err.message);
            return of(null);
          })
        )
      );
      if (result) {
        console.log('[RoomApi] Ruangan berhasil terunggah ke cloud:', result.inviteCode);
      }
      return result;
    } catch (e: any) {
      console.warn('[RoomApi] Upload room error:', e?.message);
      return null;
    }
  }

  /**
   * Find a room by its invite code (e.g. "CUAN-4X9B" or "4X9B").
   */
  async findRoom(code: string): Promise<SharedRoom | null> {
    try {
      const clean = code.trim().replace(/[^A-Za-z0-9-]/g, '');
      if (!clean) return null;
      console.log('[RoomApi] Mencari ruangan dengan kode:', clean);
      const result = await firstValueFrom(
        this.http.get<SharedRoom>(`${this.apiUrl}/rooms/find/${encodeURIComponent(clean)}`, {
          headers: this.defaultHeaders,
          withCredentials: false
        }).pipe(
          timeout(this.TIMEOUT_MS),
          catchError(err => {
            console.warn('[RoomApi] Cari ruangan gagal:', err.status, err.message);
            return of(null);
          })
        )
      );
      if (result) {
        console.log('[RoomApi] Ruangan ditemukan di cloud:', result.name, result.inviteCode);
      }
      return result;
    } catch (e: any) {
      console.warn('[RoomApi] Find room error:', e?.message);
      return null;
    }
  }

  /**
   * Join an existing room on the cloud server.
   */
  async joinRoom(roomId: string, memberName: string, memberEmail?: string): Promise<SharedRoom | null> {
    try {
      console.log('[RoomApi] Bergabung ke ruangan di cloud:', roomId, memberName);
      const payload = {
        name: memberName,
        email: memberEmail || `${memberName.toLowerCase().replace(/\s+/g, '')}@cuan.app`
      };
      const result = await firstValueFrom(
        this.http.post<SharedRoom>(
          `${this.apiUrl}/rooms/${encodeURIComponent(roomId)}/join`,
          payload,
          {
            headers: this.defaultHeaders,
            withCredentials: false
          }
        ).pipe(
          timeout(this.TIMEOUT_MS),
          catchError(err => {
            console.warn('[RoomApi] Join room gagal:', err.status, err.message);
            return of(null);
          })
        )
      );
      return result;
    } catch (e: any) {
      console.warn('[RoomApi] Join room error:', e?.message);
      return null;
    }
  }

  /**
   * Push latest transactions / savings to the cloud room.
   */
  async syncRoom(
    roomId: string,
    patch: Partial<Pick<SharedRoom, 'transactions' | 'savingsGoals' | 'members'>>
  ): Promise<SharedRoom | null> {
    try {
      const result = await firstValueFrom(
        this.http.put<SharedRoom>(
          `${this.apiUrl}/rooms/${encodeURIComponent(roomId)}`,
          patch,
          {
            headers: this.defaultHeaders,
            withCredentials: false
          }
        ).pipe(
          timeout(this.TIMEOUT_MS),
          catchError(err => {
            console.warn('[RoomApi] Sync room gagal:', err.status, err.message);
            return of(null);
          })
        )
      );
      return result;
    } catch (e: any) {
      console.warn('[RoomApi] Sync room error:', e?.message);
      return null;
    }
  }

  /**
   * Delete or leave a room on the cloud server.
   */
  async deleteOrLeaveRoom(roomId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.apiUrl}/rooms/${encodeURIComponent(roomId)}`, {
          headers: this.defaultHeaders,
          withCredentials: false
        }).pipe(
          timeout(this.TIMEOUT_MS),
          catchError(() => of(null))
        )
      );
    } catch {
      // Ignore
    }
  }
}
