import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('debug/slow')
  async slowEndpoint(@Query('seconds') seconds = '40') {
    const sec = parseInt(seconds, 10) || 40;
    await new Promise((resolve) => setTimeout(resolve, sec * 1000));
    return { ok: true, waited: sec };
  }
}
