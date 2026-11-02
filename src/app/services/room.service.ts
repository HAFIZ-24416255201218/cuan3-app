import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Transaction } from '../models/finance.model';
import { SavingsGoal } from './savings.service';

export interface RoomMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface SharedRoom {
  id: string;
  name: string;
  inviteCode: string;
  ownerEmail: string;
  createdAt: string;
  members: RoomMember[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
}

const STORAGE_ALL_ROOMS = 'cuan_all_rooms_v1';
const LEGACY_GLOBAL_ACTIVE_ROOM_KEY = 'cuan_active_room_id_v1';

@Injectable({
  providedIn: 'root'
})
export class RoomService {
  private activeRoomSubject = new BehaviorSubject<SharedRoom | null>(null);
  public activeRoom$: Observable<SharedRoom | null> = this.activeRoomSubject.asObservable();
  private currentUserEmail: string | null = null;

  constructor() {
    try {
      localStorage.removeItem(LEGACY_GLOBAL_ACTIVE_ROOM_KEY);
    } catch {
      // Ignore
    }
  }

  public getActiveRoom(): SharedRoom | null {
    return this.activeRoomSubject.value;
  }

  /**
   * Initialize and restore active room strictly for the currently logged-in user.
   * If user has rooms, their room will be restored automatically so it is NEVER lost on logout/login.
   */
  public initForUser(userEmail?: string | null): void {
    if (!userEmail) {
      this.currentUserEmail = null;
      this.activeRoomSubject.next(null);
      return;
    }

    const normalizedEmail = userEmail.trim().toLowerCase();
    this.currentUserEmail = normalizedEmail;

    const userRooms = this.getUserRooms(normalizedEmail);
    const userStorageKey = `cuan_active_room_${normalizedEmail}`;
    const savedRoomId = localStorage.getItem(userStorageKey);

    if (savedRoomId) {
      const room = userRooms.find(
        r => r && (r.id === savedRoomId || r.inviteCode === savedRoomId)
      );

      if (room && this.isUserMemberOrOwner(room, normalizedEmail)) {
        this.activeRoomSubject.next(room);
        return;
      }
    }

    // If user has existing rooms, automatically restore their latest room on login so it is never missing
    if (userRooms.length > 0) {
      const lastActiveId = localStorage.getItem(`cuan_last_room_${normalizedEmail}`);
      const roomToRestore = userRooms.find(r => r && (r.id === lastActiveId || r.inviteCode === lastActiveId)) || userRooms[userRooms.length - 1];
      if (roomToRestore) {
        localStorage.setItem(userStorageKey, roomToRestore.id);
        localStorage.setItem(`cuan_last_room_${normalizedEmail}`, roomToRestore.id);
        this.activeRoomSubject.next(roomToRestore);
        return;
      }
    }

    // Default to null only if the user has truly never created or joined any room
    this.activeRoomSubject.next(null);
  }

  public isUserMemberOrOwner(room: SharedRoom | null, email?: string | null): boolean {
    if (!room || !email) return false;
    const normalized = email.trim().toLowerCase();
    if (room.ownerEmail && room.ownerEmail.trim().toLowerCase() === normalized) {
      return true;
    }
    return Array.isArray(room.members) && room.members.some(m => m && m.email && m.email.trim().toLowerCase() === normalized);
  }

  /**
   * Returns all rooms belonging to or joined by the user.
   * Merges with per-user persistent backup to ensure rooms are never deleted.
   */
  public getUserRooms(email?: string | null): SharedRoom[] {
    if (!email) return [];
    const normalized = email.trim().toLowerCase();
    const allRooms = this.getAllRooms();

    // Merge from account-specific backup if any
    try {
      const backupRaw = localStorage.getItem(`cuan_user_rooms_backup_${normalized}`);
      if (backupRaw) {
        const backupRooms: SharedRoom[] = JSON.parse(backupRaw);
        if (Array.isArray(backupRooms)) {
          let updated = false;
          for (const br of backupRooms) {
            if (br && br.inviteCode && !allRooms[br.inviteCode.toUpperCase()]) {
              allRooms[br.inviteCode.toUpperCase()] = br;
              updated = true;
            }
          }
          if (updated) {
            this.saveAllRooms(allRooms);
          }
        }
      }
    } catch {
      // Ignore
    }

    return Object.values(allRooms).filter(r => this.isUserMemberOrOwner(r, normalized));
  }

  private saveUserRoomsBackup(email: string, room: SharedRoom): void {
    const normalized = email.trim().toLowerCase();
    try {
      const backupRaw = localStorage.getItem(`cuan_user_rooms_backup_${normalized}`);
      let list: SharedRoom[] = backupRaw ? JSON.parse(backupRaw) : [];
      if (!Array.isArray(list)) list = [];
      const index = list.findIndex(r => r && (r.id === room.id || r.inviteCode === room.inviteCode));
      if (index >= 0) {
        list[index] = room;
      } else {
        list.push(room);
      }
      localStorage.setItem(`cuan_user_rooms_backup_${normalized}`, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  /**
   * Merges a room received from the server into local localStorage so it's
   * available for offline use. Returns the stored local copy.
   */
  public mergeServerRoom(serverRoom: SharedRoom): SharedRoom {
    if (!serverRoom || !serverRoom.inviteCode) return serverRoom;
    const allRooms = this.getAllRooms();
    allRooms[serverRoom.inviteCode.toUpperCase()] = serverRoom;
    this.saveAllRooms(allRooms);
    // Also persist per-owner backup so it survives cache clears
    if (serverRoom.ownerEmail) {
      this.saveUserRoomsBackup(serverRoom.ownerEmail, serverRoom);
    }
    return serverRoom;
  }

  public createRoom(name: string, ownerEmail: string, ownerName?: string): SharedRoom {
    const normalizedEmail = ownerEmail.trim().toLowerCase();
    const inviteCode = this.generateInviteCode();
    const roomId = 'room_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const displayName = ownerName?.trim() || normalizedEmail.split('@')[0] || 'Pemilik Ruang';

    const newRoom: SharedRoom = {
      id: roomId,
      name: name.trim(),
      inviteCode,
      ownerEmail: normalizedEmail,
      createdAt: new Date().toISOString(),
      members: [
        {
          id: 'usr_' + Date.now().toString(36),
          name: displayName,
          email: normalizedEmail,
          role: 'owner',
          joinedAt: new Date().toISOString()
        }
      ],
      transactions: [],
      savingsGoals: []
    };

    const allRooms = this.getAllRooms();
    allRooms[inviteCode.toUpperCase()] = newRoom;
    this.saveAllRooms(allRooms);
    this.saveUserRoomsBackup(normalizedEmail, newRoom);

    this.setActiveRoom(newRoom, normalizedEmail);
    return newRoom;
  }

  /**
   * Intelligently and safely finds a room by:
   * 1. Exact full inviteCode (e.g. "CUAN-KE62" or "CUAN-NL6N")
   * 2. Only the random number/suffix (e.g. "NL6N" or "nl6n")
   * 3. Codes with or without hyphens or spaces (e.g. "CUAN NL6N", "C U A N - N L 6 N")
   * 4. Internal Room ID
   */
  public findRoomByAnyCode(inputCode: string): SharedRoom | null {
    if (!inputCode) return null;
    const raw = String(inputCode).trim();
    if (!raw) return null;

    const allRooms = this.getAllRooms();
    const roomsList = Object.values(allRooms).filter((r): r is SharedRoom => 
      !!r && typeof r === 'object' && typeof r.inviteCode === 'string' && r.inviteCode.trim().length > 0
    );

    const upper = raw.toUpperCase();
    const cleanAlphaNum = upper.replace(/[^A-Z0-9]/g, '');

    // 1. Direct match on inviteCode or ID
    let found = roomsList.find(r => 
      (r.inviteCode && r.inviteCode.toUpperCase() === upper) || (r.id && r.id === raw)
    );
    if (found) return found;

    if (!cleanAlphaNum) return null;

    // 2. Alphanumeric stripped match (ignore hyphens, spaces, underscores)
    found = roomsList.find(r => {
      const roomClean = (r.inviteCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return roomClean === cleanAlphaNum;
    });
    if (found) return found;

    // 3. User entered only the random suffix (e.g. "NL6N" instead of "CUAN-NL6N")
    found = roomsList.find(r => {
      const parts = (r.inviteCode || '').toUpperCase().split('-');
      if (parts.length > 1) {
        const randomPart = parts[parts.length - 1].replace(/[^A-Z0-9]/g, '');
        if (randomPart && randomPart === cleanAlphaNum) {
          return true;
        }
      }
      const roomClean = (r.inviteCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return roomClean.endsWith(cleanAlphaNum);
    });
    if (found) return found;

    // 4. Auto-prefix with "CUAN-"
    if (!upper.startsWith('CUAN-')) {
      const withPrefix = `CUAN-${cleanAlphaNum}`;
      found = roomsList.find(r => (r.inviteCode || '').toUpperCase() === withPrefix);
      if (found) return found;
    }

    return null;
  }

  public joinRoom(inviteCodeInput: string, userEmail: string, userName?: string): SharedRoom {
    const raw = String(inviteCodeInput || '').trim();
    if (!raw) {
      throw new Error('Masukkan kode undangan ruangan.');
    }

    const normalizedEmail = userEmail.trim().toLowerCase();
    const room = this.findRoomByAnyCode(raw);

    if (!room) {
      throw new Error('Kode ruangan tidak ditemukan. Pastikan kode yang dimasukkan benar dan ruangan sudah dibuat.');
    }

    const displayName = userName?.trim() || normalizedEmail.split('@')[0] || 'Anggota';
    const isOwner = room.ownerEmail && room.ownerEmail.trim().toLowerCase() === normalizedEmail;
    const isMember = Array.isArray(room.members) && room.members.some(m => m && m.email && m.email.trim().toLowerCase() === normalizedEmail);

    if (!isMember && !isOwner) {
      room.members = room.members || [];
      room.members.push({
        id: 'usr_' + Date.now().toString(36),
        name: displayName,
        email: normalizedEmail,
        role: 'member',
        joinedAt: new Date().toISOString()
      });
      const allRooms = this.getAllRooms();
      allRooms[(room.inviteCode || '').toUpperCase()] = room;
      this.saveAllRooms(allRooms);
    }

    this.saveUserRoomsBackup(normalizedEmail, room);
    this.setActiveRoom(room, normalizedEmail);
    return room;
  }

  public setActiveRoom(room: SharedRoom | null, userEmail?: string | null): void {
    const email = (userEmail || this.currentUserEmail)?.trim().toLowerCase();

    if (room && email) {
      if (!this.isUserMemberOrOwner(room, email)) {
        console.warn(`User ${email} is not authorized for room ${room.name}`);
        this.activeRoomSubject.next(null);
        return;
      }
      localStorage.setItem(`cuan_active_room_${email}`, room.id);
      localStorage.setItem(`cuan_last_room_${email}`, room.id);
      this.activeRoomSubject.next(room);
    } else {
      if (email) {
        localStorage.removeItem(`cuan_active_room_${email}`);
      }
      this.activeRoomSubject.next(null);
    }
  }

  public removeRoomFromUserBackup(email: string, roomIdOrCode: string): void {
    const normalized = email.trim().toLowerCase();
    try {
      const backupRaw = localStorage.getItem(`cuan_user_rooms_backup_${normalized}`);
      if (!backupRaw) return;
      let list: SharedRoom[] = JSON.parse(backupRaw);
      if (Array.isArray(list)) {
        list = list.filter(r => r && r.id !== roomIdOrCode && r.inviteCode !== roomIdOrCode);
        localStorage.setItem(`cuan_user_rooms_backup_${normalized}`, JSON.stringify(list));
      }
    } catch {
      // Ignore
    }
  }

  public deleteRoom(roomIdOrCode: string, userEmail?: string | null): void {
    const email = (userEmail || this.currentUserEmail)?.trim().toLowerCase();
    const allRooms = this.getAllRooms();
    const room = this.findRoomByAnyCode(roomIdOrCode);
    if (!room) return;

    delete allRooms[(room.inviteCode || '').toUpperCase()];
    this.saveAllRooms(allRooms);

    if (email) {
      this.removeRoomFromUserBackup(email, room.id);
      this.removeRoomFromUserBackup(email, room.inviteCode);
    }

    const current = this.activeRoomSubject.value;
    if (current && (current.id === room.id || current.inviteCode === room.inviteCode)) {
      this.setActiveRoom(null, email);
    }
  }

  public leaveRoom(userEmail?: string | null): void {
    const email = (userEmail || this.currentUserEmail)?.trim().toLowerCase();
    const current = this.activeRoomSubject.value;

    if (current && email) {
      const allRooms = this.getAllRooms();
      const room = allRooms[(current.inviteCode || '').toUpperCase()] || this.findRoomByAnyCode(current.inviteCode);
      if (room) {
        if (room.ownerEmail && room.ownerEmail.toLowerCase() === email) {
          // If owner leaves or deletes, remove room from allRooms
          delete allRooms[(room.inviteCode || '').toUpperCase()];
          this.saveAllRooms(allRooms);
        } else if (room.members) {
          room.members = room.members.filter(m => m && m.email && m.email.trim().toLowerCase() !== email);
          allRooms[(room.inviteCode || '').toUpperCase()] = room;
          this.saveAllRooms(allRooms);
        }
      }
      this.removeRoomFromUserBackup(email, current.id);
      this.removeRoomFromUserBackup(email, current.inviteCode);
    }

    this.setActiveRoom(null, email);
  }

  public updateActiveRoomData(transactions?: Transaction[], savingsGoals?: SavingsGoal[]): void {
    const current = this.activeRoomSubject.value;
    if (!current) return;

    const allRooms = this.getAllRooms();
    const room = allRooms[(current.inviteCode || '').toUpperCase()] || current;

    if (transactions) {
      room.transactions = transactions;
    }
    if (savingsGoals) {
      room.savingsGoals = savingsGoals;
    }

    allRooms[(room.inviteCode || '').toUpperCase()] = room;
    this.saveAllRooms(allRooms);
    if (this.currentUserEmail) {
      this.saveUserRoomsBackup(this.currentUserEmail, room);
    }
    this.activeRoomSubject.next({ ...room });
  }

  public getAllRooms(): Record<string, SharedRoom> {
    try {
      const data = localStorage.getItem(STORAGE_ALL_ROOMS);
      const rawAll: Record<string, any> = data ? JSON.parse(data) : {};
      const all: Record<string, SharedRoom> = {};

      for (const k of Object.keys(rawAll)) {
        const item = rawAll[k];
        if (item && typeof item === 'object' && typeof item.inviteCode === 'string' && item.inviteCode.trim().length > 0) {
          all[item.inviteCode.toUpperCase()] = item;
        }
      }

      // Also scan and merge from all user backups in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cuan_user_rooms_backup_')) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list: any[] = JSON.parse(raw);
              if (Array.isArray(list)) {
                for (const r of list) {
                  if (r && typeof r === 'object' && typeof r.inviteCode === 'string' && r.inviteCode.trim().length > 0) {
                    all[r.inviteCode.toUpperCase()] = r;
                  }
                }
              }
            }
          } catch {
            // Ignore
          }
        }
      }

      return all;
    } catch {
      return {};
    }
  }

  private saveAllRooms(rooms: Record<string, SharedRoom>): void {
    try {
      localStorage.setItem(STORAGE_ALL_ROOMS, JSON.stringify(rooms));
    } catch {
      // Ignore
    }
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `CUAN-${randomPart}`;
  }
}
