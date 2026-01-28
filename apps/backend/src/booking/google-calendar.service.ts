// src/google-calendar/google-calendar.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class GoogleCalendarService {
    private readonly logger = new Logger(GoogleCalendarService.name);
    private oauth2Client: OAuth2Client;
    private calendar;

    constructor(private configService: ConfigService) {
        this.oauth2Client = new google.auth.OAuth2(
            this.configService.get<string>('GOOGLE_CLIENT_ID'),
            this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
            this.configService.get<string>('GOOGLE_REDIRECT_URI'),
        );

        this.oauth2Client.setCredentials({
            refresh_token: this.configService.get<string>('GOOGLE_REFRESH_TOKEN'),
        });

        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }

    // google-calendar.service.ts
    async createMeeting(data: {
        summary: string;
        description?: string;
        startDateTime: string;
        endDateTime: string;
        attendees: string[];
    }): Promise<{
        eventId: string;
        meetLink: string;
        htmlLink: string;
    }> {
        try {
            this.logger.log('🔄 Versuche Google Meet zu erstellen...');
            this.logger.log(`   Summary: ${data.summary}`);
            this.logger.log(`   Start: ${data.startDateTime}`);
            this.logger.log(`   End: ${data.endDateTime}`);
            this.logger.log(`   Attendees: ${JSON.stringify(data.attendees)}`);

            const event = {
                summary: data.summary,
                description: data.description || 'Beratungsgespräch',
                start: {
                    dateTime: data.startDateTime,
                    timeZone: 'Europe/Berlin',
                },
                end: {
                    dateTime: data.endDateTime,
                    timeZone: 'Europe/Berlin',
                },
                attendees: data.attendees.map(email => ({ email })),
                conferenceData: {
                    createRequest: {
                        requestId: `meet-${Date.now()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 30 },
                    ],
                },
            };

            this.logger.log('📤 Sende Event an Google Calendar...');
            this.logger.log(`   Event: ${JSON.stringify(event, null, 2)}`);

            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                requestBody: event,
                conferenceDataVersion: 1,
                sendUpdates: 'all',
            });

            const meetLink = response.data.conferenceData?.entryPoints?.[0]?.uri || '';

            this.logger.log(`✅ Google Meet erstellt: ${meetLink}`);

            return {
                eventId: response.data.id,
                meetLink,
                htmlLink: response.data.htmlLink,
            };
        } catch (error) {
            this.logger.error('❌ Fehler beim Erstellen des Google Meets:');
            this.logger.error(`   Message: ${error.message}`);
            this.logger.error(`   Status: ${error.code}`);
            this.logger.error(`   Response: ${JSON.stringify(error.response?.data, null, 2)}`);
            this.logger.error(`   Full Error: ${JSON.stringify(error, null, 2)}`);
            throw new Error(`Google Meet konnte nicht erstellt werden: ${error.message}`);
        }
    }

    async updateMeeting(eventId: string, data: {
        summary?: string;
        description?: string;
        startDateTime?: string;
        endDateTime?: string;
        attendees?: string[];
    }): Promise<void> {
        try {
            const event: any = {};

            if (data.summary) event.summary = data.summary;
            if (data.description) event.description = data.description;
            if (data.startDateTime) {
                event.start = {
                    dateTime: data.startDateTime,
                    timeZone: 'Europe/Berlin',
                };
            }
            if (data.endDateTime) {
                event.end = {
                    dateTime: data.endDateTime,
                    timeZone: 'Europe/Berlin',
                };
            }
            if (data.attendees) {
                event.attendees = data.attendees.map(email => ({ email }));
            }

            await this.calendar.events.patch({
                calendarId: 'primary',
                eventId,
                requestBody: event,
                sendUpdates: 'all',
            });

            this.logger.log(`✅ Google Meet aktualisiert: ${eventId}`);
        } catch (error) {
            this.logger.error('❌ Fehler beim Aktualisieren des Google Meets:', error);
            throw new Error(`Google Meet konnte nicht aktualisiert werden: ${error.message}`);
        }
    }

    async deleteMeeting(eventId: string): Promise<void> {
        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId,
                sendUpdates: 'all',
            });
            this.logger.log(`🗑️ Google Meet gelöscht: ${eventId}`);
        } catch (error) {
            this.logger.error('❌ Fehler beim Löschen des Google Meets:', error);
            // Nicht werfen, da Meeting vielleicht schon gelöscht wurde
        }
    }

    async getMeeting(eventId: string): Promise<any> {
        try {
            const response = await this.calendar.events.get({
                calendarId: 'primary',
                eventId,
            });
            return response.data;
        } catch (error) {
            this.logger.error('❌ Fehler beim Abrufen des Google Meets:', error);
            return null;
        }
    }
}