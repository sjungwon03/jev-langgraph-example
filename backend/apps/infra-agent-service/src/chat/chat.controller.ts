import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatMessageInputDto, ConfirmActionDto } from '@nest-msa/contracts';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('Chatbot & Agent')
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @ApiOperation({ summary: 'Send message to LangGraph agent and receive real-time SSE stream' })
  streamChat(@Body() dto: ChatMessageInputDto, @Res() res: Response) {
    return this.chatService.streamChat(dto, res);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Submit approval or rejection for a safety-gated destructive action' })
  confirmAction(@Body() dto: ConfirmActionDto) {
    return this.chatService.confirmAction(dto);
  }

  @Get('history/:threadId')
  @ApiOperation({ summary: 'Get conversation history for a specific thread' })
  getHistory(@Param('threadId') threadId: string) {
    return this.chatService.getHistory(threadId);
  }
}
