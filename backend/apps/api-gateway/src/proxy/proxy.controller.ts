import { All, Controller, Logger, Req, Res, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('api')
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);
  private readonly chatServiceUrl: string;
  private readonly infraServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.chatServiceUrl =
      this.configService?.get<string>('CHAT_SERVICE_URL') ||
      process.env.CHAT_SERVICE_URL ||
      'http://localhost:3010';
    this.infraServiceUrl =
      this.configService?.get<string>('INFRA_SERVICE_URL') ||
      process.env.INFRA_SERVICE_URL ||
      'http://localhost:3020';
  }

  @All('*')
  async forwardAll(@Req() req: Request, @Res() res: Response) {
    // Smart Downstream Routing
    const isChat = req.originalUrl.startsWith('/api/chat');
    const targetBaseUrl = isChat ? this.chatServiceUrl : this.infraServiceUrl;
    const targetUrl = `${targetBaseUrl}${req.originalUrl}`;
    const targetServiceName = isChat ? 'Chat Agent Service (3010)' : 'Infra Service (3020)';

    this.logger.debug(`[Gateway Router] ${req.method} ${req.originalUrl} -> ${targetServiceName}`);

    try {
      const isStream =
        req.headers.accept?.includes('text/event-stream') ||
        req.path.includes('/stream');

      if (isStream) {
        const response = await this.httpService.axiosRef({
          method: req.method as any,
          url: targetUrl,
          data: req.body,
          headers: {
            ...req.headers,
            host: undefined,
          },
          responseType: 'stream',
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        response.data.pipe(res);
        return;
      }

      const response = await this.httpService.axiosRef({
        method: req.method as any,
        url: targetUrl,
        params: req.query,
        data: req.body,
        headers: {
          ...req.headers,
          host: undefined,
        },
      });

      res.status(response.status).json(response.data);
    } catch (err: any) {
      if (err.response) {
        res.status(err.response.status).json(err.response.data);
      } else {
        this.logger.error(`Proxy error connecting to ${targetServiceName}: ${err.message}`);
        res.status(503).json({
          statusCode: 503,
          message: `${targetServiceName} is currently unavailable.`,
          error: err.message,
        });
      }
    }
  }
}
