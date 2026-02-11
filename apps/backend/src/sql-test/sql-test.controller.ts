import { Controller, Post, Body, BadRequestException, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * 🛡️ SQL Test Controller - NUR für Admins!
 * Global JwtAuthGuard ist aktiv + zusätzlich AdminGuard.
 */
@Controller('api/sql')
@UseGuards(AdminGuard)
export class SqlTestController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Post('query')
  async executeQuery(@Body() body: { sql: string }) {
    if (!body.sql || !body.sql.trim()) {
      throw new BadRequestException('SQL-Query darf nicht leer sein');
    }

    // Sicherheitscheck: Nur SELECT erlauben
    const trimmed = body.sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
      throw new BadRequestException('Nur SELECT-Queries erlaubt');
    }

    // Zusätzliche Sicherheit: gefährliche Keywords blocken
    const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'XP_', 'SP_'];
    const upperSql = body.sql.toUpperCase();
    for (const keyword of forbidden) {
      // Prüfe ob das Keyword als eigenes Wort vorkommt (nicht Teil eines Spaltennamens)
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(upperSql) && keyword !== 'SELECT') {
        throw new BadRequestException(`Verbotenes Keyword: ${keyword}`);
      }
    }

    try {
      return await this.databaseService.query(body.sql);
    } catch (error) {
      throw new BadRequestException(`Query-Fehler: ${error.message}`);
    }
  }
}
