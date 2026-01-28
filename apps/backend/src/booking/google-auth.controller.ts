// src/auth/google-auth.controller.ts
import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { Response } from 'express';

@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(private configService: ConfigService) {}

  @Get('login')
  async googleLogin(@Res() res: Response) {
    const oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      'http://localhost:3000/auth/google/callback',
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      prompt: 'consent',
    });

    this.logger.log('🔗 Redirecting to Google OAuth...');
    res.redirect(url);
  }

  @Get('callback')
  async googleCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.send('❌ Kein Code erhalten. Bitte versuche es erneut.');
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        this.configService.get<string>('GOOGLE_CLIENT_ID'),
        this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
        'http://localhost:3000/auth/google/callback',
      );

      const { tokens } = await oauth2Client.getToken(code);

      this.logger.log('✅ Tokens erfolgreich erhalten!');
      this.logger.log(`Refresh Token: ${tokens.refresh_token}`);

      return res.send(`
        <html>
          <head>
            <title>Google OAuth Erfolgreich</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
                background: #f5f5f5;
              }
              .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .token {
                background: #f0f0f0;
                padding: 15px;
                border-radius: 5px;
                word-break: break-all;
                font-family: monospace;
                margin: 20px 0;
              }
              .success {
                color: #22c55e;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .instructions {
                background: #fef3c7;
                padding: 15px;
                border-radius: 5px;
                border-left: 4px solid #f59e0b;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅ Erfolgreich authentifiziert!</div>
              <h2>Dein Refresh Token:</h2>
              <div class="token">${tokens.refresh_token}</div>
              
              <div class="instructions">
                <strong>📝 Nächste Schritte:</strong>
                <ol>
                  <li>Kopiere den obigen Refresh Token</li>
                  <li>Füge ihn in deine <code>.env</code> Datei ein:</li>
                  <li><code>GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}</code></li>
                  <li>Starte deinen Server neu</li>
                  <li>Du kannst diesen Controller jetzt löschen!</li>
                </ol>
              </div>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      this.logger.error('❌ Fehler beim Token-Austausch:', error);
      return res.send(`❌ Fehler: ${error.message}`);
    }
  }
}