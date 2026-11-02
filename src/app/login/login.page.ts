import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular/lazy';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);

  email = '';
  password = '';
  confirmPassword = '';
  isRegistering = false;
  busy = false;
  statusMessage = '';
  statusIsError = false;
  isEmailReadonly = true;
  private returnUrl = '/home';

  ngOnInit(): void {
    this.email = '';
    this.password = '';
    this.confirmPassword = '';
    this.isEmailReadonly = true;

    this.returnUrl = this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));

    if (this.route.snapshot.queryParamMap.has('unavailable')) {
      this.showError('Layanan login belum dapat dihubungi. Silakan coba lagi nanti.');
      return;
    }

    this.auth.loadSession().subscribe({
      next: user => {
        if (user) void this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
      },
      error: () => {
        // Silently handle in local mode
      },
    });
  }

  unlockEmail(): void {
    this.isEmailReadonly = false;
  }

  async login(): Promise<void> {
    const normalizedEmail = this.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      this.showError('Masukkan alamat email yang valid.');
      return;
    }
    if (this.password.length < 6 || this.password.length > 128) {
      this.showError('Kata sandi minimal 6 karakter.');
      return;
    }

    this.busy = true;
    this.statusIsError = false;
    this.statusMessage = '';
    try {
      await this.auth.loginWithPassword(normalizedEmail, this.password);
      this.password = '';
      await this.router.navigateByUrl(this.returnUrl + '?fromLogin=1', { replaceUrl: true });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.showError(error.error?.message || 'Email atau kata sandi salah. Jika belum memiliki akun, silakan daftar.');
      } else if (error instanceof HttpErrorResponse && error.status === 429) {
        this.showError('Terlalu banyak percobaan masuk. Tunggu beberapa menit sebelum mencoba lagi.');
      } else {
        this.showError('Email atau kata sandi salah. Jika belum memiliki akun, silakan daftar.');
      }
    } finally {
      this.busy = false;
    }
  }

  async register(): Promise<void> {
    const normalizedEmail = this.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      this.showError('Masukkan alamat email yang valid.');
      return;
    }
    if (this.password.length < 6 || this.password.length > 128) {
      this.showError('Kata sandi minimal 6 karakter.');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.showError('Konfirmasi kata sandi tidak sama.');
      return;
    }

    this.busy = true;
    this.statusIsError = false;
    this.statusMessage = '';
    try {
      await this.auth.registerWithPassword(normalizedEmail, this.password);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.showError('Email sudah terdaftar. Silakan masuk dengan akun tersebut.');
      } else {
        this.showError('Pendaftaran belum berhasil. Periksa data dan coba lagi.');
      }
      this.busy = false;
      return;
    }

    this.password = '';
    this.confirmPassword = '';
    try {
      const toast = await this.toastController.create({
        message: 'Selamat, akun baru saja dibuat!',
        duration: 3000,
        position: 'top',
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      console.error('Unable to display registration confirmation:', error);
    }

    try {
      await this.router.navigateByUrl(this.returnUrl + '?fromLogin=1', { replaceUrl: true });
    } catch (error) {
      console.error('Unable to navigate after successful registration:', error);
      this.statusMessage = 'Akun berhasil dibuat dan Anda sudah masuk. Buka halaman utama untuk melanjutkan.';
      this.statusIsError = false;
    } finally {
      this.busy = false;
    }
  }

  toggleMode(): void {
    this.isRegistering = !this.isRegistering;
    this.email = '';
    this.password = '';
    this.confirmPassword = '';
    this.isEmailReadonly = true;
    this.statusMessage = '';
    this.statusIsError = false;
  }

  syncEmailFromInput(event: Event): void {
    const detail = (event as CustomEvent<{ value?: string | null }>).detail;
    if (typeof detail?.value === 'string') {
      this.email = detail.value;
    }
  }

  private showError(message: string): void {
    this.statusMessage = message;
    this.statusIsError = true;
  }

  private safeReturnUrl(candidate: string | null): string {
    return candidate?.startsWith('/') && !candidate.startsWith('//') && candidate !== '/login'
      ? candidate
      : '/home';
  }
}
