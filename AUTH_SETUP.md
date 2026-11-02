# Authentication setup

The app uses email and password only. There is no Google sign-in or email verification step. A successful registration activates the account and signs the user in immediately.

## Configure the backend

1. Copy `.env.example` to `.env` in the project root. `.env` is ignored by Git; do not put backend secrets in Angular environment files.
2. In MongoDB Atlas, create a database user, allow the API host in Network Access, and set its TLS `mongodb+srv://` connection string as `MONGODB_URI`.
3. Generate a random `SESSION_SECRET` of at least 32 characters. For example, run `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` locally and copy the result into `.env`.
4. Set `APP_BASE_URL` to the exact origin serving the frontend. The development default is `http://localhost:4200`. In production, use HTTPS and set `TRUST_PROXY=true` only when the API is behind a trusted TLS-terminating proxy.
5. Run `npm install` after configuring dependencies, then run `npm start` from the project directory. This starts the Angular app and authentication API; keep the terminal open. The API listens on port 3001 by default.

## Register and sign in

1. Open the app and choose **Belum punya akun? Daftar**.
2. Enter an email and a password of 12-128 characters, confirm the password, then submit.
3. The account is activated immediately, and the app signs the user in and opens Home.

Registration requires no SMTP configuration. The email is used as the account identifier but is not verified as an address the user owns. If an email is already registered, the app asks the user to sign in instead. Users who registered before email verification was removed can submit their email again to activate their pending account and sign in.

Administrators can still provision accounts explicitly when needed:

```powershell
npm run auth:allow-email -- person@example.com
npm run auth:set-password -- person@example.com
```

The password setup command prompts for the new password twice without echoing it to the terminal. Passwords are stored as salted scrypt hashes, never plaintext. Share administrator-set passwords through a separate trusted channel. There is no password-reset email flow.

## Verify the flows

1. Start the app and check `http://localhost:3001/api/auth/status`. `emailPasswordEnabled` and `databaseConnected` should both be `true`.
2. Register a test email and confirm the app immediately signs in and opens Home.
3. Sign out and sign back in using the same email and password.
4. Try registering the same email again; it should ask you to sign in instead of replacing that account's password.
5. In **Pengaturan**, choose **Keluar dari akun**. Confirm `/api/auth/me` returns 401 and the protected Home route redirects to login.
6. Try repeated registrations and incorrect logins to confirm rate limiting, and try opening `/home` in a signed-out browser session to confirm route protection.

The authentication backend uses MongoDB-backed HttpOnly sessions, SameSite=Lax cookies, Secure cookies in production, CSRF checks for POST requests, and rate limits on login and registration. In production, serve the frontend and API on the same site so the session cookie is sent correctly. Since registration does not verify email ownership, consider adding verified email before enabling financial data or account recovery workflows.

## Existing finance data limitation

The current application stores transactions, categories, and settings in browser `localStorage`; it does not have a finance API or shared-room authorization in the backend. Login protects the Home route but does not move existing records to Atlas or make them server-side owner/room protected. No existing records are deleted or migrated by this authentication change.
